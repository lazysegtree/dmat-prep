import { findSolutionPaths } from './latin-solution-paths.js';
import { examMarkup, examNavigator, bindExamControls, updateExamNavigator, setExamMode } from './exam-ui.js';
import { transferMarkup, bindTransfer } from './data-transfer.js';
import { PuzzleUI } from './puzzle-ui.js';
import { LATIN_DRILL, chooseDrillPuzzles, drillDifficultyName, drillRepeatParameters } from './speed-drill.js';
import { renderDrillSetup as renderSharedDrillSetup, drillTimeMetrics } from './speed-drill-ui.js';
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
  home: 'latin-squares/',
  learn: 'latin-squares/learn/',
  drill: 'latin-squares/speed-drill/',
  mock: 'latin-squares/mock/',
  progress: 'latin-squares/progress/',
};
const MODE_NAMES = { learn: 'Learn', drill: 'Speed Drill', mock: 'Full dMAT Mock' };
const MOCK_LEVELS = LATIN_DRILL.mockLevels;
const DIFFICULTY_NAMES = { easy: 'Easy', exam: 'Exam Standard', hard: 'Hard', extreme: 'Extreme' };
const QUESTION_TYPE_NAMES = { target: 'Find the ?', full: 'Complete the grid' };
const PUZZLE_FORMAT_VERSION = 1;

let bank = [];
let activeSession = null;
let puzzleUi = null;
let clock = null;

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
      <p class="eyebrow">Latin Squares · 5 × 5</p>
      <h1>Train accuracy.<br />Then train speed.</h1>
      <p class="lede">Find the value of one target cell mentally, as in the dMAT. Intermediate cells stay empty and cannot be filled.</p>
      <div class="home-actions" aria-label="Training modes">
        <a class="mode-card" href="${routeUrl('learn')}">
          <strong>Learn</strong>
          <span>Practise generated target-cell puzzles without a timer, with one deduction hint.</span>
        </a>
        <a class="mode-card" href="${routeUrl('drill')}">
          <strong>Speed Drill</strong>
          <span>Choose 5 or 10 questions, a time limit, and a single or mixed difficulty.</span>
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
      <p class="module-back"><a href="${routeUrl('home').replace(/latin-squares\/$/, '')}">← All task types</a></p>
    </section>`;
  focusMain();
}

function difficultyFromUrl() {
  const url = new URL(window.location.href);
  const difficulty = url.searchParams.get('difficulty');
  if (!difficulty) return 'exam';
  if (difficulty === 'random' || Object.hasOwn(DIFFICULTY_NAMES, difficulty)) return difficulty;
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

function renderLearnSetup(difficulty = 'exam') {
  app.innerHTML = `
    <section class="panel">
      <p class="eyebrow">Learn</p>
      <h1>Practise a deduction.</h1>
      <p class="muted">Take as long as you need. A hint is available if you get stuck.</p>
      <p class="notice">Each generated puzzle asks for one <strong>?</strong> cell. Work out any intermediate deductions mentally.</p>
      <div class="field">
        <label for="difficulty">Training difficulty</label>
        <select id="difficulty">
          <option value="easy"${difficulty === 'easy' ? ' selected' : ''}>Easy — frequent forced placements</option>
          <option value="exam"${difficulty === 'exam' ? ' selected' : ''}>Exam Standard — provisional training level</option>
          <option value="hard"${difficulty === 'hard' ? ' selected' : ''}>Hard — longer deduction chains</option>
          <option value="extreme"${difficulty === 'extreme' ? ' selected' : ''}>Extreme — deliberate overtraining</option>
          <option value="random"${difficulty === 'random' ? ' selected' : ''}>Random — 25% per difficulty</option>
        </select>
        <p class="small muted">“Exam Standard” is a provisional label and is not officially calibrated.</p>
      </div>
      <div class="button-row">
        <button class="button" id="start-session" type="button">Start Learn</button>
        <a class="button secondary" href="${routeUrl('home')}">Back</a>
      </div>
    </section>`;
  const difficultySelect = app.querySelector('#difficulty');
  difficultySelect.addEventListener('change', () => updateDifficultyUrl(difficultySelect.value));
  app.querySelector('#start-session').addEventListener('click', () => {
    updateDifficultyUrl(difficultySelect.value);
    startSession('learn', difficultySelect.value);
  });
  focusMain();
}

function renderDrillSetup() {
  renderSharedDrillSetup(app, {
    config: LATIN_DRILL,
    task: 'Latin Squares',
    homeUrl: routeUrl('home'),
    instruction: 'Work out intermediate deductions mentally.',
    difficultyNote: 'Medium uses the existing Exam Standard tier.',
    onStart: settings => startSession('drill', settings.difficulty, null, settings),
  });
}

function mockLevelFromUrl() {
  const url = new URL(window.location.href);
  const level = url.searchParams.get('difficulty');
  if (Object.hasOwn(MOCK_LEVELS, level)) return level;
  if (level !== null) {
    url.searchParams.delete('difficulty');
    window.history.replaceState(null, '', url);
  }
  return 'normal';
}

function sessionDifficultyName(session) {
  if (session.mode === 'mock') return MOCK_LEVELS[session.difficulty]?.name || 'Previous mix (3 Easy, 11 Exam Standard, 6 Hard)';
  if (session.mode === 'drill') return drillDifficultyName(session.difficulty, LATIN_DRILL);
  return session.difficulty === 'random' ? 'Random' : DIFFICULTY_NAMES[session.difficulty] || 'Mixed difficulty';
}

function mockMixDescription(level) {
  return Object.entries(MOCK_LEVELS[level].mix)
    .map(([difficulty, count]) => `${count} ${DIFFICULTY_NAMES[difficulty]}`).join(', ');
}

function renderMockIntro() {
  const level = mockLevelFromUrl();
  app.innerHTML = `
    <section class="panel">
      <p class="eyebrow">Full dMAT Mock</p>
      <h1>20 “Find the ?” questions. 25 minutes.</h1>
      <p class="muted">Each question accepts one answer only. Intermediate cells must be worked out mentally. The timer starts immediately.</p>
      <ul>
        <li>All questions are selected before the mock begins.</li>
        <li>The mock submits automatically when time runs out.</li>
        <li id="mock-mix">The training mix is ${mockMixDescription(level)}.</li>
      </ul>
      <div class="field"><label for="mock-level">Mock difficulty</label><select id="mock-level">${Object.entries(MOCK_LEVELS).map(([key, value]) => `<option value="${key}"${key === level ? ' selected' : ''}>${value.name}</option>`).join('')}</select></div>
      <div class="button-row">
        <button class="button" id="start-mock" type="button">Start Mock</button>
        <a class="button secondary" href="${routeUrl('home')}">Back</a>
      </div>
    </section>`;
  const select = app.querySelector('#mock-level');
  select.addEventListener('change', () => {
    const url = new URL(window.location.href);
    url.searchParams.set('difficulty', select.value);
    window.history.replaceState(null, '', url);
    app.querySelector('#mock-mix').textContent = `The training mix is ${mockMixDescription(select.value)}.`;
  });
  app.querySelector('#start-mock').addEventListener('click', () => startSession('mock', select.value));
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
    const levels = Object.keys(DIFFICULTY_NAMES);
    if (difficulty === 'random') difficulty = levels[Math.floor(Math.random() * levels.length)];
    return shuffle(bank.filter((puzzle) => puzzleDifficulty(puzzle) === difficulty)).slice(0, 1);
  }
  const mix = MOCK_LEVELS[difficulty || 'normal'].mix;
  return shuffle(Object.entries(mix).flatMap(([level, count]) =>
    shuffle(bank.filter((puzzle) => puzzleDifficulty(puzzle) === level)).slice(0, count)));
}

function startSession(mode, difficulty = null, selectedPuzzles = null, drill = null) {
  stopInteractiveState();
  const puzzles = selectedPuzzles || (mode === 'drill' ? chooseDrillPuzzles(bank, difficulty, drill.questionCount) : choosePuzzles(mode, difficulty));
  if (mode === 'learn') {
    const puzzleUrl = new URL(routeUrl('learn'));
    puzzleUrl.searchParams.set('puzzle', puzzles[0].id);
    window.history.replaceState(null, '', puzzleUrl);
  }
  activeSession = {
    mode,
    difficulty,
    timeLimit: mode === 'mock' ? 25 * 60 : drill?.timeLimit ?? null,
    drillTimer: drill?.timer,
    questionType: 'target',
    puzzles,
    answers: puzzles.map(emptyAnswer),
    reviewFlags: puzzles.map(() => false),
    questionTimes: puzzles.map(() => 0),
    current: 0,
    enteredQuestionAt: Date.now(),
    startedAt: Date.now(),
    hintUsed: false,
  };
  activeSession.savedAnswers = structuredClone(activeSession.answers);
  renderPlay();

  if (mode !== 'learn') {
    const duration = activeSession.timeLimit;
    clock = new SessionClock({
      duration,
      onTick: (display) => updateTimer(display, duration !== null && display <= 60),
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
  setExamMode(true);
  app.innerHTML = examMarkup({
    task: 'Latin Squares',
    modeName: MODE_NAMES[session.mode] + (session.mode === 'mock' ? ` · ${sessionDifficultyName(session)}` : ''),
    heading: session.puzzles.length === 1 ? 'Puzzle' : `Question ${session.current + 1} of ${session.puzzles.length}`,
    instructions: `<strong>Which letter is missing?</strong><p>On the position of the question mark in the square, a letter is missing.</p><p>In the square there can only occur the letters A, B, C, D and E.</p><p>Each letter may occur only exactly once in each row and each column.</p><p>Click onto the correct solution in the answer column with the mouse. If you do not know the answer, please guess.</p>`,
    content: `<div class="exam-latin-layout">
      <section class="exam-latin-square"><h2>Square</h2><div class="grid-wrap"><div id="puzzle-grid"></div></div></section>
      <section class="exam-latin-answers"><h2>Answer column</h2><div class="symbol-pad" role="group" aria-label="Answer column">${SYMBOLS.map((symbol) => `<button class="symbol-key" type="button" data-symbol="${symbol}" aria-pressed="false">${symbol}</button>`).join('')}</div><button class="latin-clear-answer" type="button" data-clear aria-label="Clear answer" title="Backspace or Delete">Clear</button></section>
    </div>`,
    navigator: examNavigator(session.puzzles, session.current, (item, index) => editableComplete(item, session.savedAnswers[index], session.questionType), 'Question', session.reviewFlags),
    current: session.current,
    count: session.puzzles.length,
    timerLabel: timed ? (session.timeLimit !== null ? 'Time remaining' : 'Time elapsed') : null,
    timerValue: formatTime(session.timeLimit !== null ? Math.max(0, session.timeLimit - (clock?.elapsed() || 0)) : clock?.elapsed() || 0),
    checkLabel: 'Check answer',
    learnActions: session.mode === 'learn' ? '<button class="button secondary" id="show-hint" type="button">Show a hint</button>' : '',
  });
  bindExamControls(app, session);

  puzzleUi = new PuzzleUI(app.querySelector('#puzzle-grid'), {
    puzzle,
    values: session.answers[session.current],
    questionType: session.questionType,
    onChange: () => {
      updateAnswerSelection();
      updateNavigatorState();
    },
  });
  updateAnswerSelection();
  app.querySelectorAll('[data-symbol]').forEach((button) => button.addEventListener('click', () => puzzleUi.enter(button.dataset.symbol)));
  app.querySelector('[data-clear]').addEventListener('click', () => puzzleUi.clear());
  app.querySelectorAll('[data-question]').forEach((button) => button.addEventListener('click', () => changeQuestion(Number(button.dataset.question))));
  app.querySelector('#previous-question')?.addEventListener('click', () => changeQuestion(session.current - 1));
  app.querySelector('#next-question')?.addEventListener('click', saveAndNext);
  app.querySelector('#show-hint')?.addEventListener('click', showHint);
  app.querySelector('#submit-session').addEventListener('click', () => {
    if (session.mode === 'mock' && !window.confirm('Submit this mock now? You will not be able to change your answers.')) return;
    finishSession(false);
  });
  app.querySelector('#leave-session').addEventListener('click', () => goHome());
  focusMain();
}

function updateAnswerSelection() {
  const { current, puzzles, answers } = activeSession;
  const { row, column } = puzzles[current].target;
  const answer = answers[current][row][column];
  app.querySelectorAll('[data-symbol]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.symbol === answer)));
  app.querySelector('[data-clear]').disabled = !answer;
}

function updateNavigatorState() {
  if (!activeSession || activeSession.puzzles.length === 1) return;
  const current = activeSession.current;
  const answered = editableComplete(activeSession.puzzles[current], activeSession.savedAnswers[current], activeSession.questionType);
  updateExamNavigator(app, current, answered);
}

function saveAndNext() {
  const session = activeSession;
  session.savedAnswers[session.current] = structuredClone(session.answers[session.current]);
  if (session.current < session.puzzles.length - 1) changeQuestion(session.current + 1);
  else renderPlay();
}

function changeQuestion(index) {
  if (!activeSession || index < 0 || index >= activeSession.puzzles.length || index === activeSession.current) return;
  recordCurrentQuestionTime();
  activeSession.answers[activeSession.current] = structuredClone(activeSession.savedAnswers[activeSession.current]);
  activeSession.current = index;
  renderPlay();
  if (clock) {
    const elapsed = clock.elapsed();
    const display = activeSession.timeLimit !== null ? activeSession.timeLimit - elapsed : elapsed;
    updateTimer(display, activeSession.timeLimit !== null && display <= 60);
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
  if (activeSession.mode !== 'learn') activeSession.answers = structuredClone(activeSession.savedAnswers);
  recordCurrentQuestionTime();
  const session = activeSession;
  const elapsed = clock ? clock.stop() : Math.floor((Date.now() - session.startedAt) / 1000);
  clock = null;
  const totalTime = session.timeLimit !== null ? Math.min(session.timeLimit, elapsed) : elapsed;
  const statuses = session.puzzles.map((puzzle, index) => answerStatus(puzzle, session.answers[index], session.questionType));
  const correct = statuses.filter((status) => status === 'correct').length;
  const incorrect = statuses.filter((status) => status === 'incorrect').length;
  const unanswered = statuses.filter((status) => status === 'unanswered').length;
  const result = {
    id: `${Date.now()}-${session.mode}`,
    date: new Date().toISOString(),
    mode: session.mode,
    difficulty: session.difficulty,
    ...(session.mode === 'drill' ? { timeLimit: session.timeLimit, drillTimer: session.drillTimer } : {}),
    questionType: session.questionType,
    questionCount: session.puzzles.length,
    correct,
    incorrect,
    unanswered,
    totalTime,
    timeRemaining: session.timeLimit !== null ? Math.max(0, session.timeLimit - totalTime) : null,
    questionTimes: session.questionTimes.map((value) => Math.round(value)),
    puzzleIds: session.puzzles.map((puzzle) => puzzle.id),
    answers: session.answers,
    solutions: session.puzzles.map((puzzle) => puzzle.solution),
    startingGrids: session.puzzles.map((puzzle) => puzzle.grid),
    targets: session.puzzles.map((puzzle) => puzzle.target),
    reviewPuzzles: session.puzzles.map((puzzle) => ({
      target: puzzle.target,
      difficulty: puzzle.difficulty,
      bestMethod: puzzle.bestMethod,
    })),
    statuses,
    hintUsed: session.hintUsed,
    automatic,
  };
  progressStore.add(result);
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
    ${drillTimeMetrics(result)}
    ${result.mode === 'mock' ? `<div class="metric"><span>Time remaining</span><strong>${formatTime(result.timeRemaining)}</strong></div>` : ''}`;
}

function renderResults(result, reviewIndex = null) {
  setExamMode(false);
  const title = result.mode === 'mock' ? `${result.correct} out of 20` : result.correct === result.questionCount ? 'All correct' : `${result.correct} of ${result.questionCount} correct`;
  const slowest = result.questionTimes
    .map((time, index) => ({ time, index }))
    .sort((a, b) => b.time - a.time)
    .slice(0, 3);
  app.innerHTML = `
    <section>
      <p class="eyebrow">${MODE_NAMES[result.mode]}${result.mode !== 'learn' ? ` · ${sessionDifficultyName(result)}` : ''} · ${QUESTION_TYPE_NAMES[result.questionType || 'full']} results</p>
      <h1>${title}</h1>
      <p class="lede">${result.automatic ? `Time expired, so the ${result.mode === 'drill' ? 'drill' : 'mock'} was submitted automatically.` : 'Review each answer and note where accuracy or time was lost.'}</p>
      <div class="results-summary">${resultMetrics(result)}</div>
      ${result.mode !== 'learn' ? `<h2>Slowest questions</h2><p class="muted">${slowest.map((item) => `Q${item.index + 1} (${formatTime(item.time)})`).join(' · ')}</p>` : ''}
      <h2>Question review</h2>
      <div class="review-list">
        ${result.statuses.map((status, index) => `
          <div class="review-row">
            <strong>Q${index + 1}</strong>
            <div><span class="status ${status}">${status[0].toUpperCase() + status.slice(1)}</span><br /><span class="small muted">${escapeHtml(result.puzzleIds[index])} · ${formatTime(result.questionTimes[index])}</span></div>
            <button class="button secondary" type="button" data-review="${index}">Review</button>
          </div>`).join('')}
      </div>
      <div id="review-detail"></div>
      <div class="button-row">
        <a class="button secondary" href="${routeUrl('progress')}">Back to progress</a>
        <button class="button" id="repeat-mode" type="button">${result.mode === 'mock' ? 'Take another mock' : `New ${MODE_NAMES[result.mode]}`}</button>
        <button class="button secondary" id="results-home" type="button">Home</button>
      </div>
    </section>`;
  app.querySelectorAll('[data-review]').forEach((button) => button.addEventListener('click', () => showReviewDetail(result, Number(button.dataset.review))));
  app.querySelector('#repeat-mode').addEventListener('click', () => {
    navigateTo(result.mode, result.mode === 'drill' ? drillRepeatParameters(result) : { difficulty: result.difficulty });
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

function readonlyGrid(values, givens, statuses = null, label = 'Latin square', target = null, showQuestionMark = false, deductions = []) {
  return `<div class="latin-grid${target ? ' target-mode' : ''}" role="grid" aria-label="${label}">
    ${values.flatMap((row, rowIndex) => row.map((value, columnIndex) => {
      const classes = ['cell'];
      const isTarget = target?.row === rowIndex && target?.column === columnIndex;
      if (givens?.[rowIndex]?.[columnIndex]) classes.push('given');
      if (isTarget) classes.push('target-cell');
      if (statuses?.[rowIndex]?.[columnIndex]) classes.push(statuses[rowIndex][columnIndex]);
      const step = deductions.findIndex(({ placement }) => placement.row === rowIndex && placement.column === columnIndex);
      if (step >= 0) {
        const unit = deductions[step].unit;
        classes.push('deduction-cell');
        return `<div class="${classes.join(' ')}" role="gridcell" aria-label="Row ${rowIndex + 1}, column ${columnIndex + 1}, ${value}, deduction ${step + 1}, based on ${unit.type} ${unit.index + 1}${isTarget ? ', target' : ''}"><span class="cell-value" aria-hidden="true">${value}</span><span class="deduction-direction ${unit.type}" aria-hidden="true"></span><span class="deduction-number" aria-hidden="true">${step + 1}</span></div>`;
      }
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

function reviewPathGrid(puzzle, method, pathIndex) {
  const values = puzzle.grid.map((row) => [...row]);
  for (const { placement } of method) {
    values[placement.row][placement.column] = placement.value;
  }
  return `<div class="inference-grid">${readonlyGrid(values, puzzle.grid, null, `Solution ${pathIndex + 1} deduction order`, puzzle.target, false, method)}</div><p class="deduction-legend small muted">← Row-based · ↓ Column-based</p>`;
}

function reviewExplanationMarkup(puzzle, method) {
  return `
      <ol class="inference-steps">
        ${method.map((inference, step) => {
          const placement = inference.placement;
          const isTarget = placement.row === puzzle.target.row && placement.column === puzzle.target.column;
          return `
            <li class="inference-step${isTarget ? ' target' : ''}">
              <div class="inference-step-heading">
                <span class="inference-step-number" aria-hidden="true">${step + 1}</span>
                <strong>${escapeHtml(cellName(placement))} = ${escapeHtml(placement.value)}</strong>
                ${isTarget ? '<span class="target-badge">Target</span>' : ''}
              </div>
              ${inference.reasons.map((reason) => `<p>${escapeHtml(reason.details)}</p>`).join('')}
            </li>`;
        }).join('')}
      </ol>`;
}

function showReviewDetail(result, index) {
  const detail = app.querySelector('#review-detail');
  const questionType = result.questionType || 'full';
  const target = questionType === 'target' ? result.targets[index] : null;
  const puzzle = target ? (result.reviewPuzzles?.[index] ?? bank.find((candidate) => candidate.id === result.puzzleIds[index])) : null;
  const reviewPuzzle = puzzle ? { ...puzzle, grid: result.startingGrids[index] } : null;
  const paths = reviewPuzzle?.bestMethod?.length ? findSolutionPaths(reviewPuzzle).paths.slice(0, 5) : [];
  const selectedAnswer = target ? result.answers[index][target.row][target.column] : null;
  detail.className = 'review-detail';
  detail.innerHTML = `
    <h2>Question ${index + 1}</h2>
    <p class="small muted">${escapeHtml(result.puzzleIds[index])} · ${formatTime(result.questionTimes[index])}</p>
    ${target ? `<p><strong>Your answer:</strong> ${selectedAnswer || 'Unanswered'} &nbsp; <strong>Correct answer:</strong> ${target.value}</p>` : ''}
    <section class="latin-review">
      ${paths.length ? `<fieldset class="solution-picker">
        <legend>Solution path</legend>
        <div class="solution-options">${paths.map((_, pathIndex) => `<label><input type="radio" name="review-solution" value="${pathIndex}" aria-controls="review-solution-grid review-solution-explanation"${pathIndex === 0 ? ' checked' : ''}> Solution ${pathIndex + 1}</label>`).join('')}</div>
      </fieldset>` : ''}
      <div class="review-grids">
        <div class="review-grid"><h3>Your answer</h3>${readonlyGrid(result.answers[index], result.startingGrids[index], cellStatusGrid(result, index), 'Your answer', target, true)}</div>
        <div class="review-grid"><h3>Solution</h3><div id="review-solution-grid">${paths.length ? '' : target ? '<p class="muted">The deduction path is unavailable for this puzzle.</p>' : readonlyGrid(result.solutions[index], result.startingGrids[index], null, 'Solution')}</div></div>
      </div>
      ${paths.length ? `<p id="review-solution-summary" class="inference-summary small muted" aria-live="polite"></p>
      <details class="solution-explanation">
        <summary>Show detailed explanation</summary>
        <div id="review-solution-explanation"></div>
      </details>` : ''}
    </section>`;
  const selectSolution = (pathIndex) => {
    const method = paths[pathIndex];
    const level = DIFFICULTY_NAMES[puzzle.difficulty.targetCell] || puzzle.difficulty.targetCell;
    detail.querySelector('#review-solution-grid').innerHTML = reviewPathGrid(reviewPuzzle, method, pathIndex);
    detail.querySelector('#review-solution-summary').textContent = `Solution ${pathIndex + 1} · ${method.length} deduction${method.length === 1 ? '' : 's'} · ${level} · score ${method.reduce((sum, step) => sum + step.weight + 2, 0)}`;
    detail.querySelector('#review-solution-explanation').innerHTML = reviewExplanationMarkup(reviewPuzzle, method);
  };
  if (paths.length) {
    selectSolution(0);
    detail.querySelectorAll('input[name="review-solution"]').forEach((radio) => radio.addEventListener('change', () => {
      if (radio.checked) selectSolution(Number(radio.value));
    }));
  }
  detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function hasSavedReview(session) {
  const count = session.questionCount;
  const complete = (key) => Array.isArray(session[key]) && session[key].length === count;
  const grid = (value) => Array.isArray(value) && value.length === 5
    && value.every((row) => Array.isArray(row) && row.length === 5 && row.every((cell) => !cell || SYMBOLS.includes(cell)));
  return ['statuses', 'puzzleIds', 'questionTimes', 'answers', 'solutions', 'startingGrids'].every(complete)
    && session.statuses.every((status) => ['correct', 'incorrect', 'unanswered'].includes(status))
    && ['answers', 'solutions', 'startingGrids'].every((key) => session[key].every(grid))
    && (session.questionType !== 'target' || (complete('targets') && session.targets.every((target) =>
      target && Number.isInteger(target.row) && target.row >= 0 && target.row < 5
      && Number.isInteger(target.column) && target.column >= 0 && target.column < 5 && SYMBOLS.includes(target.value))));
}

function renderProgress(notice = '') {
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
      ${notice ? `<p class="notice">${notice}</p>` : ''}
      ${sessions.length ? `<div class="session-list">${sessions.map((session) => `
        <div class="session-row saved-session-row">
          <div><strong>${MODE_NAMES[session.mode]}</strong><br /><span class="small muted">${QUESTION_TYPE_NAMES[session.questionType || 'full']} · ${sessionDifficultyName(session)}</span></div>
          <strong>${session.correct}/${session.questionCount}</strong>
          <time class="small muted" datetime="${session.date}">${new Date(session.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} · ${formatTime(session.totalTime)}</time>
          ${hasSavedReview(session) ? `<a class="button secondary" href="${escapeHtml(routeUrl('progress', { session: session.id }))}">View results</a>` : '<span class="small muted">Question details were not saved for this session.</span>'}
        </div>`).join('')}</div>` : '<p class="empty">Complete a Learn puzzle, Speed Drill, or Full Mock to see progress here.</p>'}
      <div class="button-row">
        <button class="button danger" id="delete-progress" type="button" ${sessions.length ? '' : 'disabled'}>Delete all progress</button>
        <a class="button secondary" href="${routeUrl('home')}">Home</a>
      </div>
    </section>`;
  app.insertAdjacentHTML('beforeend', transferMarkup());
  bindTransfer(app, renderProgress);
  app.querySelector('#delete-progress').addEventListener('click', () => {
    if (!window.confirm('Delete all locally stored progress? This cannot be undone.')) return;
    progressStore.clear();
    renderProgress();
  });
  focusMain();
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
    renderLearnSetup(difficultyFromUrl());
    return;
  }
  if (INITIAL_PAGE === 'drill') {
    renderDrillSetup();
    return;
  }
  if (INITIAL_PAGE === 'mock') {
    renderMockIntro();
    return;
  }
  if (INITIAL_PAGE === 'progress') {
    const sessionId = new URL(window.location.href).searchParams.get('session');
    if (sessionId) {
      const result = progressStore.all().find((session) => session.id === sessionId);
      if (result && hasSavedReview(result)) {
        renderResults(result, result.mode === 'learn' ? 0 : null);
      } else {
        renderProgress(result ? 'Question details were not saved for this session.' : 'This saved session is no longer available.');
      }
      return;
    }
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
