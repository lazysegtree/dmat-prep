import { expect, test } from '@playwright/test';
import fs from 'node:fs';

const bank = JSON.parse(fs.readFileSync(new URL('../../website/data/latin-squares/puzzles.json', import.meta.url))).puzzles;
const progressKey = 'dmat-latin-progress-v1';
const historyKey = 'dmat-latin-puzzle-history-v1';
const puzzleId = page => new URL(page.url()).searchParams.get('puzzle');

test.beforeEach(async ({ page }) => {
  // With a fixed shuffle, ignoring history would repeat the same puzzles.
  await page.addInitScript(() => { Math.random = () => 0.999; });
});

test('Learn remembers unsubmitted puzzles across navigation and still supports exact links', async ({ page }) => {
  const selected = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto('/latin-squares/learn/?difficulty=easy');
    await page.getByRole('button', { name: 'Start Learn' }).click();
    await expect(page.getByRole('heading', { name: 'Puzzle', exact: true })).toBeVisible();
    selected.push(puzzleId(page));
  }
  expect(new Set(selected).size).toBe(3);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), historyKey)).toEqual(selected);
  await page.goto(`/latin-squares/learn/?puzzle=${selected[0]}`);
  await expect(page.getByRole('heading', { name: 'Puzzle', exact: true })).toBeVisible();
  expect(puzzleId(page)).toBe(selected[0]);
});

test('mocks, drills and Learn share history without changing difficulty mixes', async ({ page }) => {
  await page.goto('/latin-squares/mock/?difficulty=normal');
  await page.getByRole('button', { name: 'Start Mock', exact: true }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'End Subtest' }).click();
  const mock = await page.evaluate(key => JSON.parse(localStorage.getItem(key))[0], progressKey);
  expect(mock.puzzleIds).toHaveLength(20);

  await page.goto('/latin-squares/speed-drill/?difficulty=mixed-medium&count=10');
  await page.getByRole('button', { name: 'Start Speed Drill' }).click();
  await page.getByRole('button', { name: 'End Subtest' }).click();
  const drill = await page.evaluate(key => JSON.parse(localStorage.getItem(key))[0], progressKey);
  expect(drill.puzzleIds).toHaveLength(10);
  expect(drill.puzzleIds.some(id => mock.puzzleIds.includes(id))).toBe(false);
  expect(drill.puzzleIds.reduce((counts, id) => {
    const level = bank.find(puzzle => puzzle.id === id).difficulty.targetCell;
    counts[level] = (counts[level] || 0) + 1;
    return counts;
  }, {})).toEqual({ easy: 3, exam: 4, hard: 3 });

  await page.goto('/latin-squares/learn/?difficulty=exam');
  await page.getByRole('button', { name: 'Start Learn' }).click();
  await expect(page.getByRole('heading', { name: 'Puzzle', exact: true })).toBeVisible();
  expect([...mock.puzzleIds, ...drill.puzzleIds]).not.toContain(puzzleId(page));
});

test('existing saved results seed history and deleting progress resets it', async ({ page }) => {
  const pool = bank.filter(puzzle => puzzle.difficulty.targetCell === 'easy');
  const remaining = pool.at(-1);
  await page.goto('/latin-squares/');
  await page.evaluate(({ progressKey, previous }) => {
    localStorage.setItem(progressKey, JSON.stringify([{
      id: 'old-learn', date: '2026-09-25T00:00:00Z', mode: 'learn',
      difficulty: 'easy', questionType: 'target', correct: 0,
      questionCount: previous.length, totalTime: 1, puzzleIds: previous,
    }]));
  }, { progressKey, previous: pool.slice(0, -1).map(puzzle => puzzle.id) });
  await page.goto('/latin-squares/learn/?difficulty=easy');
  await page.getByRole('button', { name: 'Start Learn' }).click();
  await expect(page).toHaveURL(new RegExp(`puzzle=${remaining.id}`));
  await page.goto('/latin-squares/progress/');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Delete all progress' }).click();
  expect(await page.evaluate(key => localStorage.getItem(key), historyKey)).toBeNull();
});
