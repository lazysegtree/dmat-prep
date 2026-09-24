import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { answerComplete, answerStatus, frameCorrectCount, validateFigureBank, selectDiversePuzzles } from '../../website/js/figure-sequence-session.js';
import { SHAPES, shapeMarkup } from '../../website/js/figure-sequence-shapes.js';
const bank = JSON.parse(fs.readFileSync(new URL('../../website/data/figure-sequences.json', import.meta.url)));

test('paired scoring distinguishes incomplete, one correct, and both correct', () => {
 const puzzle = { questions: [{ answerIndex: 0 }, { answerIndex: 2 }] };
 assert.equal(answerComplete(puzzle, [0, null]), false);
 assert.equal(answerStatus(puzzle, [0, null]), 'unanswered');
 assert.equal(frameCorrectCount(puzzle, [0, null]), 1);
 assert.equal(answerStatus(puzzle, [0, 1]), 'incorrect');
 assert.equal(frameCorrectCount(puzzle, [0, 1]), 1);
 assert.equal(answerStatus(puzzle, [0, 2]), 'correct');
 assert.equal(frameCorrectCount(puzzle, [0, 2]), 2);
 assert.equal(answerComplete(puzzle, [0, 3]), false);
});

test('published bank meets browser contract and malformed answers/frames are rejected', () => {
 assert.equal(validateFigureBank(bank).length, 576);
 for (const mutate of [
  (data) => { data.puzzles[0].questions[0].answerIndex = 3; },
  (data) => { data.puzzles[0].observedFrames[0].figures[0].row = 4; },
  (data) => { data.puzzles[0].validation.predictiveUnique = false; },
  (data) => { data.puzzles[0].questions[0].options[1] = data.puzzles[0].questions[0].options[0]; },
  (data) => { data.puzzles[0].difficulty.level = 'unknown'; },
  (data) => { data.puzzles[0].difficulty.level = 'extreme'; },
 ]) {
  const data = structuredClone(bank); mutate(data);
  assert.throws(() => validateFigureBank(data));
 }
});

test('expanded bank keeps the original questions and covers sample and new silhouettes', () => {
 const legacy = JSON.parse(fs.readFileSync(new URL('../../data/figure-sequences-v2.json', import.meta.url)));
 for (const puzzle of legacy.puzzles) assert.deepEqual(bank.puzzles.find((p) => p.id === puzzle.id), puzzle);
 const sample = ['square', 'hexagon', 'diamond-cross', 'arrow', 'triangle', 'bent-corner', 'trapezoid', 'arch'];
 for (const level of ['low', 'medium', 'high', 'extreme']) {
  const puzzles = bank.puzzles.filter((p) => p.difficulty.level === level);
  assert.equal(puzzles.length, 144);
  const shapes = new Set(puzzles.flatMap((p) => p.actors.map((a) => a.shape)));
  const expected = Object.keys(SHAPES).filter((shape) => level !== 'extreme' || SHAPES[shape].period === 360);
  assert.deepEqual([...shapes].sort(), expected.sort());
  if (level !== 'extreme') for (const shape of sample) assert.ok(shapes.has(shape), shape);
 }
 for (const shape of Object.keys(SHAPES)) assert.match(shapeMarkup(shape, '#fff'), /<path/);
 assert.throws(() => shapeMarkup('missing', '#fff'));
});

test('rotation-equivalent options and invisible rotation tracks are rejected', () => {
 for (const shape of ['square', 'hexagon', 'diamond-cross']) {
  const data = structuredClone(bank);
  const puzzle = data.puzzles.find((p) => p.actors.length === 1 && p.actors[0].shape === shape);
  const question = puzzle.questions[0];
  const duplicate = structuredClone(question.options[question.answerIndex]);
  duplicate.figures[0].rotation = (duplicate.figures[0].rotation + SHAPES[shape].period) % 360;
  question.options[(question.answerIndex + 1) % 3] = duplicate;
  assert.throws(() => validateFigureBank(data));
  const hidden = structuredClone(bank);
  hidden.puzzles.find((p) => p.id === puzzle.id).programs[0].rotationStep = 90;
  assert.throws(() => validateFigureBank(hidden));
 }
});

test('drills spread exposure across shapes and never repeat a question', () => {
 for (const random of [() => 0, () => 0.5, () => 0.999]) {
  for (const level of ['low', 'medium', 'high', 'extreme']) {
   const selected = selectDiversePuzzles(bank.puzzles.filter((p) => p.difficulty.level === level), 10, random);
   assert.equal(selected.length, 10);
   assert.equal(new Set(selected.map((p) => p.id)).size, 10);
   assert.ok(new Set(selected.flatMap((p) => p.actors.map((a) => a.shape))).size >= 10);
   const motions = new Set(selected.flatMap((p) => p.programs.map((program) => program.motion)));
   assert.ok(motions.has('small-square'), `${level} drill missed small-square movement`);
   assert.ok(motions.size >= (level === 'low' ? 4 : 5), `${level} drill lacks movement variety`);
  }
 }
});
