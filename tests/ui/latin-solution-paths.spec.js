import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import { findSolutionPaths } from '../../website/js/latin-solution-paths.js';

const bank = JSON.parse(fs.readFileSync(new URL('../../website/data/latin-squares/puzzles.json', import.meta.url))).puzzles;
const puzzle = bank.find((item) => findSolutionPaths(item).paths.length > 3);

test('review shows the best path and at most two collapsed alternatives', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/latin-squares/progress/');
  await page.evaluate((puzzle) => {
    localStorage.setItem('dmat-latin-progress-v1', JSON.stringify([{
      id: 'alternatives', date: '2026-09-24T08:00:00Z', mode: 'learn', questionType: 'target',
      questionCount: 1, correct: 0, incorrect: 0, unanswered: 1, totalTime: 10, questionTimes: [10],
      statuses: ['unanswered'], puzzleIds: [puzzle.id], targets: [puzzle.target],
      answers: [puzzle.grid], startingGrids: [puzzle.grid], solutions: [puzzle.solution], reviewPuzzles: [{ target: puzzle.target, difficulty: puzzle.difficulty, bestMethod: puzzle.bestMethod }],
    }]));
  }, puzzle);
  await page.goto('/latin-squares/progress/?session=alternatives');
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Efficient solution paths', exact: true })).toBeVisible();
  const paths = findSolutionPaths(puzzle).paths.slice(0, 3);
  await expect(page.locator('.solution-alternative')).toHaveCount(paths.length);
  await expect(page.locator('.solution-alternative').first()).toBeVisible();
  await expect(page.locator('.solution-alternative').nth(1)).toBeHidden();
  await expect(page.locator('.solution-alternative').nth(2)).toBeHidden();
  await page.getByText('Show 2 alternative paths', { exact: true }).click();
  for (let index = 0; index < paths.length; index++) {
    const printed = page.locator('.solution-alternative').nth(index);
    await expect(printed).toBeVisible();
    await expect(printed.locator('.inference-step')).toHaveCount(paths[index].length);
    for (const step of paths[index]) for (const reason of step.reasons) await expect(printed).toContainText(reason.details);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/latin-solution-paths-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});
