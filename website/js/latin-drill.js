import { TARGET_SECONDS } from './session.js';

export const MOCK_LEVELS = {
  easy: { name: 'Easy', mix: { easy: 10, exam: 8, hard: 2 } },
  normal: { name: 'Normal', mix: { easy: 6, exam: 8, hard: 6 } },
  hard: { name: 'Hard', mix: { exam: 8, hard: 10, extreme: 2 } },
  extreme: { name: 'Extreme', mix: { exam: 5, hard: 10, extreme: 5 } },
};

export const DRILL_MIXES = {
  'mixed-all': { name: 'All difficulties', mix: { easy: 1, exam: 1, hard: 1, extreme: 1 } },
  'mixed-easy': MOCK_LEVELS.easy,
  'mixed-medium': { ...MOCK_LEVELS.normal, name: 'Medium' },
  'mixed-hard': MOCK_LEVELS.hard,
  'mixed-extreme': MOCK_LEVELS.extreme,
};
export const DRILL_DIFFICULTIES = ['easy', 'exam', 'hard', 'extreme', ...Object.keys(DRILL_MIXES)];

export function drillSettings(parameters) {
  const difficulty = parameters.get('difficulty');
  const questionCount = Number(parameters.get('count'));
  const timer = parameters.get('timer');
  const minutes = Number(parameters.get('minutes'));
  const settings = {
    difficulty: DRILL_DIFFICULTIES.includes(difficulty) ? difficulty : 'mixed-all',
    questionCount: [5, 10].includes(questionCount) ? questionCount : 5,
    timer: ['pace', 'none', 'custom'].includes(timer) ? timer : 'pace',
    minutes: Number.isFinite(minutes) && minutes >= 0.25 && minutes <= 180 && Number.isInteger(minutes * 4) ? minutes : 5,
  };
  settings.timeLimit = settings.timer === 'none' ? null
    : settings.timer === 'custom' ? settings.minutes * 60 : settings.questionCount * TARGET_SECONDS;
  return settings;
}

function shuffle(values, random) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

export function drillMix(difficulty, count, random = Math.random) {
  if (!DRILL_DIFFICULTIES.includes(difficulty) || ![5, 10].includes(count)) {
    throw new Error('Choose a supported drill difficulty and question count.');
  }
  if (!Object.hasOwn(DRILL_MIXES, difficulty)) return { [difficulty]: count };
  const weights = Object.entries(DRILL_MIXES[difficulty].mix);
  const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
  // Largest remainders keep short drills close to the mock proportions.
  // Shuffle first so tied remainders do not always favour the same tier.
  const allocation = shuffle(weights.map(([level, weight]) => ({
    level, count: Math.floor(count * weight / total), remainder: count * weight % total,
  })), random).sort((a, b) => b.remainder - a.remainder);
  const remaining = count - allocation.reduce((sum, item) => sum + item.count, 0);
  for (let index = 0; index < remaining; index++) allocation[index].count++;
  return Object.fromEntries(allocation.filter(item => item.count > 0).map(item => [item.level, item.count]));
}

export function chooseDrillPuzzles(bank, difficulty, count, random = Math.random) {
  const mix = drillMix(difficulty, count, random);
  const selected = Object.entries(mix).flatMap(([level, needed]) => {
    const pool = bank.filter(puzzle => puzzle.difficulty.targetCell === level);
    if (pool.length < needed) throw new Error(`Not enough ${level} puzzles for this drill.`);
    return shuffle(pool, random).slice(0, needed);
  });
  return shuffle(selected, random);
}
