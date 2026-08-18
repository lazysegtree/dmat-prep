import assert from 'node:assert/strict';
import test from 'node:test';

import {
  answerStatus,
  formatTime,
  median,
  summarizeProgress,
} from '../../website/js/session.js';

const puzzle = {
  grid: [
    ['A', '', '', '', ''],
    ['', '', '', '', ''],
    ['', '', '', '', ''],
    ['', '', '', '', ''],
    ['', '', '', '', ''],
  ],
  target: { row: 0, column: 1, value: 'B' },
};

function answer(value = '') {
  const cells = puzzle.grid.map((row) => [...row]);
  cells[0][1] = value;
  return cells;
}

test('formatTime renders minutes and zero-padded seconds', () => {
  assert.equal(formatTime(0), '0:00');
  assert.equal(formatTime(75), '1:15');
});

test('median handles odd and even lists', () => {
  assert.equal(median([9, 2, 4]), 4);
  assert.equal(median([2, 8]), 5);
});

test('answerStatus distinguishes unanswered, correct, and incorrect', () => {
  assert.equal(answerStatus(puzzle, answer()), 'unanswered');
  assert.equal(answerStatus(puzzle, answer('B')), 'correct');
  assert.equal(answerStatus(puzzle, answer('C')), 'incorrect');
});

test('summarizeProgress reports simple training totals', () => {
  const summary = summarizeProgress([{
    mode: 'mock',
    questionType: 'target',
    questionCount: 2,
    correct: 1,
    questionTimes: [60, 90],
  }]);

  assert.deepEqual(summary, {
    latestMock: 1,
    bestMock: 1,
    accuracy: 50,
    medianTime: 75,
    withinTarget: 50,
  });
});
