import { SessionClock, TARGET_SECONDS, formatTime, median } from './session.js';

const app = document.querySelector('#app');
const homeButton = document.querySelector('#equation-home-button');
const SITE_ROOT = new URL('../', import.meta.url);
const INITIAL_PAGE = document.body.dataset.equationPage || 'home';
const FORMAT_VERSION = 2;
const STORAGE_KEY = 'dmat-equations-progress-v1';
const MODE_NAMES = { learn: 'Learn', drill: 'Speed Drill', mock: 'Full Mock' };
const DIFFICULTY_NAMES = { low: 'Low', medium: 'Medium', high: 'High' };
const ROUTES = {
  home: 'mathematical-equations/',
  learn: 'mathematical-equations/learn/',
  drill: 'mathematical-equations/speed-drill/',
  mock: 'mathematical-equations/mock/',
  progress: 'mathematical-equations/progress/',
};

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
  app.innerHTML = `
    <section>
      <p class="eyebrow">Mathematical Equations</p>
      <h1>Keep the algebra small.<br />Make the accuracy automatic.</h1>
      <p class="lede">Solve complete systems with 2–4 letters. Every answer is an integer from 1 to 20, and every published system has exactly one valid solution in that range.</p>
      <div class="home-actions" aria-label="Training modes">
        <a class="mode-card" href="${routeUrl('learn')}"><strong>Learn</strong><span>One untimed system, a strategy hint, and a worked solution.</span></a>
        <a class="mode-card" href="${routeUrl('drill')}"><strong>Speed Drill</strong><span>10 systems at the official pace of 75 seconds each.</span></a>
        <a class="mode-card" href="${routeUrl('mock')}"><strong>Full Mock</strong><span>20 systems in 25 minutes, with no feedback until submission.</span></a>
        <a class="mode-card" href="${routeUrl('progress')}"><strong>Progress</strong><span>Review equation accuracy, speed, and recent mock scores.</span></a>
      </div>
      <p class="module-back"><a href="${new URL('', SITE_ROOT).href}">← All task types</a></p>
    </section>`;
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
  const learn = mode === 'learn';
  app.innerHTML = `
    <section class="panel">
      <p class="eyebrow">Mathematical Equations · ${MODE_NAMES[mode]}</p>
      <h1>${learn ? 'Build a reliable method.' : 'Build a clean pace.'}</h1>
      <p class="muted">${learn ? 'Take as long as you need. Use the hint only when you cannot see the first substitution.' : 'Solve 10 complete systems. Results appear only after submission.'}</p>
      <p class="notice">No scratchpad is provided. Enter one integer from 1 to 20 for every letter.${learn ? '' : ' The 10-question target is 12:30.'}</p>
      <div class="field">
        <label for="difficulty">Training difficulty</label>
        <select id="difficulty">
          <option value="low"${difficulty === 'low' ? ' selected' : ''}>Low — short direct or one-hop reasoning</option>
          <option value="medium"${difficulty === 'medium' ? ' selected' : ''}>Medium — linked substitution or elimination</option>
          <option value="high"${difficulty === 'high' ? ' selected' : ''}>High — multi-step cancellation and memory load</option>
        </select>
        <p class="small muted">The labels come from a transparent mental-work score applied after generation; they are not official psychometric calibration.</p>
      </div>
      <div class="button-row"><button class="button" id="start-session" type="button">Start ${MODE_NAMES[mode]}</button><a class="button secondary" href="${routeUrl('home')}">Back</a></div>
    </section>`;
  const select = app.querySelector('#difficulty');
  select.addEventListener('change', () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('question');
    url.searchParams.set('difficulty', select.value);
    window.history.replaceState(null, '', url);
  });
  app.querySelector('#start-session').addEventListener('click', () => startSession(mode, select.value));
  focusMain();
}

function renderMockIntro() {
  app.innerHTML = `
    <section class="panel">
      <p class="eyebrow">Mathematical Equations · Full Mock</p>
      <h1>20 systems. 25 minutes.</h1>
      <p class="muted">This matches the official question count, time limit, integer range, and no-notes constraint.</p>
      <ul><li>All systems are selected before the timer starts.</li><li>The training mix is 6 Low, 8 Medium, and 6 High.</li><li>The mock submits automatically when time expires.</li></ul>
      <p class="small muted">The difficulty mix is a trainer choice; the official material does not publish the exam's difficulty distribution.</p>
      <div class="button-row"><button class="button" id="start-mock" type="button">Start Mock</button><a class="button secondary" href="${routeUrl('home')}">Back</a></div>
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

function chooseQuestions(mode, difficulty) {
  if (mode === 'learn') return shuffle(bank.filter((question) => question.difficulty.level === difficulty)).slice(0, 1);
  if (mode === 'drill') return shuffle(bank.filter((question) => question.difficulty.level === difficulty)).slice(0, 10);
  return shuffle([
    ...shuffle(bank.filter((question) => question.difficulty.level === 'low')).slice(0, 6),
    ...shuffle(bank.filter((question) => question.difficulty.level === 'medium')).slice(0, 8),
    ...shuffle(bank.filter((question) => question.difficulty.level === 'high')).slice(0, 6),
  ]);
}

function emptyEquationAnswer(question) {
  return Object.fromEntries(question.variables.map((variable) => [variable, '']));
}

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
    answers: questions.map(emptyEquationAnswer),
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
  activeSession.questionTimes[activeSession.current] += (Date.now() - activeSession.enteredQuestionAt) / 1000;
  activeSession.enteredQuestionAt = Date.now();
}

function answerComplete(question, answer) {
  return question.variables.every((variable) => String(answer[variable]).trim() !== '');
}

function validIntegerEntry(value) {
  return /^(?:[1-9]|1\d|20)$/.test(String(value).trim());
}

function answerStatus(question, answer) {
  if (!answerComplete(question, answer)) return 'unanswered';
  return question.variables.every((variable) => validIntegerEntry(answer[variable]) && Number(answer[variable]) === question.answer[variable]) ? 'correct' : 'incorrect';
}

function renderQuestion() {
  const session = activeSession;
  const question = session.questions[session.current];
  const timed = session.mode !== 'learn';
  const timerLabel = session.mode === 'mock' ? 'Time remaining' : 'Time elapsed';
  app.innerHTML = `
    <section>
      <div class="play-header">
        <div><p class="eyebrow">${MODE_NAMES[session.mode]} · ${DIFFICULTY_NAMES[question.difficulty.level]}</p><h2>${session.questions.length === 1 ? 'System' : `Question ${session.current + 1} of ${session.questions.length}`}</h2><p class="small muted">Question ID: ${question.id}</p></div>
        ${timed ? `<div class="timer"><span class="timer-label">${timerLabel}</span><strong class="timer-value" id="timer-value">${session.mode === 'mock' ? '25:00' : '0:00'}</strong></div>` : ''}
      </div>
      <div class="equation-play-layout">
        <div class="equation-card">
          <div class="equation-list" aria-label="System of equations">${question.equations.map((equation) => `<p>${escapeHtml(equation.display)}</p>`).join('')}</div>
          <div class="answer-fields" aria-label="Your values">${question.variables.map((variable) => `
            <label><span>${variable}</span><input type="number" inputmode="numeric" min="1" max="20" step="1" autocomplete="off" data-variable="${variable}" value="${escapeHtml(session.answers[session.current][variable])}" aria-label="Value of ${variable}" /></label>`).join('')}</div>
          <p class="small muted">Use integers from 1 to 20. Your entries are answers, not a scratchpad.</p>
        </div>
        <aside class="side-panel">
          ${session.questions.length > 1 ? `<h3>Questions</h3><div class="navigator" aria-label="Question navigator">${session.questions.map((item, index) => {
            const answered = answerComplete(item, session.answers[index]);
            return `<button class="nav-question${answered ? ' answered' : ''}${index === session.current ? ' current' : ''}" type="button" data-question="${index}" aria-label="Question ${index + 1}, ${answered ? 'answered' : 'unanswered'}" ${index === session.current ? 'aria-current="true"' : ''}>${index + 1}</button>`;
          }).join('')}</div><div class="legend"><span class="legend-item answered">Answered</span><span class="legend-item">Unanswered</span></div>` : '<p class="muted">Solve the system mentally, then enter every letter value.</p>'}
          ${session.mode === 'learn' ? '<div id="hint-area"></div>' : ''}
          <div class="session-actions">
            ${session.mode === 'learn' ? '<button class="button secondary" id="show-hint" type="button">Show strategy hint</button>' : ''}
            ${session.questions.length > 1 ? `<div class="button-row"><button class="button secondary" id="previous-question" type="button" ${session.current === 0 ? 'disabled' : ''}>Previous</button><button class="button secondary" id="next-question" type="button" ${session.current === session.questions.length - 1 ? 'disabled' : ''}>Next</button></div>` : ''}
            <button class="button" id="submit-session" type="button">${session.mode === 'learn' ? 'Check answers' : `Submit ${MODE_NAMES[session.mode]}`}</button>
            <button class="button secondary" id="leave-session" type="button">Leave session</button>
          </div>
        </aside>
      </div>
    </section>`;
  app.querySelectorAll('[data-variable]').forEach((input) => input.addEventListener('input', () => {
    session.answers[session.current][input.dataset.variable] = input.value;
    updateNavigator();
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
  focusMain();
  app.querySelector('[data-variable]')?.focus({ preventScroll: true });
}

function updateNavigator() {
  if (!activeSession || activeSession.questions.length === 1) return;
  const index = activeSession.current;
  const answered = answerComplete(activeSession.questions[index], activeSession.answers[index]);
  const button = app.querySelector(`[data-question="${index}"]`);
  button?.classList.toggle('answered', answered);
  button?.setAttribute('aria-label', `Question ${index + 1}, ${answered ? 'answered' : 'unanswered'}`);
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
    task: 'mathematical-equations',
    mode: session.mode,
    difficulty: session.difficulty,
    questionCount: session.questions.length,
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
  equationProgress.add(result);
  activeSession = null;
  renderResults(result, result.mode === 'learn' ? 0 : null);
}

function resultMetrics(result) {
  return `
    <div class="metric"><span>Correct</span><strong>${result.correct}</strong></div>
    <div class="metric"><span>Incorrect</span><strong>${result.incorrect}</strong></div>
    <div class="metric"><span>Unanswered</span><strong>${result.unanswered}</strong></div>
    <div class="metric"><span>Total time</span><strong>${formatTime(result.totalTime)}</strong></div>
    ${result.mode === 'learn' ? '' : `<div class="metric"><span>Median / system</span><strong>${formatTime(median(result.questionTimes))}</strong></div><div class="metric"><span>Over 75 seconds</span><strong>${result.questionTimes.filter((time) => time > TARGET_SECONDS).length}</strong></div>`}
    ${result.mode === 'mock' ? `<div class="metric"><span>Time remaining</span><strong>${formatTime(result.timeRemaining)}</strong></div>` : result.mode === 'drill' ? '<div class="metric"><span>Target total</span><strong>12:30</strong></div>' : ''}`;
}

function renderResults(result, reviewIndex = null) {
  const slowest = result.questionTimes.map((time, index) => ({ time, index })).sort((a, b) => b.time - a.time).slice(0, 3);
  app.innerHTML = `
    <section>
      <p class="eyebrow">Mathematical Equations · ${MODE_NAMES[result.mode]} results</p>
      <h1>${result.mode === 'mock' ? `${result.correct} out of 20` : result.correct === result.questionCount ? 'All correct' : `${result.correct} of ${result.questionCount} correct`}</h1>
      <p class="lede">${result.automatic ? 'Time expired, so the mock was submitted automatically.' : 'Review the exact substitution chain and where accuracy or time was lost.'}</p>
      <div class="results-summary">${resultMetrics(result)}</div>
      ${result.mode === 'learn' ? '' : `<h2>Slowest systems</h2><p class="muted">${slowest.map((item) => `Q${item.index + 1} (${formatTime(item.time)})`).join(' · ')}</p>`}
      <h2>Question review</h2>
      <div class="review-list">${result.statuses.map((status, index) => `<div class="review-row"><strong>Q${index + 1}</strong><div><span class="status ${status}">${capitalize(status)}</span><br /><span class="small muted">${result.questionIds[index]} · ${formatTime(result.questionTimes[index])}</span></div><button class="button secondary" type="button" data-review="${index}">Review</button></div>`).join('')}</div>
      <div id="review-detail"></div>
      <div class="button-row"><button class="button" id="repeat-mode" type="button">${result.mode === 'mock' ? 'Take another mock' : `New ${MODE_NAMES[result.mode]}`}</button><button class="button secondary" id="results-home" type="button">Equations home</button></div>
    </section>`;
  app.querySelectorAll('[data-review]').forEach((button) => button.addEventListener('click', () => showReview(result, Number(button.dataset.review))));
  app.querySelector('#repeat-mode').addEventListener('click', () => navigateTo(result.mode, result.difficulty ? { difficulty: result.difficulty } : {}));
  app.querySelector('#results-home').addEventListener('click', () => navigateTo('home'));
  if (reviewIndex !== null) showReview(result, reviewIndex);
  focusMain();
}

function showReview(result, index) {
  const question = bank.find((candidate) => candidate.id === result.questionIds[index]);
  const answer = result.answers[index];
  const factors = question.difficulty.factors;
  const detail = app.querySelector('#review-detail');
  detail.className = 'review-detail';
  detail.innerHTML = `
    <h2>Question ${index + 1}</h2>
    <p class="small muted">${question.id} · ${DIFFICULTY_NAMES[question.difficulty.level]} · score ${question.difficulty.score} · ${formatTime(result.questionTimes[index])}</p>
    <div class="equation-review-layout">
      <div class="equation-card compact"><h3>System</h3><div class="equation-list">${question.equations.map((equation) => `<p>${escapeHtml(equation.display)}</p>`).join('')}</div><div class="answer-comparison">${question.variables.map((variable) => `<p><strong>${variable}</strong><span>Your answer: ${escapeHtml(answer[variable] || '—')}</span><span>Correct: ${question.answer[variable]}</span></p>`).join('')}</div></div>
      <div class="difficulty-card"><h3>Why this is ${DIFFICULTY_NAMES[question.difficulty.level]}</h3><p class="small muted">The score measures the recorded mental path, not just the largest number.</p><dl><div><dt>Variables</dt><dd>${factors.variables}</dd></div><div><dt>Transformations</dt><dd>${factors.transformations}</dd></div><div><dt>Substitutions</dt><dd>${factors.substitutions}</dd></div><div><dt>Eliminations</dt><dd>${factors.eliminations}</dd></div><div><dt>Working memory</dt><dd>${factors.workingMemory}</dd></div><div><dt>Signed terms</dt><dd>${factors.signedTerms}</dd></div><div><dt>Arithmetic load</dt><dd>${factors.arithmeticLoad}</dd></div></dl></div>
    </div>
    <section class="inference-path"><div class="inference-path-header"><div><h3>Worked solution</h3><p class="small muted">The mental solution path recorded by the generator.</p></div><p class="inference-summary"><strong>${question.solutionSteps.length} steps</strong><span>mental-work score ${question.difficulty.score}</span></p></div><ol class="inference-steps">${question.solutionSteps.map((step, stepIndex) => `<li class="inference-step"><div class="inference-step-heading"><span class="inference-step-number" aria-hidden="true">${stepIndex + 1}</span><strong>${escapeHtml(step.text)}</strong></div></li>`).join('')}</ol></section>`;
  detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function readSessions() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

const equationProgress = {
  all: readSessions,
  add(result) { localStorage.setItem(STORAGE_KEY, JSON.stringify([result, ...readSessions()].slice(0, 50))); },
  clear() { localStorage.removeItem(STORAGE_KEY); },
  export() { return JSON.stringify({ version: 1, task: 'mathematical-equations', exportedAt: new Date().toISOString(), sessions: readSessions() }, null, 2); },
};

function progressSummary(sessions) {
  const mocks = sessions.filter((session) => session.mode === 'mock');
  const times = sessions.flatMap((session) => session.questionTimes || []);
  const total = sessions.reduce((sum, session) => sum + session.questionCount, 0);
  const correct = sessions.reduce((sum, session) => sum + session.correct, 0);
  return {
    latestMock: mocks[0]?.correct ?? null,
    bestMock: mocks.length ? Math.max(...mocks.map((session) => session.correct)) : null,
    accuracy: total ? (correct / total) * 100 : null,
    medianTime: times.length ? median(times) : null,
    withinTarget: times.length ? (times.filter((time) => time <= TARGET_SECONDS).length / times.length) * 100 : null,
  };
}

function renderProgress() {
  const sessions = equationProgress.all();
  const summary = progressSummary(sessions);
  const percent = (value) => value === null ? '—' : `${Math.round(value)}%`;
  app.innerHTML = `
    <section><p class="eyebrow">Mathematical Equations · Progress</p><h1>Your recent training</h1><p class="notice">Progress is stored only in this browser on this device. Up to 50 completed equation sessions are kept.</p>
      <div class="metrics"><div class="metric"><span>Latest mock</span><strong>${summary.latestMock === null ? '—' : `${summary.latestMock}/20`}</strong></div><div class="metric"><span>Best mock</span><strong>${summary.bestMock === null ? '—' : `${summary.bestMock}/20`}</strong></div><div class="metric"><span>Recent accuracy</span><strong>${percent(summary.accuracy)}</strong></div><div class="metric"><span>Median system time</span><strong>${summary.medianTime === null ? '—' : formatTime(summary.medianTime)}</strong></div><div class="metric"><span>Within 75 seconds</span><strong>${percent(summary.withinTarget)}</strong></div></div>
      <h2>Recent sessions</h2>${sessions.length ? `<div class="session-list">${sessions.map((session) => `<div class="session-row"><div><strong>${MODE_NAMES[session.mode]}</strong><br /><span class="small muted">${session.difficulty ? DIFFICULTY_NAMES[session.difficulty] : 'Mixed difficulty'}</span></div><strong>${session.correct}/${session.questionCount}</strong><time class="small muted" datetime="${session.date}">${new Date(session.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} · ${formatTime(session.totalTime)}</time></div>`).join('')}</div>` : '<p class="empty">Complete an equation session to see progress here.</p>'}
      <div class="button-row"><button class="button secondary" id="export-progress" type="button" ${sessions.length ? '' : 'disabled'}>Export progress</button><button class="button danger" id="delete-progress" type="button" ${sessions.length ? '' : 'disabled'}>Delete equation progress</button><a class="button secondary" href="${routeUrl('home')}">Equations home</a></div>
    </section>`;
  app.querySelector('#export-progress').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([equationProgress.export()], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `dmat-equations-progress-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url);
  });
  app.querySelector('#delete-progress').addEventListener('click', () => { if (window.confirm('Delete all locally stored equation progress? This cannot be undone.')) { equationProgress.clear(); renderProgress(); } });
  focusMain();
}

function validateBank(data) {
  if (data?.formatVersion !== FORMAT_VERSION || !Array.isArray(data.questions)) throw new Error('Unsupported or empty equation bank');
  const counts = { low: 0, medium: 0, high: 0 };
  const ids = new Set();
  for (const question of data.questions) {
    const factors = question?.difficulty?.factors;
    const score = factors ? factors.variables - 1 + factors.transformations + factors.substitutions + factors.eliminations + factors.workingMemory + factors.signedTerms + factors.arithmeticLoad : Number.NaN;
    const expectedLevel = score <= 9 ? 'low' : score <= 17 ? 'medium' : 'high';
    const valid = typeof question?.id === 'string' && !ids.has(question.id)
      && typeof question.family === 'string' && question.family.length > 0
      && Array.isArray(question.variables) && question.variables.length >= 2 && question.variables.length <= 4
      && Array.isArray(question.equations) && question.equations.length === question.variables.length
      && question.equations.every((equation) => typeof equation.display === 'string' && equation.display.length > 0)
      && question.variables.every((variable) => Number.isInteger(question.answer?.[variable]) && question.answer[variable] >= 1 && question.answer[variable] <= 20)
      && question.validation?.solutionsInRange === 1 && question.validation?.minimumValue === 1 && question.validation?.maximumValue === 20
      && Array.isArray(question.solutionSteps) && question.solutionSteps.length > 0
      && question.solutionSteps.every((step) => ['isolate', 'substitute', 'eliminate', 'simplify'].includes(step.kind)
        && Number.isInteger(step.memory) && step.memory >= 1 && step.memory <= question.variables.length
        && Number.isInteger(step.signedTerms) && step.signedTerms >= 0)
      && typeof question.hint === 'string'
      && question.difficulty.score === score && question.difficulty.level === expectedLevel;
    if (!valid || !Object.hasOwn(counts, question.difficulty.level)) throw new Error(`Equation question ${question?.id || '(missing ID)'} violates the bank contract`);
    ids.add(question.id); counts[question.difficulty.level] += 1;
  }
  if (counts.low < 10 || counts.medium < 10 || counts.high < 10) throw new Error('Equation bank needs at least 10 questions at every difficulty');
  return data.questions;
}

function renderNotFound(id) {
  app.innerHTML = `<section class="panel"><p class="eyebrow">Mathematical Equations · Learn</p><h1>Question not found.</h1><p class="muted">No published system has the ID <strong>${escapeHtml(id)}</strong>.</p><a class="button" href="${routeUrl('learn')}">Choose another system</a></section>`;
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

fetch(new URL('../data/mathematical-equations/questions.json', import.meta.url))
  .then((response) => { if (!response.ok) throw new Error(`Question data returned ${response.status}`); return response.json(); })
  .then((data) => { bank = validateBank(data); renderInitialPage(); })
  .catch((error) => { console.error(error); app.innerHTML = '<p class="error">The equation bank could not be loaded. Serve this directory through a static web server and try again.</p>'; });
