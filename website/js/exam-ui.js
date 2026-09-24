let instructionsOpen = true;
let textSize = 'medium';

export function setExamMode(active) {
  document.body.classList.toggle('exam-mode', active);
}

function questionLabel(label, answered, markedForReview) {
  return `${label}, ${answered ? 'answered' : 'unanswered'}${markedForReview ? ', marked for review' : ''}`;
}

export function examNavigator(items, current, isAnswered, noun = 'Question', reviewFlags = []) {
  return `<nav class="exam-navigator" aria-label="${noun} navigator">${items.map((item, index) => {
    const answered = isAnswered(item, index);
    const label = `${noun} ${index + 1}`;
    return `<button class="nav-question${answered ? ' answered' : ''}${index === current ? ' current' : ''}${reviewFlags[index] ? ' marked-for-review' : ''}" type="button" data-question="${index}" data-question-label="${label}" aria-label="${questionLabel(label, answered, reviewFlags[index])}" ${index === current ? 'aria-current="true"' : ''}>${index + 1}</button>`;
  }).join('')}</nav>`;
}

export function updateExamNavigator(app, index, answered) {
  const button = app.querySelector(`[data-question="${index}"]`);
  if (!button) return;
  button.classList.toggle('answered', answered);
  button.setAttribute('aria-label', questionLabel(button.dataset.questionLabel, answered, button.classList.contains('marked-for-review')));
}

export function examMarkup({ task, modeName, heading, instructions, content, navigator = '', current, count, timerLabel, timerValue, learnActions = '', checkLabel = 'Check answers', checkDisabled = false }) {
  const timed = Boolean(timerLabel);
  const moduleIndex = ['Figure Sequences', 'Mathematical Equations', 'Latin Squares'].indexOf(task);
  return `<section class="exam-shell" data-text-size="${textSize}">
    <header class="exam-header">
      <div class="exam-modules">
        <div class="exam-module"><div class="exam-module-bars" aria-hidden="true">${[0, 1, 2].map((index) => `<i${index === moduleIndex ? ' class="active"' : ''}></i>`).join('')}</div><strong>Core Module</strong><span>${task}</span></div>
        <div class="exam-module inactive"><div class="exam-module-bars" aria-hidden="true"><i></i></div><strong>Subject Module</strong><span>General Academic Module</span></div>
      </div>
      <div class="exam-header-actions">
        ${timed ? `<div class="exam-timer"><span>${timerLabel}</span><strong class="timer-value" id="timer-value">${timerValue}</strong></div>` : `<span class="exam-mode-label">${modeName}</span>`}
        <button class="exam-end" id="submit-session" type="button" ${checkDisabled ? 'disabled' : ''}>${timed ? 'End Subtest' : checkLabel}</button>
      </div>
    </header>
    <div class="exam-instructions">
      <div id="exam-instruction-text" ${instructionsOpen ? '' : 'hidden'}>${instructions}</div>
      <button class="exam-instruction-toggle" type="button" aria-label="${instructionsOpen ? 'Hide' : 'Show'} instructions" aria-controls="exam-instruction-text" aria-expanded="${instructionsOpen}"><span aria-hidden="true">${instructionsOpen ? '⌃' : '⌄'}</span></button>
    </div>
    <div class="exam-toolbar">
      <h1 class="exam-question-heading">${heading}</h1>
      <div class="exam-display-controls">
        <button class="exam-review-button" id="mark-for-review" type="button" aria-label="Mark for review" aria-pressed="false" title="Mark for review"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M5 2h14v20H5zM8 6h8M8 9h8M8 12h8M8 15h8M8 18h5" /></svg></button>
        <div class="exam-text-sizes" role="group" aria-label="Text size">${['small', 'medium', 'large'].map((size) => `<button type="button" data-text-size="${size}" aria-label="${size[0].toUpperCase() + size.slice(1)} text" aria-pressed="${textSize === size}">A</button>`).join('')}</div>
      </div>
    </div>
    <div class="exam-workspace">${content}${learnActions ? `<div class="exam-learn-actions">${learnActions}<div id="hint-area"></div></div>` : ''}</div>
    <footer class="exam-footer">
      <div class="exam-brand"><span class="exam-brand-mark" aria-hidden="true">dM</span><div><strong>dMAT</strong><span>Practice trainer</span></div></div>
      <div class="exam-navigation">
        ${count > 1 ? `<button class="exam-save" id="previous-question" type="button" ${current === 0 ? 'disabled' : ''}><span aria-hidden="true">←</span> Back</button>${navigator}<button class="exam-save" id="next-question" type="button">${current === count - 1 ? 'Save answer' : 'Save and Next'} <span aria-hidden="true">→</span></button>` : '<span class="exam-practice-note">Untimed practice</span>'}
      </div>
      <button class="exam-leave" id="leave-session" type="button">Leave session</button>
    </footer>
  </section>`;
}

export function bindExamControls(app, session) {
  const shell = app.querySelector('.exam-shell');
  const reviewButton = app.querySelector('#mark-for-review');
  function updateReviewMark() {
    const marked = session.reviewFlags[session.current];
    const label = marked ? 'Remove review mark' : 'Mark for review';
    reviewButton.setAttribute('aria-pressed', String(marked));
    reviewButton.setAttribute('aria-label', label);
    reviewButton.title = label;
    const question = app.querySelector(`[data-question="${session.current}"]`);
    if (question) {
      question.classList.toggle('marked-for-review', marked);
      updateExamNavigator(app, session.current, question.classList.contains('answered'));
    }
  }
  reviewButton.addEventListener('click', () => {
    session.reviewFlags[session.current] = !session.reviewFlags[session.current];
    updateReviewMark();
  });
  updateReviewMark();
  function toggleInstructions() {
    instructionsOpen = !instructionsOpen;
    app.querySelector('#exam-instruction-text').hidden = !instructionsOpen;
    app.querySelectorAll('[aria-controls="exam-instruction-text"]').forEach((button) => button.setAttribute('aria-expanded', String(instructionsOpen)));
    const toggle = app.querySelector('.exam-instruction-toggle');
    toggle.setAttribute('aria-label', `${instructionsOpen ? 'Hide' : 'Show'} instructions`);
    toggle.firstElementChild.textContent = instructionsOpen ? '⌃' : '⌄';
  }
  app.querySelectorAll('[aria-controls="exam-instruction-text"]').forEach((button) => button.addEventListener('click', toggleInstructions));
  app.querySelectorAll('button[data-text-size]').forEach((button) => button.addEventListener('click', () => {
    textSize = button.dataset.textSize;
    shell.dataset.textSize = textSize;
    app.querySelectorAll('button[data-text-size]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
  }));
  const navigator = app.querySelector('.exam-navigator');
  const current = navigator?.querySelector('[aria-current]');
  if (current) navigator.scrollLeft = current.offsetLeft - (navigator.clientWidth - current.clientWidth) / 2;
}

export function numberKeyboardMarkup() {
  return `<div class="exam-number-pad" role="group" aria-label="Virtual keyboard">
    <button type="button" class="exam-key-delete" data-number-key="delete" aria-label="Delete digit"><span aria-hidden="true">⇦</span> delete</button>
    ${['7', '8', '9', '4', '5', '6', '1', '2', '3', '0'].map((digit) => `<button type="button" data-number-key="${digit}"${digit === '0' ? ' class="exam-key-zero"' : ''}>${digit}</button>`).join('')}
  </div>`;
}

export function bindNumberKeyboard(app) {
  let activeInput = app.querySelector('[data-variable]');
  app.querySelectorAll('[data-variable]').forEach((input) => input.addEventListener('focus', () => { activeInput = input; }));
  app.querySelectorAll('[data-number-key]').forEach((button) => {
    // Keep the input's caret/selection when using a mouse or touch keyboard.
    button.addEventListener('pointerdown', (event) => event.preventDefault());
    button.addEventListener('click', () => {
      if (!activeInput) return;
      const start = activeInput.selectionStart ?? activeInput.value.length;
      const end = activeInput.selectionEnd ?? start;
      if (button.dataset.numberKey === 'delete') {
        activeInput.setRangeText('', start === end ? Math.max(0, start - 1) : start, end, 'end');
      } else if (activeInput.value.length - (end - start) < 2) {
        activeInput.setRangeText(button.dataset.numberKey, start, end, 'end');
      }
      activeInput.dispatchEvent(new Event('input', { bubbles: true }));
      activeInput.focus({ preventScroll: true });
    });
  });
}
