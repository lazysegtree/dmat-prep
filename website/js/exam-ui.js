let instructionsOpen = true;
let textSize = 'medium';

export function setExamMode(active) {
  document.body.classList.toggle('exam-mode', active);
}

export function examNavigator(items, current, isAnswered, noun = 'Question') {
  return `<nav class="exam-navigator" aria-label="${noun} navigator">${items.map((item, index) => {
    const answered = isAnswered(item, index);
    return `<button class="nav-question${answered ? ' answered' : ''}${index === current ? ' current' : ''}" type="button" data-question="${index}" aria-label="${noun} ${index + 1}, ${answered ? 'answered' : 'unanswered'}" ${index === current ? 'aria-current="true"' : ''}>${index + 1}</button>`;
  }).join('')}</nav>`;
}

export function examMarkup({ task, modeName, heading, instructions, content, navigator = '', current, count, timerLabel, timerValue, learnActions = '', checkLabel = 'Check answers', checkDisabled = false }) {
  const timed = Boolean(timerLabel);
  return `<section class="exam-shell" data-text-size="${textSize}">
    <header class="exam-header">
      <div class="exam-modules">
        <div class="exam-module"><div class="exam-module-bars" aria-hidden="true"><i></i><i class="active"></i><i></i></div><strong>Core Module</strong><span>${task}</span></div>
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
        <button class="exam-instruction-button" type="button" aria-label="Toggle instructions" aria-controls="exam-instruction-text" aria-expanded="${instructionsOpen}"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M5 2h14v20H5zM8 6h8M8 9h8M8 12h8M8 15h8M8 18h5" /></svg></button>
        <div class="exam-text-sizes" role="group" aria-label="Text size">${['small', 'medium', 'large'].map((size) => `<button type="button" data-text-size="${size}" aria-label="${size[0].toUpperCase() + size.slice(1)} text" aria-pressed="${textSize === size}">A</button>`).join('')}</div>
      </div>
    </div>
    <div class="exam-workspace">${content}${learnActions ? `<div class="exam-learn-actions">${learnActions}<div id="hint-area"></div></div>` : ''}</div>
    <footer class="exam-footer">
      <div class="exam-brand"><span class="exam-brand-mark" aria-hidden="true">dM</span><div><strong>dMAT</strong><span>Practice trainer</span></div></div>
      <div class="exam-navigation">
        ${count > 1 ? `<button class="exam-save" id="previous-question" type="button" ${current === 0 ? 'disabled' : ''}><span aria-hidden="true">←</span> Save and back</button>${navigator}<button class="exam-save" id="next-question" type="button" ${current === count - 1 ? 'disabled' : ''}>Save and forward <span aria-hidden="true">→</span></button>` : '<span class="exam-practice-note">Untimed practice</span>'}
      </div>
      <button class="exam-leave" id="leave-session" type="button">Leave session</button>
    </footer>
  </section>`;
}

export function bindExamControls(app) {
  const shell = app.querySelector('.exam-shell');
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
