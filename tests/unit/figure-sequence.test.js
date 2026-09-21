import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { answerComplete, answerStatus, frameCorrectCount, validateFigureBank } from '../../website/js/figure-sequence-session.js';
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
 assert.equal(validateFigureBank(bank).length, 48);
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
