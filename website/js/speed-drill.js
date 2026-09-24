import { TARGET_SECONDS } from './session.js';

function createDrillConfig(levels) {
  const names = Object.fromEntries(levels.map((level, index) => [level, ['Easy', 'Medium', 'Hard', 'Extreme'][index]]));
  const mix = weights => Object.fromEntries(levels.flatMap((level, index) => weights[index] ? [[level, weights[index]]] : []));
  const mockLevels = {
    easy: { name: 'Easy', mix: mix([10, 8, 2, 0]) },
    normal: { name: 'Normal', mix: mix([6, 8, 6, 0]) },
    hard: { name: 'Hard', mix: mix([0, 8, 10, 2]) },
    extreme: { name: 'Extreme', mix: mix([0, 5, 10, 5]) },
  };
  const mixes = {
    'mixed-all': { name: 'All difficulties', mix: mix([1, 1, 1, 1]) },
    'mixed-easy': mockLevels.easy,
    'mixed-medium': { ...mockLevels.normal, name: 'Medium' },
    'mixed-hard': mockLevels.hard,
    'mixed-extreme': mockLevels.extreme,
  };
  return { levels, names, mockLevels, mixes, difficulties: [...levels, ...Object.keys(mixes)] };
}

export const LATIN_DRILL = createDrillConfig(['easy', 'exam', 'hard', 'extreme']);
export const STANDARD_DRILL = createDrillConfig(['low', 'medium', 'high', 'extreme']);

export function drillSettings(parameters, config = LATIN_DRILL) {
  const difficulty = parameters.get('difficulty');
  const questionCount = Number(parameters.get('count'));
  const timer = parameters.get('timer');
  const minutes = Number(parameters.get('minutes'));
  const settings = {
    difficulty: config.difficulties.includes(difficulty) ? difficulty : 'mixed-all',
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

export function drillMix(difficulty, count, { random = Math.random, config = LATIN_DRILL } = {}) {
  if (!config.difficulties.includes(difficulty) || ![5, 10].includes(count)) {
    throw new Error('Choose a supported drill difficulty and question count.');
  }
  if (!Object.hasOwn(config.mixes, difficulty)) return { [difficulty]: count };
  const weights = Object.entries(config.mixes[difficulty].mix);
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

export function chooseDrillPuzzles(bank, difficulty, count, {
  random = Math.random,
  config = LATIN_DRILL,
  getDifficulty = puzzle => puzzle.difficulty.targetCell,
  selectPool = (pool, needed, rng) => shuffle(pool, rng).slice(0, needed),
} = {}) {
  const mix = drillMix(difficulty, count, { random, config });
  const selected = Object.entries(mix).flatMap(([level, needed]) => {
    const pool = bank.filter(puzzle => getDifficulty(puzzle) === level);
    if (pool.length < needed) throw new Error(`Not enough ${level} puzzles for this drill.`);
    return selectPool(pool, needed, random);
  });
  return shuffle(selected, random);
}

export function drillDifficultyName(difficulty, config = LATIN_DRILL) {
  return Object.hasOwn(config.mixes, difficulty) ? `Mixed · ${config.mixes[difficulty].name}` : config.names[difficulty] || 'Mixed difficulty';
}

export function drillRepeatParameters(result) {
  const timer = result.drillTimer || (result.timeLimit == null ? 'none' : 'custom');
  return {
    difficulty: result.difficulty,
    count: result.questionCount,
    timer,
    ...(timer === 'custom' ? { minutes: result.timeLimit / 60 } : {}),
  };
}
