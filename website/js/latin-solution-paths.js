// Review-time search; the generated puzzle's rating and saved hint stay unchanged.
const SYMBOLS = ['A', 'B', 'C', 'D', 'E'];
const cellName = ({ row, column }) => `R${row + 1}C${column + 1}`;

export function enumerateDeductions(grid) {
  const deductions = [];
  for (const type of ['row', 'column']) {
    for (let index = 0; index < 5; index++) {
      const cells = Array.from({ length: 5 }, (_, offset) => type === 'row'
        ? { row: index, column: offset } : { row: offset, column: index });
      const empty = cells.filter(({ row, column }) => !grid[row][column]);
      const missing = SYMBOLS.filter((value) => !cells.some(({ row, column }) => grid[row][column] === value));
      const unit = `${type === 'row' ? 'Row' : 'Column'} ${index + 1}`;
      const block = (cell, value) => Array.from({ length: 5 }, (_, offset) => type === 'row'
        ? { row: offset, column: cell.column } : { row: cell.row, column: offset })
        .find(({ row, column }) => grid[row][column] === value);
      const add = (rule, cell, value, details) => deductions.push({
        rule, weight: empty.length, placement: { ...cell, value }, details,
      });
      if (empty.length === 1 && missing.length === 1) {
        add('single-missing-cell', empty[0], missing[0], `${unit} has one empty cell and is missing ${missing[0]}, so ${cellName(empty[0])} is ${missing[0]}.`);
      }
      if (empty.length < 2) continue;
      for (const value of missing) {
        const eligible = empty.filter((cell) => !block(cell, value));
        if (eligible.length !== 1) continue;
        const reasons = empty.filter((cell) => block(cell, value)).map((cell) =>
          `${cellName(cell)} is blocked by ${value} at ${cellName(block(cell, value))}`);
        add('unique-candidate-position', eligible[0], value,
          `${unit} is missing ${missing.join(', ')}. For ${value}, ${reasons.join('; ')}. Only ${cellName(eligible[0])} remains for ${value}.`);
      }
      for (const cell of empty) {
        const eligible = missing.filter((value) => !block(cell, value));
        if (eligible.length !== 1) continue;
        const reasons = missing.filter((value) => block(cell, value)).map((value) =>
          `${value} is eliminated by ${cellName(block(cell, value))}`);
        add('unique-candidate-for-cell', cell, eligible[0],
          `${unit} is missing ${missing.join(', ')}. At ${cellName(cell)}, ${reasons.join('; ')}. Only ${eligible[0]} remains.`);
      }
    }
  }
  return deductions;
}

// Different proofs of the same placement are printed together rather than
// multiplying identical placement sequences into separate paths.
function groupedDeductions(grid) {
  const groups = new Map();
  for (const deduction of enumerateDeductions(grid)) {
    const key = JSON.stringify(deduction.placement);
    const previous = groups.get(key);
    if (!previous) groups.set(key, { ...deduction, reasons: [deduction] });
    else {
      previous.reasons.push(deduction);
      if (deduction.weight < previous.weight) {
        previous.weight = deduction.weight;
        previous.details = deduction.details;
      }
    }
  }
  return [...groups.values()];
}

export function findSolutionPaths(puzzle) {
  const maxScore = puzzle.difficulty.score + 3;
  const maxSteps = puzzle.bestMethod.length + 1;
  const memo = new Map();
  function visit(grid, budget, steps) {
    if (grid[puzzle.target.row][puzzle.target.column]) return [[]];
    if (budget < 3 || steps === 0) return [];
    const key = `${grid.flat().map((value) => value || '.').join('')}:${budget}:${steps}`;
    if (memo.has(key)) return memo.get(key);
    const paths = [];
    for (const inference of groupedDeductions(grid)) {
      const cost = inference.weight + 2;
      if (cost > budget) continue;
      const next = grid.map((row) => [...row]);
      const { row, column, value } = inference.placement;
      next[row][column] = value;
      for (const suffix of visit(next, budget - cost, steps - 1)) paths.push([inference, ...suffix]);
    }
    memo.set(key, paths);
    return paths;
  }
  // Omit detours: if removing a placement still leaves a valid chain to the
  // target, that sequence is not an efficient alternative.
  const paths = visit(puzzle.grid, maxScore, maxSteps).filter((path) =>
    !path.slice(0, -1).some((_, skip) => {
      const grid = puzzle.grid.map((row) => [...row]);
      for (let index = 0; index < path.length; index++) {
        if (index === skip) continue;
        const placement = path[index].placement;
        if (!enumerateDeductions(grid).some((item) => JSON.stringify(item.placement) === JSON.stringify(placement))) return false;
        grid[placement.row][placement.column] = placement.value;
      }
      return true;
    }));
  const score = (path) => path.reduce((sum, item) => sum + item.weight + 2, 0);
  paths.sort((a, b) => score(a) - score(b) || a.length - b.length);
  return { paths, maxScore, maxSteps };
}
