import { expect, test } from '@playwright/test';

test('home page exposes task types and Latin Squares training choices', async ({ page }) => {
  const browserErrors = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));

  await page.goto('/');

  await expect(page).toHaveTitle('dMAT Core Trainer');
  await expect(page.getByLabel('Task types').getByRole('link')).toHaveCount(3);
  await expect(page.getByRole('link', { name: /^Figure Sequences / })).toBeVisible();
  await page.getByRole('link', { name: /^Latin Squares / }).click();
  await expect(page.getByLabel('Training modes').getByRole('link')).toHaveCount(4);
  await expect(page.getByRole('link', { name: /^Learn / })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Speed Drill / })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Full Mock / })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Progress / })).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test('a learner can enter, clear, and request a hint', async ({ page }) => {
  await page.goto('/latin-squares/');
  await page.getByRole('link', { name: /^Learn / }).click();
  await page.getByLabel('Training difficulty').selectOption('easy');
  await page.getByRole('button', { name: 'Start Learn' }).click();

  const grid = page.getByRole('grid', { name: 'Five by five Latin square' });
  const target = grid.getByRole('gridcell', { name: /target question/ });

  await expect(grid.getByRole('gridcell')).toHaveCount(25);
  await expect(target).toHaveText('?');

  await page.getByRole('button', { name: 'A', exact: true }).click();
  await expect(target).toHaveText('?');
  await expect(page.getByRole('button', { name: 'A', exact: true })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Clear answer' }).click();
  await expect(target).toHaveText('?');
  await expect(page.locator('[data-symbol][aria-pressed="true"]')).toHaveCount(0);

  await page.getByRole('button', { name: 'Show a hint' }).click();
  await expect(page.locator('.hint-box')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show a hint' })).toBeDisabled();
});

test('Latin answer column aligns with the square and preserves the selected answer for scoring', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.goto('/latin-squares/speed-drill/');
  await page.getByLabel('Questions', { exact: true }).selectOption('10');
  await page.getByRole('button', { name: 'Start Speed Drill' }).click();
  const grid = page.getByRole('grid', { name: 'Five by five Latin square' });
  const column = page.getByRole('group', { name: 'Answer column' });
  const squareBounds = await grid.boundingBox();
  const columnBounds = await column.boundingBox();
  expect(columnBounds.y).toBeCloseTo(squareBounds.y, 0);
  expect(columnBounds.height).toBeCloseTo(squareBounds.height, 0);
  expect(columnBounds.width).toBeCloseTo(squareBounds.width / 5, 0);
  await expect(column.getByRole('button')).toHaveCount(5);
  for (let index = 0; index < 5; index++) {
    const row = await grid.getByRole('gridcell').nth(index * 5).boundingBox();
    const option = await column.getByRole('button').nth(index).boundingBox();
    expect(option.y).toBeCloseTo(row.y, 0);
    expect(option.height).toBeCloseTo(row.height, 0);
  }

  await page.getByRole('button', { name: 'A', exact: true }).click();
  await page.keyboard.press('C');
  await expect(page.getByRole('button', { name: 'A', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: 'C', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Backspace');
  await expect(page.locator('[data-symbol][aria-pressed="true"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'C', exact: true }).click();
  await page.getByRole('button', { name: 'Save and Next' }).click();
  await expect(page.locator('[data-symbol][aria-pressed="true"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByRole('button', { name: 'C', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(grid.getByRole('gridcell', { name: /target question/ })).toHaveText('?');
  await page.getByRole('heading', { name: 'Question 1 of 10' }).click();
  await page.mouse.move(0, 0);
  await page.screenshot({ path: '/tmp/dmat-latin-squares-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'End Subtest' }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('dmat-latin-progress-v1'))[0]);
  const { row, column: targetColumn } = saved.targets[0];
  expect(saved.answers[0][row][targetColumn]).toBe('C');
  expect(saved.unanswered).toBe(9);
  expect(saved.statuses[0]).toBe(saved.targets[0].value === 'C' ? 'correct' : 'incorrect');
});
