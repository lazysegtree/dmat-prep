import { mkdirSync, writeFileSync } from 'node:fs';

const SYMBOLS = ['A', 'B', 'C', 'D', 'E'];
const LEVELS = ['easy', 'exam', 'hard', 'extreme'];

let seed = 0x5d4a7;
function random() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0x100000000;
}

function shuffle(values) {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function makeSolution() {
  const symbols = shuffle(SYMBOLS);
  const rowOrder = shuffle([0, 1, 2, 3, 4]);
  const columnOrder = shuffle([0, 1, 2, 3, 4]);
  return rowOrder.map((row) =>
    columnOrder.map((column) => symbols[(row + column) % 5]),
  );
}

function candidates(grid, row, column) {
  const used = new Set([...grid[row], ...grid.map((line) => line[column])]);
  return SYMBOLS.filter((symbol) => !used.has(symbol));
}

function solve(grid, limit = 2) {
  const working = grid.map((row) => [...row]);
  const stats = { nodes: 0, branches: 0, maxDepth: 0, forced: 0 };
  let solutions = 0;

  function visit(depth) {
    if (solutions >= limit) return;
    stats.nodes += 1;
    stats.maxDepth = Math.max(stats.maxDepth, depth);

    let best = null;
    for (let row = 0; row < 5; row += 1) {
      for (let column = 0; column < 5; column += 1) {
        if (working[row][column]) continue;
        const options = candidates(working, row, column);
        if (options.length === 0) return;
        if (!best || options.length < best.options.length) {
          best = { row, column, options };
        }
      }
    }

    if (!best) {
      solutions += 1;
      return;
    }

    if (best.options.length === 1) stats.forced += 1;
    else stats.branches += 1;

    for (const symbol of best.options) {
      working[best.row][best.column] = symbol;
      visit(depth + 1);
      working[best.row][best.column] = '';
      if (solutions >= limit) return;
    }
  }

  visit(0);
  return { count: solutions, stats };
}

function makeUniquePuzzle(solution) {
  const grid = solution.map((row) => [...row]);
  const desiredClues = 8 + Math.floor(random() * 9);

  for (const position of shuffle([...Array(25).keys()])) {
    if (grid.flat().filter(Boolean).length <= desiredClues) break;
    const row = Math.floor(position / 5);
    const column = position % 5;
    const previous = grid[row][column];
    grid[row][column] = '';
    if (solve(grid).count !== 1) grid[row][column] = previous;
  }

  const validation = solve(grid);
  const clues = grid.flat().filter(Boolean).length;
  const blanks = 25 - clues;
  const score = blanks + validation.stats.branches * 4 + validation.stats.maxDepth * 0.35;
  return { grid, solution, validation, clues, score };
}

function firstHint(grid, solution) {
  for (let row = 0; row < 5; row += 1) {
    for (let column = 0; column < 5; column += 1) {
      if (grid[row][column]) continue;
      const options = candidates(grid, row, column);
      if (options.length === 1) {
        return {
          row,
          column,
          value: solution[row][column],
          text: `Row ${row + 1}, column ${column + 1} can only be ${solution[row][column]}; the other symbols already appear in its row or column.`,
        };
      }
    }
  }
  const index = grid.flat().findIndex((value) => !value);
  const row = Math.floor(index / 5);
  const column = index % 5;
  return {
    row,
    column,
    value: solution[row][column],
    text: `Compare the symbols missing from row ${row + 1} with those missing from column ${column + 1}. Their overlap gives ${solution[row][column]}.`,
  };
}

const candidatesBank = [];
for (let index = 0; index < 320; index += 1) {
  candidatesBank.push(makeUniquePuzzle(makeSolution()));
}

candidatesBank.sort((a, b) => a.score - b.score || b.clues - a.clues);
const selected = [];
for (let levelIndex = 0; levelIndex < LEVELS.length; levelIndex += 1) {
  const start = Math.floor((levelIndex * candidatesBank.length) / LEVELS.length);
  const end = Math.floor(((levelIndex + 1) * candidatesBank.length) / LEVELS.length);
  const bucket = candidatesBank.slice(start, end);
  for (let itemIndex = 0; itemIndex < 12; itemIndex += 1) {
    const offset = Math.floor((itemIndex * bucket.length) / 12 + bucket.length / 24);
    selected.push({ ...bucket[Math.min(offset, bucket.length - 1)], difficulty: LEVELS[levelIndex] });
  }
}

const puzzles = selected.map((puzzle, index) => ({
  id: `DMAT-${puzzle.difficulty.toUpperCase()}-${String((index % 12) + 1).padStart(3, '0')}`,
  difficulty: puzzle.difficulty,
  grid: puzzle.grid,
  solution: puzzle.solution,
  validation: {
    unique: puzzle.validation.count === 1,
    solutionCount: puzzle.validation.count,
    clues: puzzle.clues,
    searchNodes: puzzle.validation.stats.nodes,
    branchPoints: puzzle.validation.stats.branches,
    maxDepth: puzzle.validation.stats.maxDepth,
    difficultyScore: Number(puzzle.score.toFixed(2)),
    generatorVersion: 1,
  },
  hints: [firstHint(puzzle.grid, puzzle.solution)],
}));

if (puzzles.some((puzzle) => puzzle.validation.solutionCount !== 1)) {
  throw new Error('Generated bank contains a non-unique puzzle.');
}

mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
writeFileSync(
  new URL('../data/puzzles.json', import.meta.url),
  `${JSON.stringify({ version: 1, generatedAt: '2026-08-09', puzzles }, null, 2)}\n`,
);

console.log(`Generated and validated ${puzzles.length} unique puzzles.`);
for (const level of LEVELS) {
  const group = puzzles.filter((puzzle) => puzzle.difficulty === level);
  console.log(`${level}: score ${group[0].validation.difficultyScore}–${group.at(-1).validation.difficultyScore}`);
}
