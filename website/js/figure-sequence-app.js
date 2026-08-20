const app = document.querySelector('#figure-app');
const COLORS = {
  teal: '#16866f',
  magenta: '#c64f82',
  amber: '#f0b429',
  ink: '#27332b',
};
const DIFFICULTY_NAMES = { low: 'Low', medium: 'Medium', high: 'High' };

let bank = [];
let currentPool = [];
let currentIndex = 0;
let answers = [null, null];
let checked = false;
let hintVisible = false;
let startedAt = 0;
let timer = null;

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
    <g fill="none" stroke="#89938c" stroke-width="1">${gridLines}</g>
    <rect x="1" y="1" width="98" height="98" fill="none" stroke="#27332b" stroke-width="2" />
    ${figures}
  </svg>`;
}

function frameCard(frame, puzzle, label) {
  return `<div class="sequence-frame-card" role="img" aria-label="${label}: ${frameDescription(frame)}">
    ${frameSVG(frame, puzzle)}
    <span>${label}</span>
  </div>`;
}

function answerClass(questionIndex, optionIndex, answerIndex) {
  const classes = ['sequence-option'];
  if (answers[questionIndex] === optionIndex) classes.push('selected');
  if (checked && optionIndex === answerIndex) classes.push('correct');
  if (checked && answers[questionIndex] === optionIndex && optionIndex !== answerIndex) classes.push('incorrect');
  return classes.join(' ');
}

function questionMarkup(question, questionIndex, puzzle) {
  return `<fieldset class="sequence-answer-group">
    <legend>Image ${questionIndex + 1} · Matrix ${question.frameNumber}</legend>
    <div class="sequence-options">
      ${question.options.map((option, optionIndex) => `
        <button class="${answerClass(questionIndex, optionIndex, question.answerIndex)}" type="button"
          data-question="${questionIndex}" data-option="${optionIndex}"
          aria-pressed="${answers[questionIndex] === optionIndex}" ${checked ? 'disabled' : ''}>
          ${frameSVG(option, puzzle)}
          <strong>Matrix ${optionIndex + 1}</strong>
        </button>`).join('')}
    </div>
  </fieldset>`;
}

function elapsedSeconds() {
  return Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
}

function formatTime(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function updateTimer() {
  const element = document.querySelector('#sequence-timer');
  if (!element || !startedAt) return;
  const elapsed = elapsedSeconds();
  element.textContent = formatTime(elapsed);
  element.classList.toggle('urgent', elapsed > 75);
}

function renderSetup() {
  window.clearInterval(timer);
  timer = null;
  startedAt = 0;
  app.innerHTML = `<section class="panel sequence-setup">
    <p class="eyebrow">Figure Sequences · Proof of concept</p>
    <h1>Predict the next two matrices.</h1>
    <p class="muted">Track position, colour, and rotation across four 4×4 matrices. Choose one option for image 5 and one for image 6.</p>
    <p class="notice">The generator and difficulty labels are provisional. Every published option is checked for legal positions, no overlap, and deterministic replay.</p>
    <div class="field">
      <label for="sequence-difficulty">Difficulty</label>
      <select id="sequence-difficulty">
        <option value="low">Low · one moving figure</option>
        <option value="medium">Medium · three tracked figures</option>
        <option value="high" selected>High · four figures and coupled changes</option>
      </select>
    </div>
    <div class="button-row">
      <button class="button" id="start-sequence" type="button">Start figure practice</button>
      <a class="button secondary link-button" href="./">Back to Latin squares</a>
    </div>
  </section>`;
  app.querySelector('#start-sequence').addEventListener('click', () => {
    const difficulty = app.querySelector('#sequence-difficulty').value;
    currentPool = bank.filter((puzzle) => puzzle.difficulty.level === difficulty);
    currentIndex = Math.floor(Math.random() * currentPool.length);
    startPuzzle();
  });
  app.focus({ preventScroll: true });
}

function startPuzzle() {
  answers = [null, null];
  checked = false;
  hintVisible = false;
  startedAt = Date.now();
  window.clearInterval(timer);
  timer = window.setInterval(updateTimer, 250);
  renderPuzzle();
}

function renderPuzzle() {
  const puzzle = currentPool[currentIndex];
  const correctCount = checked
    ? puzzle.questions.filter((question, index) => answers[index] === question.answerIndex).length
    : null;
  app.innerHTML = `<section>
    <div class="play-header">
      <div>
        <p class="eyebrow">Figure Sequences · ${DIFFICULTY_NAMES[puzzle.difficulty.level]} · provisional score ${puzzle.difficulty.score}</p>
        <h2>Continue the sequence</h2>
        <p class="small muted">${puzzle.id}</p>
      </div>
      <div class="timer"><span class="timer-label">Time elapsed</span><strong class="timer-value" id="sequence-timer">${formatTime(elapsedSeconds())}</strong></div>
    </div>
    <p class="muted sequence-instruction">Study the four matrices, then choose both missing images. Examination pace is 75 seconds per sequence.</p>
    <div class="observed-strip" aria-label="Observed sequence">
      ${puzzle.observedFrames.map((frame, index) => frameCard(frame, puzzle, `Matrix ${index + 1}`)).join('')}
    </div>
    <div class="missing-divider" aria-hidden="true"><span>?</span><span>?</span></div>
    <div class="sequence-questions">
      ${puzzle.questions.map((question, index) => questionMarkup(question, index, puzzle)).join('')}
    </div>
    ${hintVisible && !checked ? `<div class="hint-box"><strong>Hint</strong><br />${puzzle.hint}</div>` : ''}
    ${checked ? `<div class="sequence-result ${correctCount === 2 ? 'correct' : 'incorrect'}">
      <strong>${correctCount === 2 ? 'Both matrices are correct.' : `${correctCount} of 2 matrices correct.`}</strong>
      <span>Time: ${formatTime(elapsedSeconds())}</span>
    </div>
    <div class="inference-path">
      <h3>Rule explanation</h3>
      <ol class="inference-steps">${puzzle.programs.map((program, index) => `<li class="inference-step"><div class="inference-step-heading"><span class="inference-step-number">${index + 1}</span><strong>${program.actorId}</strong></div><p>${program.explanation}</p></li>`).join('')}</ol>
    </div>` : ''}
    <div class="button-row sequence-actions">
      ${!checked ? `<button class="button" id="check-sequence" type="button" ${answers.some((answer) => answer === null) ? 'disabled' : ''}>Check both answers</button>
      <button class="button secondary" id="show-sequence-hint" type="button" ${hintVisible ? 'disabled' : ''}>Show a hint</button>` : '<button class="button" id="next-sequence" type="button">Try another sequence</button>'}
      <button class="button secondary" id="change-difficulty" type="button">Change difficulty</button>
    </div>
  </section>`;

  app.querySelectorAll('[data-question]').forEach((button) => button.addEventListener('click', () => {
    answers[Number(button.dataset.question)] = Number(button.dataset.option);
    renderPuzzle();
  }));
  app.querySelector('#check-sequence')?.addEventListener('click', () => {
    checked = true;
    window.clearInterval(timer);
    timer = null;
    renderPuzzle();
  });
  app.querySelector('#show-sequence-hint')?.addEventListener('click', () => {
    hintVisible = true;
    renderPuzzle();
  });
  app.querySelector('#next-sequence')?.addEventListener('click', () => {
    currentIndex = (currentIndex + 1) % currentPool.length;
    startPuzzle();
  });
  app.querySelector('#change-difficulty').addEventListener('click', renderSetup);
  updateTimer();
  app.focus({ preventScroll: true });
}

function validateBank(data) {
  if (data?.formatVersion !== 1 || !Array.isArray(data?.puzzles)) throw new Error('Unsupported Figure Sequence bank');
  const counts = { low: 0, medium: 0, high: 0 };
  for (const puzzle of data.puzzles) {
    if (puzzle?.kind !== 'figure-sequence' || puzzle?.gridSize !== 4 || puzzle?.observedFrames?.length !== 4 || puzzle?.questions?.length !== 2) {
      throw new Error(`Invalid Figure Sequence puzzle ${puzzle?.id ?? '(missing ID)'}`);
    }
    if (!puzzle.questions.every((question) => question.options?.length === 3 && Number.isInteger(question.answerIndex))) {
      throw new Error(`Invalid answer options for ${puzzle.id}`);
    }
    counts[puzzle.difficulty.level] += 1;
  }
  for (const [level, count] of Object.entries(counts)) {
    if (count < 10) throw new Error(`Figure Sequence bank needs at least 10 ${level} puzzles`);
  }
  return data.puzzles;
}

fetch('data/figure-sequences.json')
  .then((response) => {
    if (!response.ok) throw new Error(`Figure Sequence data returned ${response.status}`);
    return response.json();
  })
  .then((data) => {
    bank = validateBank(data);
    renderSetup();
  })
  .catch((error) => {
    console.error(error);
    app.innerHTML = '<p class="error">The Figure Sequence bank could not be loaded. Serve this directory through a static web server and try again.</p>';
  });
