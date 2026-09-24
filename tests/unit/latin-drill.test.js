import assert from 'node:assert/strict';
import test from 'node:test';
import { DRILL_DIFFICULTIES, DRILL_MIXES, drillSettings, drillMix, chooseDrillPuzzles } from '../../website/js/latin-drill.js';
import { parseBackup } from '../../website/js/data-transfer.js';

function randomFromSeed(seed) {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

const bank = ['easy', 'exam', 'hard', 'extreme'].flatMap(level =>
  Array.from({ length: 12 }, (_, index) => ({ id: `${level}-${index}`, difficulty: { targetCell: level } })));

test('every short drill has its requested count, no repeats, and proportional difficulty quotas', () => {
  for (const difficulty of DRILL_DIFFICULTIES) {
    for (const count of [5, 10]) {
      for (let seed = 1; seed <= 40; seed++) {
        const puzzles = chooseDrillPuzzles(bank, difficulty, count, randomFromSeed(seed));
        assert.equal(puzzles.length, count);
        assert.equal(new Set(puzzles.map(puzzle => puzzle.id)).size, count);
        const actual = puzzles.reduce((counts, puzzle) => {
          const level = puzzle.difficulty.targetCell;
          counts[level] = (counts[level] || 0) + 1;
          return counts;
        }, {});
        const weights = DRILL_MIXES[difficulty]?.mix || { [difficulty]: 1 };
        const total = Object.values(weights).reduce((a, b) => a + b, 0);
        for (const [level, weight] of Object.entries(weights)) {
          const quota = count * weight / total;
          assert.ok([Math.floor(quota), Math.ceil(quota)].includes(actual[level] || 0));
        }
        assert.ok(Object.keys(actual).every(level => Object.hasOwn(weights, level)));
        if (difficulty === 'mixed-all') assert.equal(Object.keys(actual).length, 4);
      }
    }
  }
  assert.deepEqual(drillMix('mixed-hard', 10), { hard: 5, exam: 4, extreme: 1 });
  assert.deepEqual(drillMix('mixed-easy', 10), { easy: 5, exam: 4, hard: 1 });
  assert.deepEqual(drillMix('mixed-medium', 10), { easy: 3, exam: 4, hard: 3 });
});

test('mixed drills vary both question order and tied allocations across runs', () => {
  const sequences = new Set();
  const extraTiers = new Set();
  for (let seed = 1; seed <= 80; seed++) {
    const levels = chooseDrillPuzzles(bank, 'mixed-all', 5, randomFromSeed(seed)).map(p => p.difficulty.targetCell);
    sequences.add(levels.join(','));
    extraTiers.add(levels.find(level => levels.filter(value => value === level).length === 2));
  }
  assert.ok(sequences.size > 20);
  assert.equal(extraTiers.size, 4);
  assert.throws(() => chooseDrillPuzzles(bank.slice(0, 2), 'easy', 5), /Not enough/);
  assert.throws(() => drillMix('unknown', 5), /supported/);
  assert.throws(() => drillMix('easy', 20), /supported/);
});

test('drill settings normalize malformed links and compute both countdown and stopwatch timing', () => {
  const settings = query => drillSettings(new URLSearchParams(query));
  assert.deepEqual(settings(''), { difficulty: 'mixed-all', questionCount: 5, timer: 'pace', minutes: 5, timeLimit: 375 });
  assert.deepEqual(settings('difficulty=unknown&count=-1&timer=bad&minutes=Infinity'), settings(''));
  assert.equal(settings('count=10').timeLimit, 750);
  assert.equal(settings('timer=none').timeLimit, null);
  assert.equal(settings('timer=custom&minutes=0.25').timeLimit, 15);
  assert.equal(settings('timer=custom&minutes=7.5').timeLimit, 450);
  assert.equal(settings('timer=custom&minutes=180').timeLimit, 10800);
  for (const minutes of ['0', '-1', '181', '0.3', 'abc']) assert.equal(settings(`minutes=${minutes}`).minutes, 5);
  assert.equal(settings('difficulty=hard').difficulty, 'hard');
});

test('backup validation accepts new and legacy drills but rejects invalid timer metadata', () => {
  const session = { id: 'drill', date: '2026-09-24T10:00:00Z', mode: 'drill', difficulty: 'mixed-all',
    questionCount: 5, correct: 0, totalTime: 15, questionTimes: [15, 0, 0, 0, 0] };
  const parse = overrides => parseBackup(JSON.stringify({ version: 1, task: 'latin-squares', sessions: [{ ...session, ...overrides }] }));
  for (const difficulty of DRILL_DIFFICULTIES) assert.doesNotThrow(() => parse({ difficulty }));
  assert.doesNotThrow(() => parse({ difficulty: 'exam', questionCount: 10, questionTimes: Array(10).fill(0) }));
  assert.doesNotThrow(() => parse({ timeLimit: 375, drillTimer: 'pace' }));
  assert.doesNotThrow(() => parse({ timeLimit: 15, drillTimer: 'custom' }));
  assert.doesNotThrow(() => parse({ timeLimit: null, drillTimer: 'none' }));
  for (const bad of [{ difficulty: 'mixed-unknown' }, { mode: 'learn' }, { mode: 'mock' },
    { timeLimit: -1 }, { timeLimit: '15' }, { timeLimit: 0 }, { timeLimit: 16 }, { timeLimit: 10815 },
    { drillTimer: 'unknown' }, { drillTimer: 'pace', timeLimit: 750 }, { drillTimer: 'none', timeLimit: 15 },
    { drillTimer: 'custom', timeLimit: null }]) assert.throws(() => parse(bad));
});
