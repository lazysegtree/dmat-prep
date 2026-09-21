export const PROGRESS_KEYS = {
  'latin-squares': 'dmat-latin-progress-v1',
  'mathematical-equations': 'dmat-equations-progress-v1',
};

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonnegative = (value) => Number.isFinite(value) && value >= 0;

function validateSessions(sessions, task) {
  if (!Array.isArray(sessions)) throw new Error(`Missing session list for ${task}.`);
  const difficulties = task === 'latin-squares' ? ['easy', 'exam', 'hard', 'extreme'] : ['low', 'medium', 'high', 'extreme'];
  for (const session of sessions) {
    if (!isObject(session)
      || typeof session.id !== 'string' || !session.id.trim()
      || typeof session.date !== 'string'
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(session.date)
      || !Number.isFinite(Date.parse(session.date))
      || !['learn', 'drill', 'mock'].includes(session.mode)
      || (session.difficulty != null && !difficulties.includes(session.difficulty))
      || (session.task != null && session.task !== task)
      || (session.questionType != null && !['target', 'full'].includes(session.questionType))
      || !Number.isSafeInteger(session.questionCount) || session.questionCount < 1
      || !Number.isSafeInteger(session.correct) || session.correct < 0 || session.correct > session.questionCount
      || !nonnegative(session.totalTime)
      || !Array.isArray(session.questionTimes) || session.questionTimes.length !== session.questionCount
      || !session.questionTimes.every(nonnegative)) {
      throw new Error(`Invalid session in ${task}. No data was imported.`);
    }
  }
  return sessions;
}

export function parseBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Choose a valid JSON backup file.'); }
  if (!isObject(data)) throw new Error('Invalid backup format.');
  let progress;
  if (data.version === 2 && data.format === 'dmat-progress' && isObject(data.progress)) {
    progress = data.progress;
    if (Object.keys(progress).length !== 2 || !Object.keys(PROGRESS_KEYS).every((task) => Object.hasOwn(progress, task))) {
      throw new Error('The backup must contain both trainer session lists.');
    }
  } else if (data.version === 1 && (data.task === undefined || Object.hasOwn(PROGRESS_KEYS, data.task))) {
    // Original Latin Squares exports did not include a task field.
    progress = { [data.task || 'latin-squares']: data.sessions };
  } else {
    throw new Error('Unsupported backup format or version.');
  }
  for (const [task, sessions] of Object.entries(progress)) validateSessions(sessions, task);
  return progress;
}

function readProgress(storage, task) {
  const sessions = JSON.parse(storage.getItem(PROGRESS_KEYS[task]) || '[]');
  return validateSessions(sessions, task);
}

export function exportBackup(storage = localStorage) {
  const progress = Object.fromEntries(Object.keys(PROGRESS_KEYS).map((task) => [task, readProgress(storage, task)]));
  return JSON.stringify({ format: 'dmat-progress', version: 2, exportedAt: new Date().toISOString(), progress }, null, 2);
}

export function importBackup(text, mode, storage = localStorage) {
  if (!['merge', 'replace'].includes(mode)) throw new Error('Choose Merge or Replace.');
  const incoming = parseBackup(text);
  const updates = Object.entries(incoming).map(([task, sessions]) => {
    // Keep the local record on an ID conflict. Repeated imports are idempotent.
    const combined = mode === 'merge' ? [...readProgress(storage, task), ...sessions] : sessions;
    const unique = new Map();
    for (const session of combined) if (!unique.has(session.id)) unique.set(session.id, session);
    const kept = [...unique.values()].sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, 50);
    return { key: PROGRESS_KEYS[task], previous: storage.getItem(PROGRESS_KEYS[task]), value: JSON.stringify(kept) };
  });
  const written = [];
  try {
    for (const update of updates) {
      storage.setItem(update.key, update.value);
      written.push(update);
    }
  } catch {
    for (const update of written.reverse()) {
      if (update.previous === null) storage.removeItem(update.key);
      else storage.setItem(update.key, update.previous);
    }
    throw new Error('Could not save the import. Existing progress was restored. Check available browser storage.');
  }
}

export function transferMarkup() {
  return `<section class="data-transfer" aria-labelledby="data-transfer-title">
    <h2 id="data-transfer-title">Back up or restore your data</h2>
    <p class="small muted">Export includes all saved Latin Squares and Mathematical Equations progress. This app has no separate profile data. Figure Sequences does not save progress.</p>
    <button class="button secondary" id="export-progress" type="button">Export all progress</button>
    <form id="import-progress-form">
      <div class="setup-grid">
        <label>Backup file<input id="import-file" type="file" accept=".json,application/json" required /></label>
        <label>Import mode<select id="import-mode"><option value="merge">Merge</option><option value="replace">Replace</option></select></label>
      </div>
      <p class="small muted">Merge combines sessions and keeps existing records with the same ID. Replace overwrites progress for the trainers in the file. Both modes keep the newest 50 sessions per trainer. Older single-trainer exports affect only that trainer.</p>
      <button class="button" type="submit">Import progress</button>
    </form>
    <p id="transfer-status" role="status" aria-live="polite"></p>
  </section>`;
}

export function bindTransfer(root, onImport = () => {}) {
  const status = () => root.querySelector('#transfer-status');
  root.querySelector('#export-progress').addEventListener('click', () => {
    try {
      const url = URL.createObjectURL(new Blob([exportBackup()], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `dmat-progress-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status().textContent = 'Backup exported.';
    } catch {
      status().textContent = 'Could not export progress. Check browser storage access and saved data.';
    }
  });
  root.querySelector('#import-progress-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const file = root.querySelector('#import-file').files[0];
    const mode = root.querySelector('#import-mode').value;
    if (!file) return;
    const button = event.target.querySelector('button');
    button.disabled = true;
    try {
      if (file.size > MAX_FILE_BYTES) throw new Error('Choose a backup smaller than 10 MB.');
      const text = await file.text();
      const tasks = Object.keys(parseBackup(text));
      if (mode === 'replace' && !window.confirm(`Replace saved progress for ${tasks.join(' and ')} with this backup? Existing progress for these trainers will be removed.`)) {
        status().textContent = 'Import cancelled. Existing progress was kept.';
        return;
      }
      importBackup(text, mode);
      onImport();
      root.querySelector('#import-file').value = '';
      status().textContent = `Progress ${mode === 'merge' ? 'merged' : 'replaced'} successfully.`;
    } catch (error) {
      status().textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
}
