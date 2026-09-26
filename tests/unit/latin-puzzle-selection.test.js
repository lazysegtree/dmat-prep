import assert from 'node:assert/strict';
import test from 'node:test';
import { createPuzzleHistory } from '../../website/js/latin-puzzle-selection.js';
import { chooseDrillPuzzles } from '../../website/js/speed-drill.js';

const key = 'dmat-latin-puzzle-history-v1';
const bank = ['easy', 'exam', 'hard', 'extreme'].flatMap(level =>
  Array.from({ length: 12 }, (_, index) => ({ id: `${level}-${index}`, difficulty: { targetCell: level } })));
const ids = puzzles => puzzles.map(puzzle => puzzle.id);
const unchangedShuffle = () => 0.999;
function memoryStorage(value = '[]') {
  const values = new Map([[key, value]]);
  return {
    getItem: name => values.get(name) ?? null,
    setItem: (name, item) => values.set(name, item),
    removeItem: name => values.delete(name),
  };
}

test('unseen puzzles are exhausted before repeats, which use oldest selections first', () => {
  const pool = bank.slice(0, 12);
  const history = createPuzzleHistory(bank, [], memoryStorage());
  const select = count => history.select(pool, count, unchangedShuffle);
  const first = select(10);
  history.remember(first);
  const second = select(10);
  assert.deepEqual(ids(second), ids([...pool.slice(10), ...pool.slice(0, 8)]));
  assert.equal(new Set(ids(second)).size, 10);
  history.remember(second);
  assert.deepEqual(ids(select(2)), ids(pool.slice(8, 10)));
  assert.deepEqual(ids(pool), ids(bank.slice(0, 12)));
});

test('history survives reload and result truncation, including sessions never submitted', () => {
  const storage = memoryStorage();
  const original = createPuzzleHistory(bank, [], storage);
  original.remember(bank.slice(0, 10));
  const reloaded = createPuzzleHistory(bank, [], storage);
  assert.deepEqual(ids(reloaded.select(bank.slice(0, 12), 2)).sort(), ids(bank.slice(10, 12)).sort());
});

test('existing results seed history; saved selection order wins over older completed results', () => {
  const storage = memoryStorage(JSON.stringify(['missing', bank[1].id, bank[0].id, bank[1].id]));
  const history = createPuzzleHistory(bank, [
    { puzzleIds: [bank[2].id] }, { puzzleIds: [bank[0].id] }, null,
  ], storage);
  assert.deepEqual(ids(history.select(bank.slice(0, 4), 4, unchangedShuffle)), ids([bank[3], bank[2], bank[0], bank[1]]));
  history.remember([bank[3]]);
  assert.deepEqual(JSON.parse(storage.getItem(key)), ids([bank[2], bank[0], bank[1], bank[3]]));
  history.clear();
  assert.equal(storage.getItem(key), null);
  assert.deepEqual(ids(history.select(bank.slice(0, 4), 4, unchangedShuffle)), ids(bank.slice(0, 4)));
});

test('malformed or unavailable storage never prevents practice or in-memory repeat avoidance', () => {
  const brokenStorage = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('full'); },
    removeItem() { throw new Error('blocked'); },
  };
  for (const storage of [memoryStorage('{'), memoryStorage('{}'), brokenStorage]) {
    const history = createPuzzleHistory(bank, [], storage);
    history.remember(bank.slice(0, 11));
    assert.equal(history.select(bank.slice(0, 12), 1)[0].id, bank[11].id);
    assert.doesNotThrow(() => history.clear());
  }
});

test('consecutive mixed drills retain exact quotas and exclude previous selections', () => {
  const history = createPuzzleHistory(bank, [], memoryStorage());
  const first = chooseDrillPuzzles(bank, 'mixed-hard', 10, { selectPool: history.select });
  history.remember(first);
  const second = chooseDrillPuzzles(bank, 'mixed-hard', 10, { selectPool: history.select });
  assert.equal(second.some(puzzle => ids(first).includes(puzzle.id)), false);
  assert.deepEqual(second.reduce((counts, puzzle) => {
    const level = puzzle.difficulty.targetCell;
    counts[level] = (counts[level] || 0) + 1;
    return counts;
  }, {}), { exam: 4, hard: 5, extreme: 1 });
});
