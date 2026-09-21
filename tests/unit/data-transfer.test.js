import assert from 'node:assert/strict';
import test from 'node:test';
import { PROGRESS_KEYS, exportBackup, importBackup } from '../../website/js/data-transfer.js';

const latin = PROGRESS_KEYS['latin-squares'];
const equations = PROGRESS_KEYS['mathematical-equations'];
const session = (id, day = 1) => ({ id, date: new Date(Date.UTC(2026, 0, day)).toISOString(), mode: 'learn', questionType: 'target', questionCount: 1, correct: 1, totalTime: 30, questionTimes: [30], answers: [['A']] });
function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
}
const legacy = (sessions, task) => JSON.stringify({ version: 1, task, sessions });

test('export and replace round trip all stored data across both trainers', () => {
  const source = storage({ [latin]: JSON.stringify([session('latin')]), [equations]: JSON.stringify([session('equations')]) });
  const destination = storage({ [latin]: JSON.stringify([session('old')]), unrelated: 'keep' });
  importBackup(exportBackup(source), 'replace', destination);
  assert.equal(destination.getItem(latin), source.getItem(latin));
  assert.equal(destination.getItem(equations), source.getItem(equations));
  assert.equal(destination.getItem('unrelated'), 'keep');
});

test('merge deduplicates by ID, preserves local conflicts, sorts and retains newest 50', () => {
  const local = session('same', 60);
  const target = storage({ [latin]: JSON.stringify([local]) });
  const incoming = [ { ...local, correct: 0 }, ...Array.from({ length: 55 }, (_, i) => session(`incoming-${i}`, i + 1)) ];
  importBackup(legacy(incoming), 'merge', target);
  const firstImport = target.getItem(latin);
  importBackup(legacy(incoming), 'merge', target);
  assert.equal(target.getItem(latin), firstImport);
  const records = JSON.parse(firstImport);
  assert.equal(records.length, 50);
  assert.deepEqual(records[0], local);
  assert.equal(records.at(-1).id, 'incoming-6');
});

test('legacy replace affects only its trainer, including an empty backup', () => {
  const target = storage({ [latin]: JSON.stringify([session('a')]), [equations]: JSON.stringify([session('b')]) });
  importBackup(legacy([], 'mathematical-equations'), 'replace', target);
  assert.equal(target.getItem(equations), '[]');
  assert.equal(JSON.parse(target.getItem(latin))[0].id, 'a');
  importBackup(legacy([]), 'replace', target);
  assert.equal(target.getItem(latin), '[]');
});

test('invalid files and unsafe rendered fields leave all saved data unchanged', () => {
  const target = storage({ [latin]: JSON.stringify([session('a')]) });
  const before = exportBackup(target);
  for (const file of ['no JSON', '{}', legacy([session('a')], 'unknown'),
    legacy([{ ...session('a'), date: '\"><img src=x onerror=alert(1)>' }]),
    legacy([{ ...session('a'), correct: '1' }]),
    legacy([{ ...session('a'), questionTimes: [-1] }]),
    JSON.stringify({ format: 'dmat-progress', version: 2, progress: { 'latin-squares': [], 'mathematical-equations': [{}] } }),
    JSON.stringify({ format: 'dmat-progress', version: 2, progress: {} })]) {
    assert.throws(() => importBackup(file, 'replace', target));
    assert.deepEqual(JSON.parse(exportBackup(target)).progress, JSON.parse(before).progress);
  }
  assert.throws(() => importBackup(legacy([]), 'invalid', target));
});

test('failure writing the second trainer rolls back the first trainer', () => {
  const source = storage({ [latin]: JSON.stringify([session('new')]), [equations]: JSON.stringify([session('other')]) });
  const target = storage({ [latin]: JSON.stringify([session('old')]) });
  const before = target.getItem(latin);
  const set = target.setItem;
  target.setItem = (key, value) => { if (key === equations) throw new Error('quota'); set(key, value); };
  assert.throws(() => importBackup(exportBackup(source), 'replace', target), /restored/);
  assert.equal(target.getItem(latin), before);
  assert.equal(target.getItem(equations), null);
});
