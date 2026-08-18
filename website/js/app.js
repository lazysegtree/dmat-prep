import { PuzzleUI } from './puzzle-ui.js';
import {
  SYMBOLS,
  TARGET_SECONDS,
  SessionClock,
  answerStatus,
  editableComplete,
  emptyAnswer,
  formatTime,
  median,
  progressStore,
  summarizeProgress,
} from './session.js';

const app = document.querySelector('#app');
const homeButton = document.querySelector('#home-button');
const SITE_ROOT = new URL('../', import.meta.url);
const INITIAL_PAGE = document.body.dataset.page || 'home';
const ROUTE_PATHS = {
  home: '',
  learn: 'latin-squares/learn/',
  drill: 'latin-squares/speed-drill/',
  mock: 'latin-squares/mock/',
  progress: 'latin-squares/progress/',
};
const MODE_NAMES = { learn: 'Learn', drill: 'Speed Drill', mock: 'Full dMAT Mock' };
const DIFFICULTY_NAMES = { easy: 'Easy', exam: 'Exam Standard', hard: 'Hard', extreme: 'Extreme' };
const QUESTION_TYPE_NAMES = { target: 'Find the ?', full: 'Complete the grid' };
const PUZZLE_FORMAT_VERSION = 1;

let bank = [];
let activeSession = null;
let puzzleUi = null;
let clock = null;
let lastResult = null;

function stopInteractiveState() {
  puzzleUi?.destroy();
  puzzleUi = null;
  clock?.stop();
  clock = null;
}

function focusMain() {
  app.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function confirmLeave() {
  if (!activeSession || activeSession.mode === 'learn') return true;
  return window.confirm('Leave this session? Your current answers will not be saved.');
}

function routeUrl(route, parameters = {}) {
  const url = new URL(ROUTE_PATHS[route], SITE_ROOT);
  Object.entries(parameters).forEach(([name, value]) => {
    if (value !== null && value !== undefined && value !== '') url.searchParams.set(name, value);
  });
  return url.href;
}

function navigateTo(route, parameters = {}, force = false) {
  if (!force && !confirmLeave()) return;
  stopInteractiveState();
  activeSession = null;
  window.location.assign(routeUrl(route, parameters));
}

function goHome(force = false) {
  navigateTo('home', {}, force);
}

function renderHome() {
  app.innerHTML = `
    <section>
      <p class="eyebrow">5 × 5 Latin squares</p>
      <h1>Train accuracy.<br />Then train speed.</h1>
      <p class="lede">Find the value of one target cell mentally, as in the dMAT. Intermediate cells stay empty and cannot be filled.</p>
      <div class="home-actions" aria-label="Training modes">
        <a class="mode-card" href="${routeUrl('learn')}">
          <strong>Learn</strong>
          <span>Practise generated target-cell puzzles without a timer, with one deduction hint.</span>
        </a>
        <a class="mode-card" href="${routeUrl('drill')}">
          <strong>Speed Drill</strong>
          <span>Practise 10 generated target-cell questions at pace.</span>
        </a>
        <a class="mode-card" href="${routeUrl('mock')}">
          <strong>Full Mock</strong>
          <span>20 exam-style “Find the ?” questions in 25 minutes.</span>
        </a>
        <a class="mode-card" href="${routeUrl('progress')}">
          <strong>Progress</strong>
          <span>Review recent accuracy, speed, and mock scores.</span>
        </a>
      </div>
    </section>`;
  focusMain();
}

function difficultyFromUrl() {
  const url = new URL(window.location.href);
  const difficulty = url.searchParams.get('difficulty');
  if (!difficulty) return 'exam';
  if (Object.hasOwn(DIFFICULTY_NAMES, difficulty)) return difficulty;
  url.searchParams.delete('difficulty');
  window.history.replaceState(null, '', url);
  return 'exam';
}

function updateDifficultyUrl(difficulty) {
  const url = new URL(window.location.href);
  url.searchParams.delete('puzzle');
  url.searchParams.set('difficulty', difficulty);
  window.history.replaceState(null, '', url);
}

function renderSetup(mode, difficulty = 'exam') {
  const isLearn = mode === 'learn';
  app.innerHTML = `
    <section class="panel">
      <p class="eyebrow">${MODE_NAMES[mode]}</p>
      <h1>${isLearn ? 'Practise a deduction.' : 'Build a steady pace.'}</h1>
      <p class="muted">${isLearn ? 'Take as long as you need. A hint is available if you get stuck.' : 'Complete 10 questions with no feedback until the end.'}</p>
      <p class="notice">Each generated puzzle asks for one <strong>?</strong> cell. Work out any intermediate deductions mentally.${isLearn ? '' : ' The 10-question target is 12:30.'}</p>
      <div class="field">
        <label for="difficulty">Training difficulty</label>
        <select id="difficulty">
          <option value="easy"${difficulty === 'easy' ? ' selected' : ''}>Easy — frequent forced placements</option>
          <option value="exam"${difficulty === 'exam' ? ' selected' : ''}>Exam Standard — provisional training level</option>
          <option value="hard"${difficulty === 'hard' ? ' selected' : ''}>Hard — longer deduction chains</option>
          <option value="extreme"${difficulty === 'extreme' ? ' selected' : ''}>Extreme — deliberate overtraining</option>
        </select>
        <p class="small muted">“Exam Standard” is a provisional label and is not officially calibrated.</p>
      </div>
      <div class="button-row">
        <button class="button" id="start-session" type="button">Start ${MODE_NAMES[mode]}</button>
        <a class="button secondary" href="${routeUrl('home')}">Back</a>
      </div>
    </section>`;
  const difficultySelect = app.querySelector('#difficulty');
  difficultySelect.addEventListener('change', () => updateDifficultyUrl(difficultySelect.value));
  app.querySelector('#start-session').addEventListener('click', () => {
    updateDifficultyUrl(difficultySelect.value);
    startSession(mode, difficultySelect.value);
  });
  focusMain();
}

function renderMockIntro() {
  app.innerHTML = `
    <section class="panel">
      <p class="eyebrow">Full dMAT Mock</p>
      <h1>20 “Find the ?” questions. 25 minutes.</h1>
      <p class="muted">Each question accepts one answer only. Intermediate cells must be worked out mentally. The timer starts immediately.</p>
      <ul>
        <li>All questions are selected before the mock begins.</li>
        <li>The mock submits automatically when time runs out.</li>
        <li>Difficulty is selected internally.</li>
      </ul>
      <div class="button-row">
        <button class="button" id="start-mock" type="button">Start Mock</button>
        <a class="button secondary" href="${routeUrl('home')}">Back</a>
      </div>
    </section>`;
  app.querySelector('#start-mock').addEventListener('click', () => startSession('mock'));
  focusMain();
}

function shuffle(values) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

function puzzleDifficulty(puzzle) {
  return puzzle.difficulty.targetCell;
}

function choosePuzzles(mode, difficulty) {
  if (mode !== 'mock') {
    const count = mode === 'learn' ? 1 : 10;
    return shuffle(bank.filter((puzzle) => puzzleDifficulty(puzzle) === difficulty)).slice(0, count);
  }
  const mix = [
    ...shuffle(bank.filter((puzzle) => puzzleDifficulty(puzzle) === 'easy')).slice(0, 3),
    ...shuffle(bank.filter((puzzle) => puzzleDifficulty(puzzle) === 'exam')).slice(0, 11),
    ...shuffle(bank.filter((puzzle) => puzzleDifficulty(puzzle) === 'hard')).slice(0, 6),
  ];
  return shuffle(mix);
}

function startSession(mode, difficulty = null, selectedPuzzles = null) {
  stopInteractiveState();
  const puzzles = selectedPuzzles || choosePuzzles(mode, difficulty);
  if (mode === 'learn') {
    const puzzleUrl = new URL(routeUrl('learn'));
    puzzleUrl.searchParams.set('puzzle', puzzles[0].id);
    window.history.replaceState(null, '', puzzleUrl);
  }
  activeSession = {
    mode,
    difficulty,
    questionType: 'target',
    puzzles,
    answers: puzzles.map(emptyAnswer),
    questionTimes: puzzles.map(() => 0),
    current: 0,
    enteredQuestionAt: Date.now(),
    startedAt: Date.now(),
    hintUsed: false,
  };
  renderPlay();

  if (mode === 'drill') {
    clock = new SessionClock({ onTick: (display) => updateTimer(display, false) });
  } else if (mode === 'mock') {
    clock = new SessionClock({
      duration: 25 * 60,
      onTick: (display) => updateTimer(display, display <= 60),
      onExpire: () => finishSession(true),
    });
  }
}

function updateTimer(seconds, urgent) {
  const timer = document.querySelector('#timer-value');
  if (!timer) return;
  timer.textContent = formatTime(seconds);
  timer.classList.toggle('urgent', urgent);
}

function recordCurrentQuestionTime() {
  if (!activeSession) return;
  const elapsed = (Date.now() - activeSession.enteredQuestionAt) / 1000;
  activeSession.questionTimes[activeSession.current] += elapsed;
  activeSession.enteredQuestionAt = Date.now();
}

function renderPlay() {
  puzzleUi?.destroy();
  const session = activeSession;
  const puzzle = session.puzzles[session.current];
  const timed = session.mode !== 'learn';
  const timerLabel = session.mode === 'mock' ? 'Time remaining' : 'Time elapsed';

  app.innerHTML = `
    <section>
      <div class="play-header">
        <div>
          <p class="eyebrow">${MODE_NAMES[session.mode]} · ${QUESTION_TYPE_NAMES[session.questionType]}${session.difficulty ? ` · ${DIFFICULTY_NAMES[session.difficulty]}` : ''}</p>
          <h2>${session.puzzles.length === 1 ? 'Puzzle' : `Question ${session.current + 1} of ${session.puzzles.length}`}</h2>
          <p class="small muted">Puzzle ID: ${puzzle.id}</p>
        </div>
        ${timed ? `<div class="timer"><span class="timer-label">${timerLabel}</span><strong class="timer-value" id="timer-value">${session.mode === 'mock' ? '25:00' : '0:00'}</strong></div>` : ''}
      </div>
      <div class="play-layout">
        <div class="grid-wrap">
          <div id="puzzle-grid"></div>
          <div class="symbol-pad" aria-label="Enter a symbol">
            ${SYMBOLS.map((symbol) => `<button class="symbol-key" type="button" data-symbol="${symbol}">${symbol}</button>`).join('')}
            <button class="symbol-key clear" type="button" data-clear aria-label="Clear selected cell">Clear</button>
          </div>
        </div>
        <aside class="side-panel">
          <p class="muted">Answer only the ? cell. Keep intermediate deductions in your head.</p>
          ${session.puzzles.length > 1 ? `
            <h3>Questions</h3>
            <div class="navigator" aria-label="Question navigator">
              ${session.puzzles.map((item, index) => {
                const answered = editableComplete(item, session.answers[index], session.questionType);
                return `<button class="nav-question${answered ? ' answered' : ''}${index === session.current ? ' current' : ''}" type="button" data-question="${index}" aria-label="Question ${index + 1}${answered ? ', answered' : ', unanswered'}" ${index === session.current ? 'aria-current="true"' : ''}>${index + 1}</button>`;
              }).join('')}
            </div>
            <div class="legend"><span class="legend-item answered">Answered</span><span class="legend-item">Unanswered</span></div>
          ` : '<p class="small muted">You can use the A–E keys. Backspace or Delete clears the answer.</p>'}
          ${session.mode === 'learn' ? '<div id="hint-area"></div>' : ''}
          <div class="session-actions">
            ${session.mode === 'learn' ? '<button class="button secondary" id="show-hint" type="button">Show a hint</button>' : ''}
            ${session.puzzles.length > 1 ? `
              <div class="button-row">
                <button class="button secondary" id="previous-question" type="button" ${session.current === 0 ? 'disabled' : ''}>Previous</button>
                <button class="button secondary" id="next-question" type="button" ${session.current === session.puzzles.length - 1 ? 'disabled' : ''}>Next</button>
              </div>` : ''}
            <button class="button" id="submit-session" type="button">${session.mode === 'learn' ? 'Check answer' : `Submit ${MODE_NAMES[session.mode]}`}</button>
            <button class="button secondary" id="leave-session" type="button">Leave session</button>
          </div>
        </aside>
      </div>
    </section>`;

  puzzleUi = new PuzzleUI(app.querySelector('#puzzle-grid'), {
    puzzle,
    values: session.answers[session.current],
    questionType: session.questionType,
    onChange: () => updateNavigatorState(),
  });
  app.querySelectorAll('[data-symbol]').forEach((button) => button.addEventListener('click', () => puzzleUi.enter(button.dataset.symbol)));
  app.querySelector('[data-clear]').addEventListener('click', () => puzzleUi.clear());
  app.querySelectorAll('[data-question]').forEach((button) => button.addEventListener('click', () => changeQuestion(Number(button.dataset.question))));
  app.querySelector('#previous-question')?.addEventListener('click', () => changeQuestion(session.current - 1));
  app.querySelector('#next-question')?.addEventListener('click', () => changeQuestion(session.current + 1));
  app.querySelector('#show-hint')?.addEventListener('click', showHint);
  app.querySelector('#submit-session').addEventListener('click', () => {
    if (session.mode === 'mock' && !window.confirm('Submit this mock now? You will not be able to change your answers.')) return;
    finishSession(false);
  });
  app.querySelector('#leave-session').addEventListener('click', () => goHome());
  focusMain();
}

function updateNavigatorState() {
  if (!activeSession || activeSession.puzzles.length === 1) return;
  const current = activeSession.current;
  const answered = editableComplete(activeSession.puzzles[current], activeSession.answers[current], activeSession.questionType);
  const button = app.querySelector(`[data-question="${current}"]`);
  button?.classList.toggle('answered', answered);
  button?.setAttribute('aria-label', `Question ${current + 1}, ${answered ? 'answered' : 'unanswered'}`);
}

function changeQuestion(index) {
  if (!activeSession || index < 0 || index >= activeSession.puzzles.length || index === activeSession.current) return;
  recordCurrentQuestionTime();
  activeSession.current = index;
  renderPlay();
  if (clock) {
    const elapsed = clock.elapsed();
    const display = activeSession.mode === 'mock' ? 25 * 60 - elapsed : elapsed;
    updateTimer(display, activeSession.mode === 'mock' && display <= 60);
  }
}

function showHint() {
  const puzzle = activeSession.puzzles[0];
  const hint = puzzle.hints?.targetCell?.[0];
  if (!hint) return;
  activeSession.hintUsed = true;
  app.querySelector('#hint-area').innerHTML = `<div class="hint-box"><strong>Look at row ${hint.row + 1}, column ${hint.column + 1}.</strong><br />${hint.text}</div>`;
  app.querySelector('#show-hint').disabled = true;
  puzzleUi.showHint(hint.row, hint.column);
}

function finishSession(automatic) {
  if (!activeSession) return;
  recordCurrentQuestionTime();
  const session = activeSession;
  const elapsed = clock ? clock.stop() : Math.floor((Date.now() - session.startedAt) / 1000);
  clock = null;
  const totalTime = session.mode === 'mock' ? Math.min(25 * 60, elapsed) : elapsed;
  const statuses = session.puzzles.map((puzzle, index) => answerStatus(puzzle, session.answers[index], session.questionType));
  const correct = statuses.filter((status) => status === 'correct').length;
  const incorrect = statuses.filter((status) => status === 'incorrect').length;
  const unanswered = statuses.filter((status) => status === 'unanswered').length;
  const result = {
    id: `${Date.now()}-${session.mode}`,
    date: new Date().toISOString(),
    mode: session.mode,
    difficulty: session.difficulty,
    questionType: session.questionType,
    questionCount: session.puzzles.length,
    correct,
    incorrect,
    unanswered,
    totalTime,
    timeRemaining: session.mode === 'mock' ? Math.max(0, 25 * 60 - totalTime) : null,
    questionTimes: session.questionTimes.map((value) => Math.round(value)),
    puzzleIds: session.puzzles.map((puzzle) => puzzle.id),
    answers: session.answers,
    solutions: session.puzzles.map((puzzle) => puzzle.solution),
    startingGrids: session.puzzles.map((puzzle) => puzzle.grid),
    targets: session.puzzles.map((puzzle) => puzzle.target),
    statuses,
    hintUsed: session.hintUsed,
    automatic,
  };
  progressStore.add(result);
  lastResult = result;
  stopInteractiveState();
  activeSession = null;
  renderResults(result, result.mode === 'learn' ? 0 : null);
}

function resultMetrics(result) {
  const common = `
    <div class="metric"><span>Correct</span><strong>${result.correct}</strong></div>
    <div class="metric"><span>Incorrect</span><strong>${result.incorrect}</strong></div>
    <div class="metric"><span>Unanswered</span><strong>${result.unanswered}</strong></div>
    <div class="metric"><span>Total time</span><strong>${formatTime(result.totalTime)}</strong></div>`;
  if (result.mode === 'learn') return common;
  return `${common}
    <div class="metric"><span>Median / question</span><strong>${formatTime(median(result.questionTimes))}</strong></div>
    <div class="metric"><span>Over 75 seconds</span><strong>${result.questionTimes.filter((time) => time > TARGET_SECONDS).length}</strong></div>
    ${result.mode === 'mock' ? `<div class="metric"><span>Time remaining</span><strong>${formatTime(result.timeRemaining)}</strong></div>` : '<div class="metric"><span>Target total</span><strong>12:30</strong></div>'}`;
}

function renderResults(result, reviewIndex = null) {
  const title = result.mode === 'mock' ? `${result.correct} out of 20` : result.correct === result.questionCount ? 'All correct' : `${result.correct} of ${result.questionCount} correct`;
  const slowest = result.questionTimes
    .map((time, index) => ({ time, index }))
    .sort((a, b) => b.time - a.time)
    .slice(0, 3);
  app.innerHTML = `
    <section>
      <p class="eyebrow">${MODE_NAMES[result.mode]} · ${QUESTION_TYPE_NAMES[result.questionType || 'full']} results</p>
      <h1>${title}</h1>
      <p class="lede">${result.automatic ? 'Time expired, so the mock was submitted automatically.' : 'Review each answer and note where accuracy or time was lost.'}</p>
      <div class="results-summary">${resultMetrics(result)}</div>
      ${result.mode !== 'learn' ? `<h2>Slowest questions</h2><p class="muted">${slowest.map((item) => `Q${item.index + 1} (${formatTime(item.time)})`).join(' · ')}</p>` : ''}
      <h2>Question review</h2>
      <div class="review-list">
        ${result.statuses.map((status, index) => `
          <div class="review-row">
            <strong>Q${index + 1}</strong>
            <div><span class="status ${status}">${status[0].toUpperCase() + status.slice(1)}</span><br /><span class="small muted">${result.puzzleIds[index]} · ${formatTime(result.questionTimes[index])}</span></div>
            <button class="button secondary" type="button" data-review="${index}">Review</button>
          </div>`).join('')}
      </div>
      <div id="review-detail"></div>
      <div class="button-row">
        <button class="button" id="repeat-mode" type="button">${result.mode === 'mock' ? 'Take another mock' : `New ${MODE_NAMES[result.mode]}`}</button>
        <button class="button secondary" id="results-home" type="button">Home</button>
      </div>
    </section>`;
  app.querySelectorAll('[data-review]').forEach((button) => button.addEventListener('click', () => showReviewDetail(result, Number(button.dataset.review))));
  app.querySelector('#repeat-mode').addEventListener('click', () => {
    navigateTo(result.mode, result.difficulty ? { difficulty: result.difficulty } : {});
  });
  app.querySelector('#results-home').addEventListener('click', () => goHome());
  if (reviewIndex !== null) showReviewDetail(result, reviewIndex);
  focusMain();
}

function cellStatusGrid(result, index) {
  return result.answers[index].map((row, rowIndex) => row.map((value, columnIndex) => {
    if (result.startingGrids[index][rowIndex][columnIndex]) return '';
    if (result.questionType === 'target') {
      const target = result.targets[index];
      if (target.row !== rowIndex || target.column !== columnIndex || !value) return '';
      return value === target.value ? 'correct' : 'incorrect';
    }
    if (!value) return '';
    return value === result.solutions[index][rowIndex][columnIndex] ? 'correct' : 'incorrect';
  }));
}

function readonlyGrid(values, givens, statuses = null, label = 'Latin square', target = null, showQuestionMark = false) {
  return `<div class="latin-grid${target ? ' target-mode' : ''}" role="grid" aria-label="${label}">
    ${values.flatMap((row, rowIndex) => row.map((value, columnIndex) => {
      const classes = ['cell'];
      const isTarget = target?.row === rowIndex && target?.column === columnIndex;
      if (givens?.[rowIndex]?.[columnIndex]) classes.push('given');
      if (isTarget) classes.push('target-cell');
      if (statuses?.[rowIndex]?.[columnIndex]) classes.push(statuses[rowIndex][columnIndex]);
      return `<div class="${classes.join(' ')}" role="gridcell">${value || (isTarget && showQuestionMark ? '?' : '')}</div>`;
    })).join('')}
  </div>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function cellName(cell) {
  return `R${cell.row + 1}C${cell.column + 1}`;
}

function reviewMethodMarkup(puzzle) {
  if (!puzzle?.bestMethod?.length) {
    return `
      <section class="inference-path" aria-labelledby="review-method-title">
        <h3 id="review-method-title">Efficient solution path</h3>
        <p class="muted">The deduction path is unavailable for this puzzle.</p>
      </section>`;
  }
  const method = puzzle.bestMethod;
  const level = DIFFICULTY_NAMES[puzzle.difficulty.targetCell] || puzzle.difficulty.targetCell;
  return `
    <section class="inference-path" aria-labelledby="review-method-title">
      <div class="inference-path-header">
        <div>
          <h3 id="review-method-title">Efficient solution path</h3>
          <p class="small muted">The lowest-effort chain found using the trainer’s supported deduction rules.</p>
        </div>
        <p class="inference-summary"><strong>${method.length} deduction${method.length === 1 ? '' : 's'}</strong><span>${escapeHtml(level)} · score ${puzzle.difficulty.score}</span></p>
      </div>
      <ol class="inference-steps">
        ${method.map((inference, step) => {
          const placement = inference.placement;
          const isTarget = placement.row === puzzle.target.row && placement.column === puzzle.target.column;
          return `
            <li class="inference-step${isTarget ? ' target' : ''}">
              <div class="inference-step-heading">
                <span class="inference-step-number" aria-hidden="true">${step + 1}</span>
                <strong>${cellName(placement)} = ${escapeHtml(placement.value)}</strong>
                ${isTarget ? '<span class="target-badge">Target</span>' : ''}
              </div>
              <p>${escapeHtml(inference.details)}</p>
            </li>`;
        }).join('')}
      </ol>
    </section>`;
}

function showReviewDetail(result, index) {
  const detail = app.querySelector('#review-detail');
  const questionType = result.questionType || 'full';
  const target = questionType === 'target' ? result.targets[index] : null;
  const puzzle = target ? bank.find((candidate) => candidate.id === result.puzzleIds[index]) : null;
  const selectedAnswer = target ? result.answers[index][target.row][target.column] : null;
  detail.className = 'review-detail';
  detail.innerHTML = `
    <h2>Question ${index + 1}</h2>
    <p class="small muted">${result.puzzleIds[index]} · ${formatTime(result.questionTimes[index])}</p>
    ${target ? `<p><strong>Your answer:</strong> ${selectedAnswer || 'Unanswered'} &nbsp; <strong>Correct answer:</strong> ${target.value}</p>` : ''}
    ${target ? reviewMethodMarkup(puzzle) : ''}
    <div class="review-grids">
      <div class="review-grid"><h3>Your answer</h3>${readonlyGrid(result.answers[index], result.startingGrids[index], cellStatusGrid(result, index), 'Your answer', target, true)}</div>
      <div class="review-grid"><h3>Complete solution</h3>${readonlyGrid(result.solutions[index], result.startingGrids[index], null, 'Complete solution', target)}</div>
    </div>`;
  detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderProgress() {
  const sessions = progressStore.all();
  const summary = summarizeProgress(sessions);
  const value = (number, suffix = '') => number === null ? '—' : `${Math.round(number)}${suffix}`;
  app.innerHTML = `
    <section>
      <p class="eyebrow">Progress</p>
      <h1>Your recent training</h1>
      <p class="notice">Progress is stored only in this browser on this device. Up to 50 completed sessions are kept.</p>
      <div class="metrics">
        <div class="metric"><span>Latest mock</span><strong>${summary.latestMock === null ? '—' : `${summary.latestMock}/20`}</strong></div>
        <div class="metric"><span>Best mock</span><strong>${summary.bestMock === null ? '—' : `${summary.bestMock}/20`}</strong></div>
        <div class="metric"><span>Recent ? accuracy</span><strong>${value(summary.accuracy, '%')}</strong></div>
        <div class="metric"><span>Median ? time</span><strong>${summary.medianTime === null ? '—' : formatTime(summary.medianTime)}</strong></div>
        <div class="metric"><span>? within 75 seconds</span><strong>${value(summary.withinTarget, '%')}</strong></div>
      </div>
      <h2>Recent sessions</h2>
      ${sessions.length ? `<div class="session-list">${sessions.map((session) => `
        <div class="session-row">
          <div><strong>${MODE_NAMES[session.mode]}</strong><br /><span class="small muted">${QUESTION_TYPE_NAMES[session.questionType || 'full']} · ${session.difficulty ? DIFFICULTY_NAMES[session.difficulty] : 'Internal difficulty mix'}</span></div>
          <strong>${session.correct}/${session.questionCount}</strong>
          <time class="small muted" datetime="${session.date}">${new Date(session.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} · ${formatTime(session.totalTime)}</time>
        </div>`).join('')}</div>` : '<p class="empty">Complete a Learn puzzle, Speed Drill, or Full Mock to see progress here.</p>'}
      <div class="button-row">
        <button class="button secondary" id="export-progress" type="button" ${sessions.length ? '' : 'disabled'}>Export progress</button>
        <button class="button danger" id="delete-progress" type="button" ${sessions.length ? '' : 'disabled'}>Delete all progress</button>
        <a class="button secondary" href="${routeUrl('home')}">Home</a>
      </div>
    </section>`;
  app.querySelector('#export-progress').addEventListener('click', exportProgress);
  app.querySelector('#delete-progress').addEventListener('click', () => {
    if (!window.confirm('Delete all locally stored progress? This cannot be undone.')) return;
    progressStore.clear();
    renderProgress();
  });
  focusMain();
}

function exportProgress() {
  const blob = new Blob([progressStore.export()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `dmat-progress-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function validatePuzzleBank(data) {
  if (data?.formatVersion !== PUZZLE_FORMAT_VERSION) {
    throw new Error(`Unsupported puzzle format version: ${data?.formatVersion ?? 'missing'}`);
  }
  if (!Array.isArray(data.puzzles) || data.puzzles.length === 0) {
    throw new Error('The generated puzzle bank is empty');
  }
  const levels = new Map(Object.keys(DIFFICULTY_NAMES).map((level) => [level, 0]));
  for (const puzzle of data.puzzles) {
    const level = puzzle?.difficulty?.targetCell;
    const method = puzzle?.bestMethod;
    const finalPlacement = Array.isArray(method) && method.length ? method[method.length - 1]?.placement : null;
    const methodScore = Array.isArray(method)
      ? method.reduce((sum, inference) => sum + (Number.isInteger(inference?.weight) ? inference.weight + 2 : Number.NaN), 0)
      : Number.NaN;
    const methodValid = Array.isArray(method)
      && method.length > 0
      && method.every((inference) => Number.isInteger(inference?.placement?.row)
        && Number.isInteger(inference?.placement?.column)
        && SYMBOLS.includes(inference?.placement?.value)
        && typeof inference?.details === 'string'
        && inference.details.length > 0)
      && finalPlacement?.row === puzzle?.target?.row
      && finalPlacement?.column === puzzle?.target?.column
      && finalPlacement?.value === puzzle?.target?.value
      && methodScore === puzzle?.difficulty?.score;
    if (!levels.has(level) || !puzzle?.target || !methodValid || !Array.isArray(puzzle?.hints?.targetCell) || puzzle.hints.targetCell.length === 0) {
      throw new Error(`Puzzle ${puzzle?.id ?? '(missing ID)'} does not match the target-cell puzzle contract`);
    }
    levels.set(level, levels.get(level) + 1);
  }
  for (const level of levels.keys()) {
    if (levels.get(level) < 10) throw new Error(`Puzzle bank needs at least 10 ${level} puzzles`);
  }
  if (levels.get('easy') < 3 || levels.get('exam') < 11 || levels.get('hard') < 6) {
    throw new Error('Puzzle bank cannot supply the configured 20-question mock mix');
  }
  return data.puzzles;
}

function renderPuzzleNotFound(puzzleId) {
  app.innerHTML = `
    <section class="panel">
      <p class="eyebrow">Learn</p>
      <h1>Puzzle not found.</h1>
      <p class="muted">No published puzzle has the ID <strong>${escapeHtml(puzzleId)}</strong>.</p>
      <a class="button" href="${routeUrl('learn')}">Choose another puzzle</a>
    </section>`;
  focusMain();
}

function renderInitialPage() {
  if (INITIAL_PAGE === 'learn') {
    const puzzleId = new URL(window.location.href).searchParams.get('puzzle');
    if (puzzleId) {
      const puzzle = bank.find((candidate) => candidate.id === puzzleId);
      if (!puzzle) {
        renderPuzzleNotFound(puzzleId);
        return;
      }
      startSession('learn', puzzleDifficulty(puzzle), [puzzle]);
      return;
    }
    renderSetup('learn', difficultyFromUrl());
    return;
  }
  if (INITIAL_PAGE === 'drill') {
    renderSetup('drill', difficultyFromUrl());
    return;
  }
  if (INITIAL_PAGE === 'mock') {
    renderMockIntro();
    return;
  }
  if (INITIAL_PAGE === 'progress') {
    renderProgress();
    return;
  }
  renderHome();
}

homeButton.addEventListener('click', (event) => {
  event.preventDefault();
  goHome();
});
window.addEventListener('beforeunload', (event) => {
  if (!activeSession || activeSession.mode === 'learn') return;
  event.preventDefault();
  event.returnValue = '';
});

fetch(new URL('../data/latin-squares/puzzles.json', import.meta.url))
  .then((response) => {
    if (!response.ok) throw new Error(`Puzzle data returned ${response.status}`);
    return response.json();
  })
  .then((data) => {
    bank = validatePuzzleBank(data);
    renderInitialPage();
  })
  .catch((error) => {
    console.error(error);
    app.innerHTML = '<p class="error">The puzzle bank could not be loaded. Serve this directory through a static web server and try again.</p>';
  });
