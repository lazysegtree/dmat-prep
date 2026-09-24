import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import { findSolutionPaths } from '../../website/js/latin-solution-paths.js';

const bank = JSON.parse(fs.readFileSync(new URL('../../website/data/latin-squares/puzzles.json', import.meta.url))).puzzles;
const puzzle = bank.find((item) => findSolutionPaths(item).paths.length > 5);

test('review switches up to five paths in one solution grid with collapsed explanations', async ({ page }) => {
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
  const paths = findSolutionPaths(puzzle).paths.slice(0, 5);
  const radios = page.getByRole('radio');
  const solution = page.locator('#review-solution-grid');
  const explanation = page.locator('#review-solution-explanation');
  const answer = page.getByRole('grid', { name: 'Your answer', exact: true });
  const originalAnswer = await answer.innerHTML();
  await expect(radios).toHaveCount(5);
  await expect(page.getByRole('radio', { name: 'Solution 1', exact: true })).toBeChecked();
  await expect(page.locator('#review-detail').getByRole('grid')).toHaveCount(2);
  await expect(page.getByRole('heading', { name: 'Complete solution', exact: true })).toHaveCount(0);
  await expect(explanation).toBeHidden();
  await page.getByText('Show detailed explanation', { exact: true }).click();
  for (let index = 0; index < paths.length; index++) {
    await page.getByRole('radio', { name: `Solution ${index + 1}`, exact: true }).check();
    await expect(solution.getByRole('grid', { name: `Solution ${index + 1} deduction order` })).toBeVisible();
    await expect(page.locator('#review-detail').getByRole('grid')).toHaveCount(2);
    await expect(explanation.locator('.inference-step')).toHaveCount(paths[index].length);
    const expected = puzzle.grid.flat().map((value) => ({ value, number: null }));
    paths[index].forEach(({ placement }, step) => {
      expected[placement.row * 5 + placement.column] = { value: placement.value, number: String(step + 1) };
    });
    expect(await solution.getByRole('gridcell').evaluateAll((cells) => cells.map((cell) => ({
      value: cell.querySelector('.cell-value')?.textContent ?? cell.textContent,
      number: cell.querySelector('.deduction-number')?.textContent ?? null,
    })))).toEqual(expected);
    for (const step of paths[index]) {
      const cell = solution.getByRole('gridcell').nth(step.placement.row * 5 + step.placement.column);
      await expect(cell.locator('.deduction-direction')).toHaveClass(`deduction-direction ${step.unit.type}`);
      await expect(cell).toHaveAttribute('aria-label', new RegExp(`based on ${step.unit.type} ${step.unit.index + 1}`));
    }
    for (const step of paths[index]) for (const reason of step.reasons) await expect(explanation).toContainText(reason.details);
    expect(await answer.innerHTML()).toBe(originalAnswer);
  }
  await page.getByText('Show detailed explanation', { exact: true }).click();
  await page.getByRole('radio', { name: 'Solution 1', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: 'Solution 2', exact: true })).toBeChecked();
  await expect(solution.getByRole('grid', { name: 'Solution 2 deduction order' })).toBeVisible();
  await expect(explanation).toBeHidden();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.locator('#review-detail').screenshot({ path: '/tmp/latin-solution-selector-mobile.png' });
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.locator('#review-detail').screenshot({ path: '/tmp/latin-solution-selector-desktop.png' });
  expect(errors).toEqual([]);
});
