import { examMarkup, examNavigator, bindExamControls, setExamMode } from './exam-ui.js';
import { answerComplete, answerStatus, frameCorrectCount, validateFigureBank } from './figure-sequence-session.js';
import { transferMarkup, bindTransfer } from './data-transfer.js';
import { SessionClock, TARGET_SECONDS, formatTime, median } from './session.js';

const app = document.querySelector('#app');
const homeButton = document.querySelector('#figure-home-button');
const SITE_ROOT = new URL('../', import.meta.url);
const INITIAL_PAGE = document.body.dataset.figurePage || 'home';
const STORAGE_KEY = 'dmat-figures-progress-v1';
const MODE_NAMES = { learn: 'Learn', drill: 'Speed Drill', mock: 'Full Mock' };
const DIFFICULTY_NAMES = { low: 'Low', medium: 'Medium', high: 'High', extreme: 'Extreme' };
const MOCK_LEVELS = {
  easy: { name: 'Easy', mix: { low: 10, medium: 8, high: 2 } },
  normal: { name: 'Normal', mix: { low: 6, medium: 8, high: 6 } },
  hard: { name: 'Hard', mix: { medium: 8, high: 10, extreme: 2 } },
  extreme: { name: 'Extreme', mix: { medium: 5, high: 10, extreme: 5 } },
};
const ROUTES = {
  home: 'figure-sequences/',
  learn: 'figure-sequences/learn/',
  drill: 'figure-sequences/speed-drill/',
  mock: 'figure-sequences/mock/',
  progress: 'figure-sequences/progress/',
};

const COLORS = { teal: '#16866f', magenta: '#c64f82', amber: '#f0b429', ink: '#27332b' };
function shapeMarkup(shape, color) {
  const common = `fill="${color}" stroke="#17211b" stroke-width="2" stroke-linejoin="round"`;
  if (shape === 'arrow') return `<path ${common} d="M-11-6H1v-6L12 0 1 12V6h-12Z" />`;
  if (shape === 'triangle') return `<path ${common} d="M0-12 11 10h-22Z" />`;
  if (shape === 'corner') return `<path ${common} d="M-10-11h7v13h13v8h-20Z" />`;
  return `<path ${common} d="M-11-8-2 0-11 8-5 12 10 0-5-12Z" />`;
}

function frameDescription(frame) {
  return frame.figures.map((figure) => (
    `${figure.actorId} at row ${figure.row + 1}, column ${figure.column + 1}, ${figure.color}, rotated ${figure.rotation} degrees`
  )).join('; ');
}

function frameSVG(frame, puzzle) {
  const actorShapes = new Map(puzzle.actors.map((actor) => [actor.id, actor.shape]));
  const gridLines = [25, 50, 75].map((value) => (
    `<path d="M${value} 0V100M0 ${value}H100" />`
  )).join('');
  const figures = frame.figures.map((figure) => {
    const x = figure.column * 25 + 12.5;
    const y = figure.row * 25 + 12.5;
    return `<g transform="translate(${x} ${y}) rotate(${figure.rotation}) scale(.72)">${shapeMarkup(actorShapes.get(figure.actorId), COLORS[figure.color])}</g>`;
  }).join('');
  return `<svg class="sequence-matrix" viewBox="0 0 100 100" aria-hidden="true">
    <rect width="100" height="100" fill="#fff" />
    <g class="sequence-grid-lines" fill="none" stroke="#89938c" stroke-width="1">${gridLines}</g>
    <rect class="sequence-grid-border" x="1" y="1" width="98" height="98" fill="none" stroke="#27332b" stroke-width="2" />
    ${figures}
  </svg>`;
}

function frameCard(frame, puzzle, label) {
  return `<div class="sequence-frame-card" role="img" aria-label="${escapeHtml(label)}: ${escapeHtml(frameDescription(frame))}">
    ${frameSVG(frame, puzzle)}
    <span>${label}</span>
  </div>`;
}


function sequenceMarkup(puzzle, answers, review = false) {
 return `<div class="observed-strip" aria-label="Observed sequence">${puzzle.observedFrames.map((frame, index) => frameCard(frame, puzzle, `Matrix ${index + 1}`)).join('')}</div>
 <div class="sequence-questions">${puzzle.questions.map((question, frameIndex) => `<fieldset class="sequence-answer-group"><legend>Frame ${question.frameNumber}</legend>
 ${review ? `<p>Your choice: ${answers[frameIndex] === null ? 'Unanswered' : answers[frameIndex] + 1}. Correct choice: ${question.answerIndex + 1}.</p>` : ''}
 <div class="sequence-options">${question.options.map((option, optionIndex) => `<button type="button" class="sequence-option${answers[frameIndex] === optionIndex ? ' selected' : ''}${review && question.answerIndex === optionIndex ? ' correct' : ''}${review && answers[frameIndex] === optionIndex && optionIndex !== question.answerIndex ? ' incorrect' : ''}" data-frame="${frameIndex}" data-option="${optionIndex}" aria-label="Frame ${question.frameNumber}, option ${optionIndex + 1}: ${escapeHtml(frameDescription(option))}" aria-pressed="${answers[frameIndex] === optionIndex}" ${review ? 'disabled' : ''}>${frameSVG(option, puzzle)}<strong>Option ${optionIndex + 1}</strong></button>`).join('')}</div></fieldset>`).join('')}</div>`;
}

function examSequenceMarkup(puzzle, answers) {
  return `<div class="exam-sequence-layout" data-question-id="${puzzle.id}">
    ${puzzle.observedFrames.map((frame, index) => frameCard(frame, puzzle, `Matrix ${index + 1}`)).join('')}
    ${puzzle.questions.map((question, frameIndex) => `<fieldset class="exam-sequence-answer-column">
      <legend class="visually-hidden">Frame ${question.frameNumber}</legend>
      <div class="sequence-missing-frame" role="img" aria-label="Missing frame ${question.frameNumber}"><span aria-hidden="true">?</span></div>
      <svg class="sequence-answer-arrow" viewBox="0 0 100 42" aria-hidden="true"><path d="M28 0H72V19H100L50 42 0 19H28Z" /></svg>
      <div class="sequence-options">${question.options.map((option, optionIndex) => `<button type="button" class="sequence-option${answers[frameIndex] === optionIndex ? ' selected' : ''}" data-frame="${frameIndex}" data-option="${optionIndex}" aria-label="Frame ${question.frameNumber}, option ${optionIndex + 1}: ${escapeHtml(frameDescription(option))}" aria-pressed="${answers[frameIndex] === optionIndex}">${frameSVG(option, puzzle)}</button>`).join('')}</div>
    </fieldset>`).join('')}
  </div>`;
}

let bank = [];
let activeSession = null;
let clock = null;

function routeUrl(route, parameters = {}) {
  const url = new URL(ROUTES[route], SITE_ROOT);
  Object.entries(parameters).forEach(([name, value]) => {
    if (value !== null && value !== undefined && value !== '') url.searchParams.set(name, value);
  });
  return url.href;
}

function focusMain() {
  app.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function confirmLeave() {
  if (!activeSession || activeSession.mode === 'learn') return true;
  return window.confirm('Leave this session? Your current answers will not be saved.');
}

function stopClock() {
  clock?.stop();
  clock = null;
}

function navigateTo(route, parameters = {}, force = false) {
  if (!force && !confirmLeave()) return;
  stopClock();
  activeSession = null;
  window.location.assign(routeUrl(route, parameters));
}

function renderHome() {
 app.innerHTML = `<section><p class="eyebrow">Figure Sequences</p><h1>Track the changes.<br />Predict the next two frames.</h1>
 <p class="lede">Follow position, colour, and rotation across four matrices, then choose frames 5 and 6.</p>
 <div class="home-actions" aria-label="Training modes">
 <a class="mode-card" href="${routeUrl('learn')}"><strong>Learn</strong><span>One untimed sequence with a hint and an explanation for each figure.</span></a>
 <a class="mode-card" href="${routeUrl('drill')}"><strong>Speed Drill</strong><span>10 sequences with a target pace of 75 seconds each.</span></a>
 <a class="mode-card" href="${routeUrl('mock')}"><strong>Full Mock</strong><span>20 sequences in 25 minutes. Review after submission.</span></a>
 <a class="mode-card" href="${routeUrl('progress')}"><strong>Progress</strong><span>Track complete sequences, individual frames, and speed.</span></a></div>
 <p class="notice">Difficulty labels are provisional training levels, not calibrated exam difficulty. Scores count a sequence as correct only when both frames are correct; individual-frame accuracy is shown separately.</p>
 <p class="module-back"><a href="${new URL('', SITE_ROOT).href}">← All task types</a></p></section>`;
 focusMain();
}

function difficultyFromUrl() {
  const url = new URL(window.location.href);
  const difficulty = url.searchParams.get('difficulty');
  if (!difficulty) return 'medium';
  if (Object.hasOwn(DIFFICULTY_NAMES, difficulty)) return difficulty;
  url.searchParams.delete('difficulty');
  window.history.replaceState(null, '', url);
  return 'medium';
}

function renderSetup(mode, difficulty) {
 app.innerHTML = `<section class="panel"><p class="eyebrow">Figure Sequences · ${MODE_NAMES[mode]}</p>
 <h1>${mode === 'learn' ? 'Follow each figure.' : 'Build a clean pace.'}</h1>
 <p class="muted">${mode === 'learn' ? 'One untimed sequence. Hints are available before checking both answers.' : '10 sequences. Target: 12:30. Feedback appears after submission.'}</p>
 <div class="field"><label for="difficulty">Training difficulty</label><select id="difficulty">${Object.entries(DIFFICULTY_NAMES).map(([key, label]) => `<option value="${key}" ${key === difficulty ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
 <p class="small muted">Difficulty is provisional and reflects the number of figures and changing properties.</p>
 <div class="button-row"><button class="button" id="start-session">Start ${MODE_NAMES[mode]}</button><a class="button secondary" href="${routeUrl('home')}">Back</a></div></section>`;
 app.querySelector('#start-session').addEventListener('click', () => startSession(mode, app.querySelector('#difficulty').value));
 focusMain();
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
  if (session.mode === 'mock') return MOCK_LEVELS[session.difficulty]?.name || 'Normal';
  return DIFFICULTY_NAMES[session.difficulty] || 'Mixed difficulty';
}

function mockMixDescription(level) {
  return Object.entries(MOCK_LEVELS[level].mix)
    .map(([difficulty, count]) => `${count} ${DIFFICULTY_NAMES[difficulty]}`).join(', ');
}

function renderMockIntro() {
 const level = mockLevelFromUrl();
 app.innerHTML = `<section class="panel"><p class="eyebrow">Figure Sequences · Full Mock</p><h1>20 sequences. 25 minutes.</h1>
 <p class="muted">Choose two frames per sequence. Navigate freely; feedback appears after submission.</p>
 <ul><li id="mock-mix">The training mix is ${mockMixDescription(level)}.</li><li>The timer submits automatically when time expires.</li><li>A complete-sequence point requires both frames to be correct. Individual frames are counted separately.</li></ul>
 <p class="small muted">The difficulty mix and displayed scoring are training conventions.</p>
      <div class="field"><label for="mock-level">Mock difficulty</label><select id="mock-level">${Object.entries(MOCK_LEVELS).map(([key, value]) => `<option value="${key}"${key === level ? ' selected' : ''}>${value.name}</option>`).join('')}</select></div>
 <div class="button-row"><button class="button" id="start-mock">Start Mock</button><a class="button secondary" href="${routeUrl('home')}">Back</a></div></section>`;
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

function chooseQuestions(mode, difficulty) {
  if (mode === 'learn') return shuffle(bank.filter((question) => question.difficulty.level === difficulty)).slice(0, 1);
  if (mode === 'drill') return shuffle(bank.filter((question) => question.difficulty.level === difficulty)).slice(0, 10);
  const mix = MOCK_LEVELS[difficulty || 'normal'].mix;
  return shuffle(Object.entries(mix).flatMap(([level, count]) =>
    shuffle(bank.filter((question) => question.difficulty.level === level)).slice(0, count)));
}

function emptyFigureAnswer() { return [null, null]; }

function startSession(mode, difficulty = null, selectedQuestions = null) {
  stopClock();
  const questions = selectedQuestions || chooseQuestions(mode, difficulty);
  if (!questions.length) {
    app.innerHTML = '<p class="error">No questions are available for this selection.</p>';
    return;
  }
  if (mode === 'learn') {
    const url = new URL(routeUrl('learn'));
    url.searchParams.set('question', questions[0].id);
    window.history.replaceState(null, '', url);
  }
  activeSession = {
    mode,
    difficulty,
    questions,
    answers: questions.map(emptyFigureAnswer),
    reviewFlags: questions.map(() => false),
    questionTimes: questions.map(() => 0),
    current: 0,
    enteredQuestionAt: Date.now(),
    startedAt: Date.now(),
    hintUsed: false,
  };
  renderQuestion();
  if (mode === 'drill') clock = new SessionClock({ onTick: (seconds) => updateTimer(seconds, false) });
  if (mode === 'mock') clock = new SessionClock({ duration: 25 * 60, onTick: (seconds) => updateTimer(seconds, seconds <= 60), onExpire: () => finishSession(true) });
}

function updateTimer(seconds, urgent) {
  const value = app.querySelector('#timer-value');
  if (!value) return;
  value.textContent = formatTime(seconds);
  value.classList.toggle('urgent', urgent);
}

function recordQuestionTime() {
  if (!activeSession) return;
  const now = activeSession.mode === 'mock' ? Math.min(Date.now(), activeSession.startedAt + 25 * 60 * 1000) : Date.now();
  activeSession.questionTimes[activeSession.current] += Math.max(0, now - activeSession.enteredQuestionAt) / 1000;
  activeSession.enteredQuestionAt = now;
}

function renderQuestion() {
 const session = activeSession;
 const question = session.questions[session.current];
 const timed = session.mode !== 'learn';
 setExamMode(true);
 app.innerHTML = examMarkup({
  task: 'Figure Sequences',
  modeName: MODE_NAMES[session.mode] + (session.mode === 'mock' ? ` · ${sessionDifficultyName(session)}` : ''),
  heading: `Sequence ${session.current + 1} of ${session.questions.length}`,
  instructions: '<strong>Which pictures are missing in the row?</strong><p>The series of pictures has to be continued. Each picture consists of symbols, which can change in color, position, and orientation.</p><p>Below each question mark, there are three options. Click onto the two correct answers with the mouse. If you do not know an answer, please guess.</p>',
  content: examSequenceMarkup(question, session.answers[session.current]),
  navigator: examNavigator(session.questions, session.current, (item, index) => answerComplete(item, session.answers[index]), 'Sequence', session.reviewFlags),
  current: session.current,
  count: session.questions.length,
  timerLabel: timed ? (session.mode === 'mock' ? 'Time remaining' : 'Time elapsed') : null,
  timerValue: formatTime(session.mode === 'mock' ? Math.max(0, 1500 - (clock?.elapsed() || 0)) : clock?.elapsed() || 0),
  checkDisabled: session.mode === 'learn' && !answerComplete(question, session.answers[session.current]),
  learnActions: session.mode === 'learn' ? `<button class="button secondary" id="show-hint" type="button" ${session.hintUsed ? 'disabled' : ''}>Show strategy hint</button>` : '',
 });
 bindExamControls(app, session);
 if (session.mode === 'learn' && session.hintUsed) app.querySelector('#hint-area').innerHTML = `<div class="hint-box">${escapeHtml(question.hint)}</div>`;
 app.querySelectorAll('[data-frame]').forEach((button) => button.addEventListener('click', () => {
  session.answers[session.current][Number(button.dataset.frame)] = Number(button.dataset.option);
  renderQuestion();
  app.querySelector(`[data-frame="${button.dataset.frame}"][data-option="${button.dataset.option}"]`).focus({ preventScroll: true });
 }));
 app.querySelectorAll('[data-question]').forEach((button) => button.addEventListener('click', () => changeQuestion(Number(button.dataset.question))));
 app.querySelector('#previous-question')?.addEventListener('click', () => changeQuestion(session.current - 1));
 app.querySelector('#next-question')?.addEventListener('click', () => changeQuestion(session.current + 1));
 app.querySelector('#show-hint')?.addEventListener('click', showHint);
 app.querySelector('#submit-session').addEventListener('click', () => {
  if (session.mode === 'mock' && !window.confirm('Submit this mock now? You will not be able to change your answers.')) return;
  finishSession(false);
 });
 app.querySelector('#leave-session').addEventListener('click', () => navigateTo('home'));
}

function changeQuestion(index) {
  if (!activeSession || index < 0 || index >= activeSession.questions.length || index === activeSession.current) return;
  recordQuestionTime();
  activeSession.current = index;
  renderQuestion();
  if (clock) {
    const elapsed = clock.elapsed();
    const display = activeSession.mode === 'mock' ? 25 * 60 - elapsed : elapsed;
    updateTimer(display, activeSession.mode === 'mock' && display <= 60);
  }
}

function showHint() {
  const question = activeSession.questions[activeSession.current];
  activeSession.hintUsed = true;
  app.querySelector('#hint-area').innerHTML = `<div class="hint-box"><strong>First move</strong><br />${escapeHtml(question.hint)}</div>`;
  app.querySelector('#show-hint').disabled = true;
}

function finishSession(automatic) {
  if (!activeSession) return;
  recordQuestionTime();
  const session = activeSession;
  const elapsed = clock ? clock.stop() : Math.floor((Date.now() - session.startedAt) / 1000);
  clock = null;
  const totalTime = session.mode === 'mock' ? Math.min(25 * 60, elapsed) : elapsed;
  const statuses = session.questions.map((question, index) => answerStatus(question, session.answers[index]));
  const result = {
    id: `${Date.now()}-${session.mode}`,
    date: new Date().toISOString(),
    task: 'figure-sequences',
    mode: session.mode,
    difficulty: session.difficulty,
    questionCount: session.questions.length,
    frameCorrect: session.questions.reduce((sum, question, index) => sum + frameCorrectCount(question, session.answers[index]), 0),
    correct: statuses.filter((status) => status === 'correct').length,
    incorrect: statuses.filter((status) => status === 'incorrect').length,
    unanswered: statuses.filter((status) => status === 'unanswered').length,
    totalTime,
    timeRemaining: session.mode === 'mock' ? Math.max(0, 25 * 60 - totalTime) : null,
    questionTimes: session.questionTimes.map(Math.round),
    questionIds: session.questions.map((question) => question.id),
    answers: session.answers,
    statuses,
    hintUsed: session.hintUsed,
    automatic,
  };
  let saveError = false;
  try { figureProgress.add(result); } catch { saveError = true; }
  activeSession = null;
  renderResults(result, result.mode === 'learn' ? 0 : null);
  if (saveError) app.insertAdjacentHTML('afterbegin', '<p class="error" role="alert">Results could not be saved. Check browser storage access and space.</p>');
}

function resultMetrics(result) {
  return `
    <div class="metric"><span>Complete sequences</span><strong>${result.correct}</strong></div>
    <div class="metric"><span>Incorrect pairs</span><strong>${result.incorrect}</strong></div>
    <div class="metric"><span>Unanswered</span><strong>${result.unanswered}</strong></div>
    <div class="metric"><span>Individual frames</span><strong>${result.frameCorrect}/${result.questionCount * 2}</strong></div><div class="metric"><span>Total time</span><strong>${formatTime(result.totalTime)}</strong></div>
    ${result.mode === 'learn' ? '' : `<div class="metric"><span>Median / sequence</span><strong>${formatTime(median(result.questionTimes))}</strong></div><div class="metric"><span>Over 75 seconds</span><strong>${result.questionTimes.filter((time) => time > TARGET_SECONDS).length}</strong></div>`}
    ${result.mode === 'mock' ? `<div class="metric"><span>Time remaining</span><strong>${formatTime(result.timeRemaining)}</strong></div>` : result.mode === 'drill' ? '<div class="metric"><span>Target total</span><strong>12:30</strong></div>' : ''}`;
}

function renderResults(result, reviewIndex = null) {
  setExamMode(false);
  const slowest = result.questionTimes.map((time, index) => ({ time, index })).sort((a, b) => b.time - a.time).slice(0, 3);
  app.innerHTML = `
    <section>
      <p class="eyebrow">Figure Sequences · ${MODE_NAMES[result.mode]}${result.mode === 'mock' ? ` · ${sessionDifficultyName(result)}` : ''} results</p>
      <h1>${result.mode === 'mock' ? `${result.correct} out of 20` : result.correct === result.questionCount ? 'All correct' : `${result.correct} of ${result.questionCount} correct`}</h1>
      <p class="lede">${result.automatic ? 'Time expired, so the mock was submitted automatically.' : 'Review each figure’s movement, colour, and rotation.'}</p>
      <div class="results-summary">${resultMetrics(result)}</div>
      ${result.mode === 'learn' ? '' : `<h2>Slowest sequences</h2><p class="muted">${slowest.map((item) => `Q${item.index + 1} (${formatTime(item.time)})`).join(' · ')}</p>`}
      <h2>Question review</h2>
      <div class="review-list">${result.statuses.map((status, index) => `<div class="review-row"><strong>Q${index + 1}</strong><div><span class="status ${status}">${capitalize(status)}</span><br /><span class="small muted">${escapeHtml(result.questionIds[index])} · ${formatTime(result.questionTimes[index])}</span></div><button class="button secondary" type="button" data-review="${index}">Review</button></div>`).join('')}</div>
      <div id="review-detail"></div>
      <div class="button-row"><button class="button" id="repeat-mode" type="button">${result.mode === 'mock' ? 'Take another mock' : `New ${MODE_NAMES[result.mode]}`}</button><button class="button secondary" id="results-home" type="button">Figure Sequences home</button></div>
    </section>`;
  app.querySelectorAll('[data-review]').forEach((button) => button.addEventListener('click', () => showReview(result, Number(button.dataset.review))));
  app.querySelector('#repeat-mode').addEventListener('click', () => navigateTo(result.mode, result.difficulty ? { difficulty: result.difficulty } : {}));
  app.querySelector('#results-home').addEventListener('click', () => navigateTo('home'));
  if (reviewIndex !== null) showReview(result, reviewIndex);
  focusMain();
}

function showReview(result, index) {
 const question = bank.find((candidate) => candidate.id === result.questionIds[index]);
 const detail = app.querySelector('#review-detail');
 detail.className = 'review-detail';
 if (!question) { detail.textContent = 'This sequence is no longer in the current bank. Its saved score is still included in progress.'; return; }
 detail.innerHTML = `<h2>Sequence ${index + 1}</h2>${sequenceMarkup(question, result.answers[index], true)}
 <h3>Rule explanation</h3><ol class="inference-steps">${question.programs.map((program) => `<li class="inference-step"><strong>${escapeHtml(program.actorId)}</strong><p>${escapeHtml(program.explanation)}</p></li>`).join('')}</ol>`;
 detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function readSessions() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

const figureProgress = {
  all: readSessions,
  add(result) { localStorage.setItem(STORAGE_KEY, JSON.stringify([result, ...readSessions()].slice(0, 50))); },
  clear() { localStorage.removeItem(STORAGE_KEY); },
};

function progressSummary(sessions) {
  const mocks = sessions.filter((session) => session.mode === 'mock');
  const times = sessions.flatMap((session) => session.questionTimes || []);
  const total = sessions.reduce((sum, session) => sum + session.questionCount, 0);
  const correct = sessions.reduce((sum, session) => sum + session.correct, 0);
  return {
    latestMock: mocks[0]?.correct ?? null,
    bestMock: mocks.length ? Math.max(...mocks.map((session) => session.correct)) : null,
    frameAccuracy: total ? sessions.reduce((sum, session) => sum + session.frameCorrect, 0) / (2 * total) * 100 : null,
    accuracy: total ? (correct / total) * 100 : null,
    medianTime: times.length ? median(times) : null,
    withinTarget: times.length ? (times.filter((time) => time <= TARGET_SECONDS).length / times.length) * 100 : null,
  };
}

function renderProgress() {
  const sessions = figureProgress.all();
  const summary = progressSummary(sessions);
  const percent = (value) => value === null ? '—' : `${Math.round(value)}%`;
  app.innerHTML = `
    <section><p class="eyebrow">Figure Sequences · Progress</p><h1>Your recent training</h1><p class="notice">Progress is stored only in this browser on this device. Up to 50 completed figure sessions are kept.</p>
      <div class="metrics"><div class="metric"><span>Latest mock</span><strong>${summary.latestMock === null ? '—' : `${summary.latestMock}/20`}</strong></div><div class="metric"><span>Best mock</span><strong>${summary.bestMock === null ? '—' : `${summary.bestMock}/20`}</strong></div><div class="metric"><span>Complete-sequence accuracy</span><strong>${percent(summary.accuracy)}</strong></div><div class="metric"><span>Individual-frame accuracy</span><strong>${percent(summary.frameAccuracy)}</strong></div><div class="metric"><span>Median sequence time</span><strong>${summary.medianTime === null ? '—' : formatTime(summary.medianTime)}</strong></div><div class="metric"><span>Within 75 seconds</span><strong>${percent(summary.withinTarget)}</strong></div></div>
      <h2>Recent sessions</h2>${sessions.length ? `<div class="session-list">${sessions.map((session) => `<div class="session-row"><div><strong>${MODE_NAMES[session.mode]}</strong><br /><span class="small muted">${sessionDifficultyName(session)}</span></div><strong>${session.correct}/${session.questionCount} pairs<br /><span class="small">${session.frameCorrect}/${session.questionCount * 2} frames</span></strong><time class="small muted" datetime="${escapeHtml(session.date)}">${new Date(session.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} · ${formatTime(session.totalTime)}</time><button class="button secondary" data-session="${sessions.indexOf(session)}">Review</button></div>`).join('')}</div>` : '<p class="empty">Complete a figure session to see progress here.</p>'}
      <div class="button-row"><button class="button danger" id="delete-progress" type="button" ${sessions.length ? '' : 'disabled'}>Delete figure progress</button><a class="button secondary" href="${routeUrl('home')}">Figure Sequences home</a></div>
    </section>`;
  app.insertAdjacentHTML('beforeend', transferMarkup());
  bindTransfer(app, renderProgress);
  app.querySelectorAll('[data-session]').forEach((button) => button.addEventListener('click', () => renderResults(sessions[Number(button.dataset.session)])));
  app.querySelector('#delete-progress').addEventListener('click', () => { if (window.confirm('Delete all locally stored figure progress? This cannot be undone.')) { try { figureProgress.clear(); renderProgress(); } catch { app.insertAdjacentHTML('afterbegin', '<p class="error" role="alert">Could not delete progress. Check browser storage access.</p>'); } } });
  focusMain();
}

function validateBank(data) { return validateFigureBank(data); }



function renderNotFound(id) {
  app.innerHTML = `<section class="panel"><p class="eyebrow">Figure Sequences · Learn</p><h1>Question not found.</h1><p class="muted">No published sequence has the ID <strong>${escapeHtml(id)}</strong>.</p><a class="button" href="${routeUrl('learn')}">Choose another sequence</a></section>`;
  focusMain();
}

function renderInitialPage() {
  if (INITIAL_PAGE === 'learn') {
    const id = new URL(window.location.href).searchParams.get('question');
    if (id) {
      const question = bank.find((candidate) => candidate.id === id);
      if (!question) return renderNotFound(id);
      return startSession('learn', question.difficulty.level, [question]);
    }
    return renderSetup('learn', difficultyFromUrl());
  }
  if (INITIAL_PAGE === 'drill') return renderSetup('drill', difficultyFromUrl());
  if (INITIAL_PAGE === 'mock') return renderMockIntro();
  if (INITIAL_PAGE === 'progress') return renderProgress();
  return renderHome();
}

function capitalize(value) { return value[0].toUpperCase() + value.slice(1); }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]); }

homeButton.addEventListener('click', (event) => { event.preventDefault(); navigateTo('home'); });
window.addEventListener('beforeunload', (event) => { if (activeSession && activeSession.mode !== 'learn') { event.preventDefault(); event.returnValue = ''; } });

fetch(new URL('../data/figure-sequences.json', import.meta.url))
  .then((response) => { if (!response.ok) throw new Error(`Question data returned ${response.status}`); return response.json(); })
  .then((data) => { bank = validateBank(data); renderInitialPage(); })
  .catch((error) => { console.error(error); app.innerHTML = '<p class="error">The Figure Sequence bank could not be loaded. Serve this directory through a static web server and try again.</p>'; });
