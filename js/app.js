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
const MODE_NAMES = { learn: 'Learn', drill: 'Speed Drill', mock: 'Full dMAT Mock' };
const DIFFICULTY_NAMES = { easy: 'Easy', exam: 'Exam Standard', hard: 'Hard', extreme: 'Extreme' };

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

function goHome(force = false) {
  if (!force && !confirmLeave()) return;
  stopInteractiveState();
  activeSession = null;
  renderHome();
}

function renderHome() {
  app.innerHTML = `
    <section>
      <p class="eyebrow">5 × 5 Latin squares</p>
      <h1>Train accuracy.<br />Then train speed.</h1>
      <p class="lede">Place A–E exactly once in every row and column. Learn the deductions, practise at pace, then test yourself under dMAT timing.</p>
      <div class="home-actions" aria-label="Training modes">
        <button class="mode-card" type="button" data-route="learn">
          <strong>Learn</strong>
          <span>One puzzle, no timer, with an optional hint.</span>
        </button>
        <button class="mode-card" type="button" data-route="drill">
          <strong>Speed Drill</strong>
          <span>10 questions. Aim to finish in 12:30.</span>
        </button>
        <button class="mode-card" type="button" data-route="mock">
          <strong>Full Mock</strong>
          <span>20 questions in 25 minutes.</span>
        </button>
        <button class="mode-card" type="button" data-route="progress">
          <strong>Progress</strong>
          <span>Review recent accuracy, speed, and mock scores.</span>
        </button>
      </div>
    </section>`;

  app.querySelectorAll('[data-route]').forEach((button) => {
    button.addEventListener('click', () => {
      const route = button.dataset.route;
      if (route === 'progress') renderProgress();
      else if (route === 'mock') renderMockIntro();
      else renderSetup(route);
    });
  });
  focusMain();
}

function renderSetup(mode) {
  const isLearn = mode === 'learn';
  app.innerHTML = `
    <section class="panel">
      <p class="eyebrow">${MODE_NAMES[mode]}</p>
      <h1>${isLearn ? 'Practise a deduction.' : 'Build a steady pace.'}</h1>
      <p class="muted">${isLearn ? 'Take as long as you need. A hint is available if you get stuck.' : 'Complete 10 puzzles with no feedback until the end. The target is 12 minutes 30 seconds.'}</p>
      <div class="field">
        <label for="difficulty">Training difficulty</label>
        <select id="difficulty">
          <option value="easy">Easy — frequent forced placements</option>
          <option value="exam" selected>Exam Standard — provisional training level</option>
          <option value="hard">Hard — longer deduction chains</option>
          <option value="extreme">Extreme — deliberate overtraining</option>
        </select>
        <p class="small muted">“Exam Standard” is a provisional label and is not officially calibrated.</p>
      </div>
      <div class="button-row">
        <button class="button" id="start-session" type="button">Start ${MODE_NAMES[mode]}</button>
        <button class="button secondary" id="cancel-setup" type="button">Back</button>
      </div>
    </section>`;
  app.querySelector('#start-session').addEventListener('click', () => startSession(mode, app.querySelector('#difficulty').value));
  app.querySelector('#cancel-setup').addEventListener('click', renderHome);
  focusMain();
}

function renderMockIntro() {
  app.innerHTML = `
    <section class="panel">
      <p class="eyebrow">Full dMAT Mock</p>
      <h1>20 questions. 25 minutes.</h1>
      <p class="muted">The timer starts immediately. You can move between questions, but hints and feedback stay hidden until you submit.</p>
      <ul>
        <li>All questions are selected before the mock begins.</li>
        <li>The mock submits automatically when time runs out.</li>
        <li>Difficulty is selected internally.</li>
      </ul>
      <div class="button-row">
        <button class="button" id="start-mock" type="button">Start Mock</button>
        <button class="button secondary" id="cancel-mock" type="button">Back</button>
      </div>
    </section>`;
  app.querySelector('#start-mock').addEventListener('click', () => startSession('mock'));
  app.querySelector('#cancel-mock').addEventListener('click', renderHome);
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

function choosePuzzles(mode, difficulty) {
  if (mode !== 'mock') {
    const count = mode === 'learn' ? 1 : 10;
    return shuffle(bank.filter((puzzle) => puzzle.difficulty === difficulty)).slice(0, count);
  }
  const mix = [
    ...shuffle(bank.filter((puzzle) => puzzle.difficulty === 'easy')).slice(0, 3),
    ...shuffle(bank.filter((puzzle) => puzzle.difficulty === 'exam')).slice(0, 11),
    ...shuffle(bank.filter((puzzle) => puzzle.difficulty === 'hard')).slice(0, 6),
  ];
  return shuffle(mix);
}

function startSession(mode, difficulty = null) {
  stopInteractiveState();
  const puzzles = choosePuzzles(mode, difficulty);
  activeSession = {
    mode,
    difficulty,
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
          <p class="eyebrow">${MODE_NAMES[session.mode]}${session.difficulty ? ` · ${DIFFICULTY_NAMES[session.difficulty]}` : ''}</p>
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
          ${session.puzzles.length > 1 ? `
            <h3>Questions</h3>
            <div class="navigator" aria-label="Question navigator">
              ${session.puzzles.map((item, index) => {
                const answered = editableComplete(item, session.answers[index]);
                return `<button class="nav-question${answered ? ' answered' : ''}${index === session.current ? ' current' : ''}" type="button" data-question="${index}" aria-label="Question ${index + 1}${answered ? ', answered' : ', unanswered'}" ${index === session.current ? 'aria-current="true"' : ''}>${index + 1}</button>`;
              }).join('')}
            </div>
            <div class="legend"><span class="legend-item answered">Answered</span><span class="legend-item">Unanswered</span></div>
          ` : '<p class="muted">Select a cell, then choose A–E. You can also type letters and use arrow keys.</p>'}
          ${session.mode === 'learn' ? '<div id="hint-area"></div>' : ''}
          <div class="session-actions">
            ${session.mode === 'learn' ? '<button class="button secondary" id="show-hint" type="button">Show a hint</button>' : ''}
            ${session.puzzles.length > 1 ? `
              <div class="button-row">
                <button class="button secondary" id="previous-question" type="button" ${session.current === 0 ? 'disabled' : ''}>Previous</button>
                <button class="button secondary" id="next-question" type="button" ${session.current === session.puzzles.length - 1 ? 'disabled' : ''}>Next</button>
              </div>` : ''}
            <button class="button" id="submit-session" type="button">${session.mode === 'learn' ? 'Check puzzle' : `Submit ${MODE_NAMES[session.mode]}`}</button>
            <button class="button secondary" id="leave-session" type="button">Leave session</button>
          </div>
        </aside>
      </div>
    </section>`;

  puzzleUi = new PuzzleUI(app.querySelector('#puzzle-grid'), {
    puzzle,
    values: session.answers[session.current],
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
  const answered = editableComplete(activeSession.puzzles[current], activeSession.answers[current]);
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
  const hint = puzzle.hints?.[0];
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
  const statuses = session.puzzles.map((puzzle, index) => answerStatus(puzzle, session.answers[index]));
  const correct = statuses.filter((status) => status === 'correct').length;
  const incorrect = statuses.filter((status) => status === 'incorrect').length;
  const unanswered = statuses.filter((status) => status === 'unanswered').length;
  const result = {
    id: `${Date.now()}-${session.mode}`,
    date: new Date().toISOString(),
    mode: session.mode,
    difficulty: session.difficulty,
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
  const slow = result.questionTimes.filter((time) => time > TARGET_SECONDS).length;
  return `${common}
    <div class="metric"><span>Median / question</span><strong>${formatTime(median(result.questionTimes))}</strong></div>
    <div class="metric"><span>Over 75 seconds</span><strong>${slow}</strong></div>
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
      <p class="eyebrow">${MODE_NAMES[result.mode]} results</p>
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
    if (result.mode === 'mock') renderMockIntro();
    else renderSetup(result.mode);
  });
  app.querySelector('#results-home').addEventListener('click', renderHome);
  if (reviewIndex !== null) showReviewDetail(result, reviewIndex);
  focusMain();
}

function cellStatusGrid(result, index) {
  return result.answers[index].map((row, rowIndex) => row.map((value, columnIndex) => {
    if (result.startingGrids[index][rowIndex][columnIndex]) return '';
    if (!value) return '';
    return value === result.solutions[index][rowIndex][columnIndex] ? 'correct' : 'incorrect';
  }));
}

function readonlyGrid(values, givens, statuses = null, label = 'Latin square') {
  return `<div class="latin-grid" role="grid" aria-label="${label}">
    ${values.flatMap((row, rowIndex) => row.map((value, columnIndex) => {
      const classes = ['cell'];
      if (givens?.[rowIndex]?.[columnIndex]) classes.push('given');
      if (statuses?.[rowIndex]?.[columnIndex]) classes.push(statuses[rowIndex][columnIndex]);
      return `<div class="${classes.join(' ')}" role="gridcell">${value || ''}</div>`;
    })).join('')}
  </div>`;
}

function showReviewDetail(result, index) {
  const detail = app.querySelector('#review-detail');
  detail.className = 'review-detail';
  detail.innerHTML = `
    <h2>Question ${index + 1}</h2>
    <p class="small muted">${result.puzzleIds[index]} · ${formatTime(result.questionTimes[index])}</p>
    <div class="review-grids">
      <div class="review-grid"><h3>Your answer</h3>${readonlyGrid(result.answers[index], result.startingGrids[index], cellStatusGrid(result, index), 'Your answer')}</div>
      <div class="review-grid"><h3>Solution</h3>${readonlyGrid(result.solutions[index], result.startingGrids[index], null, 'Complete solution')}</div>
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
        <div class="metric"><span>Recent accuracy</span><strong>${value(summary.accuracy, '%')}</strong></div>
        <div class="metric"><span>Median time</span><strong>${summary.medianTime === null ? '—' : formatTime(summary.medianTime)}</strong></div>
        <div class="metric"><span>Within 75 seconds</span><strong>${value(summary.withinTarget, '%')}</strong></div>
      </div>
      <h2>Recent sessions</h2>
      ${sessions.length ? `<div class="session-list">${sessions.map((session) => `
        <div class="session-row">
          <div><strong>${MODE_NAMES[session.mode]}</strong><br /><span class="small muted">${session.difficulty ? DIFFICULTY_NAMES[session.difficulty] : 'Internal difficulty mix'}</span></div>
          <strong>${session.correct}/${session.questionCount}</strong>
          <time class="small muted" datetime="${session.date}">${new Date(session.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} · ${formatTime(session.totalTime)}</time>
        </div>`).join('')}</div>` : '<p class="empty">Complete a Learn puzzle, Speed Drill, or Full Mock to see progress here.</p>'}
      <div class="button-row">
        <button class="button secondary" id="export-progress" type="button" ${sessions.length ? '' : 'disabled'}>Export progress</button>
        <button class="button danger" id="delete-progress" type="button" ${sessions.length ? '' : 'disabled'}>Delete all progress</button>
        <button class="button secondary" id="progress-home" type="button">Home</button>
      </div>
    </section>`;
  app.querySelector('#progress-home').addEventListener('click', renderHome);
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

homeButton.addEventListener('click', () => goHome());
window.addEventListener('beforeunload', (event) => {
  if (!activeSession || activeSession.mode === 'learn') return;
  event.preventDefault();
  event.returnValue = '';
});

fetch('data/puzzles.json')
  .then((response) => {
    if (!response.ok) throw new Error(`Puzzle data returned ${response.status}`);
    return response.json();
  })
  .then((data) => {
    bank = data.puzzles;
    renderHome();
  })
  .catch((error) => {
    console.error(error);
    app.innerHTML = '<p class="error">The puzzle bank could not be loaded. Serve this directory through a static web server and try again.</p>';
  });
