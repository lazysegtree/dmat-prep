import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { enumerateDeductions, findSolutionPaths } from '../../website/js/latin-solution-paths.js';

const bank = JSON.parse(fs.readFileSync(new URL('../../website/data/latin-squares/puzzles.json', import.meta.url))).puzzles;
const score = (path) => path.reduce((sum, step) => sum + step.weight + 2, 0);
const placements = (path) => path.map((step) => step.placement);

const alternativePuzzle = {
  grid: [
    ['', '', 'D', '', ''], ['B', '', 'C', '', 'E'], ['', 'C', 'B', 'A', 'D'],
    ['C', '', '', '', 'B'], ['D', '', '', '', 'A'],
  ],
  target: { row: 3, column: 1, value: 'D' },
  difficulty: { score: 9 }, bestMethod: [{}, {}],
};

test('prints both equal-effort routes and omits unrelated detours', () => {
  const result = findSolutionPaths(alternativePuzzle);
  assert.deepEqual(result.paths.map(placements), [
    [{ row: 1, column: 1, value: 'A' }, { row: 3, column: 1, value: 'D' }],
    [{ row: 1, column: 3, value: 'D' }, { row: 3, column: 1, value: 'D' }],
  ]);
  assert.deepEqual(result.paths.map(score), [9, 9]);
});

test('groups row and column proofs without duplicating the placement path', () => {
  const grid = Array.from({ length: 5 }, (_, row) => Array.from({ length: 5 }, (_, col) => 'ABCDE'[(row + col) % 5]));
  grid[0][0] = '';
  const { paths } = findSolutionPaths({ grid, target: { row: 0, column: 0 }, difficulty: { score: 3 }, bestMethod: [{}] });
  assert.equal(paths.length, 1);
  assert.equal(paths[0][0].reasons.length, 2);
  assert.deepEqual(paths[0][0].unit, { type: 'row', index: 0 });
  assert.deepEqual(paths[0][0].reasons.map((reason) => reason.unit.type), ['row', 'column']);
  assert.match(paths[0][0].reasons[0].details, /Row 1/);
  assert.match(paths[0][0].reasons[1].details, /Column 1/);
});

test('a cheaper column proof supplies the direction and appears before its row alternative', () => {
  const grid = [
    ['D', '', 'B', 'E', ''], ['B', 'E', '', '', 'D'], ['C', 'A', 'E', 'D', ''],
    ['', '', 'A', 'B', ''], ['', 'B', 'D', '', ''],
  ];
  const { paths } = findSolutionPaths({ grid, target: { row: 3, column: 0, value: 'E' }, difficulty: { score: 4 }, bestMethod: [{}] });
  const step = paths[0][0];
  assert.deepEqual(step.unit, { type: 'column', index: 0 });
  assert.deepEqual(step.reasons.map((reason) => [reason.unit.type, reason.weight]), [['column', 2], ['row', 3]]);
  assert.equal(step.details, step.reasons[0].details);
  assert.equal(step.rule, step.reasons[0].rule);
});

test('all bank paths replay legally, retain the best score, and respect the bounds', () => {
  let similarLengthAlternative = false;
  for (const puzzle of bank) {
    const original = JSON.stringify(puzzle);
    const { paths, maxScore, maxSteps } = findSolutionPaths(puzzle);
    assert.ok(paths.length > 0, puzzle.id);
    assert.equal(Math.min(...paths.map(score)), puzzle.difficulty.score, puzzle.id);
    assert.equal(new Set(paths.map((path) => JSON.stringify(placements(path)))).size, paths.length);
    for (const path of paths) {
      assert.ok(path.length <= maxSteps && score(path) <= maxScore);
      if (path.length === puzzle.bestMethod.length + 1) similarLengthAlternative = true;
      const grid = puzzle.grid.map((row) => [...row]);
      for (const step of path) {
        assert.deepEqual(step.unit, step.reasons[0].unit);
        assert.equal(step.rule, step.reasons[0].rule);
        assert.equal(step.weight, step.reasons[0].weight);
        assert.equal(grid[puzzle.target.row][puzzle.target.column], '');
        const { row, column, value } = step.placement;
        assert.equal(grid[row][column], '');
        assert.equal(value, puzzle.solution[row][column]);
        const legal = enumerateDeductions(grid);
        for (const reason of step.reasons) assert.ok(legal.some((item) => JSON.stringify(item) === JSON.stringify(reason)));
        grid[row][column] = value;
      }
      assert.equal(grid[puzzle.target.row][puzzle.target.column], puzzle.target.value);
    }
    assert.equal(JSON.stringify(puzzle), original);
  }
  assert.ok(similarLengthAlternative, 'includes alternatives with one extra deduction');
});
