import { LATIN_DRILL, drillSettings } from './speed-drill.js';
import { TARGET_SECONDS, formatTime } from './session.js';

export function renderDrillSetup(app, { config = LATIN_DRILL, task, homeUrl, instruction, difficultyNote, onStart }) {
  const settings = drillSettings(new URL(window.location.href).searchParams, config);
  const mixed = Object.hasOwn(config.mixes, settings.difficulty);
  app.innerHTML = `
    <section class="panel">
      <p class="eyebrow">${task} · Speed Drill</p>
      <h1>Build a steady pace.</h1>
      <p class="muted">Choose a short session. Answers and puzzle difficulties are revealed only after submission.</p>
      <form id="drill-setup">
        <div class="drill-setup-grid">
          <div class="field"><label for="question-count">Questions</label><select id="question-count"><option value="5">5 questions</option><option value="10">10 questions</option></select></div>
          <div class="field">
            <label for="drill-timer">Time limit</label><select id="drill-timer"><option value="pace">75 seconds per question</option><option value="custom">Custom time</option><option value="none">No limit — stopwatch</option></select>
            <div id="custom-time-field" hidden>
              <div class="drill-custom-time"><label for="drill-minutes">Minutes</label><input id="drill-minutes" type="number" min="0.25" max="180" step="0.25" aria-describedby="drill-time-help" required /></div>
              <p class="small muted" id="drill-time-help">0.25 min = 15 seconds</p>
            </div>
          </div>
          <div class="field"><label for="drill-distribution">Distribution</label><select id="drill-distribution"><option value="mixed">Mixed</option><option value="single">Single difficulty</option></select></div>
          <div class="field"><label for="difficulty" id="drill-level-label">Mix</label><select id="difficulty" aria-describedby="drill-mix-description"></select></div>
        </div>
        <p class="small muted" id="drill-mix-description"></p>
        <p class="small muted">${difficultyNote} These training levels are not officially calibrated.</p>
        <p class="notice" id="drill-summary" aria-live="polite"></p>
        <div class="button-row"><button class="button" type="submit">Start Speed Drill</button><a class="button secondary" href="${homeUrl}">Back</a></div>
      </form>
    </section>`;
  const form = app.querySelector('#drill-setup');
  const count = form.querySelector('#question-count');
  const timer = form.querySelector('#drill-timer');
  const minutes = form.querySelector('#drill-minutes');
  const distribution = form.querySelector('#drill-distribution');
  const difficulty = form.querySelector('#difficulty');
  count.value = settings.questionCount;
  timer.value = settings.timer;
  minutes.value = settings.minutes;
  distribution.value = mixed ? 'mixed' : 'single';
  const populateLevels = (selected) => {
    const isMixed = distribution.value === 'mixed';
    const levels = isMixed ? Object.fromEntries(Object.entries(config.mixes).map(([key, value]) => [key, value.name]))
      : Object.fromEntries(Object.entries(config.names).map(([key, name]) => [key, `All ${name}`]));
    app.querySelector('#drill-level-label').textContent = isMixed ? 'Mix' : 'Training difficulty';
    difficulty.innerHTML = Object.entries(levels).map(([key, name]) => `<option value="${key}">${name}</option>`).join('');
    difficulty.value = Object.hasOwn(levels, selected) ? selected : isMixed ? 'mixed-all' : config.levels[1];
  };
  populateLevels(settings.difficulty);
  const readSettings = () => drillSettings(new URLSearchParams({ difficulty: difficulty.value, count: count.value, timer: timer.value, minutes: minutes.value }), config);
  const update = () => {
    const current = readSettings();
    app.querySelector('#custom-time-field').hidden = timer.value !== 'custom';
    minutes.disabled = timer.value !== 'custom';
    const mix = config.mixes[current.difficulty];
    const weights = Object.entries(mix?.mix || { [current.difficulty]: 1 });
    const totalWeight = weights.reduce((sum, [, weight]) => sum + weight, 0);
    const proportions = weights.map(([level, weight]) => `${100 * weight / totalWeight}% ${config.names[level]}`).join(' · ');
    app.querySelector('#drill-mix-description').textContent = `${proportions}.${mix ? ' Short drills round to whole questions; question order is random.' : ''}`;
    app.querySelector('#drill-summary').textContent = `${current.questionCount} questions · ${current.timeLimit === null ? `Stopwatch, with a ${formatTime(current.questionCount * TARGET_SECONDS)} pace target.` : `${formatTime(current.timeLimit)} total. The drill submits when time runs out.`} ${instruction}`;
    if (timer.value === 'custom' && !minutes.validity.valid) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('puzzle');
    url.searchParams.delete('question');
    url.searchParams.set('difficulty', current.difficulty);
    url.searchParams.set('count', current.questionCount);
    url.searchParams.set('timer', current.timer);
    if (current.timer === 'custom') url.searchParams.set('minutes', current.minutes);
    else url.searchParams.delete('minutes');
    window.history.replaceState(null, '', url);
  };
  distribution.addEventListener('change', () => populateLevels());
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    update();
    const current = readSettings();
    onStart(current);
  });
  update();
  app.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: 'instant' });
}

export function drillTimeMetrics(result) {
  if (result.mode !== 'drill') return '';
  return `<div class="metric"><span>${result.timeLimit == null ? 'Pace target' : 'Time limit'}</span><strong>${formatTime(result.timeLimit ?? result.questionCount * TARGET_SECONDS)}</strong></div>
    ${result.timeLimit != null ? `<div class="metric"><span>Time remaining</span><strong>${formatTime(result.timeRemaining)}</strong></div>` : ''}`;
}
