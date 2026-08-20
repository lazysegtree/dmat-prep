import { expect, test } from '@playwright/test';

test('home page exposes the four training choices', async ({ page }) => {
  const browserErrors = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));

  await page.goto('/');

  await expect(page).toHaveTitle('dMAT Trainer');
  await expect(page.getByLabel('Training modes').getByRole('link')).toHaveCount(4);
  await expect(page.getByRole('link', { name: /^Learn / })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Speed Drill / })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Full Mock / })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Progress / })).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test('a learner can enter, clear, and request a hint', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /^Learn / }).click();
  await page.getByLabel('Training difficulty').selectOption('easy');
  await page.getByRole('button', { name: 'Start Learn' }).click();

  const grid = page.getByRole('grid', { name: 'Five by five Latin square' });
  const target = grid.getByRole('gridcell', { name: /target question/ });

  await expect(grid.getByRole('gridcell')).toHaveCount(25);
  await expect(target).toHaveText('?');

  await page.getByRole('button', { name: 'A', exact: true }).click();
  await expect(target).toHaveText('A');

  await page.getByRole('button', { name: 'Clear selected cell' }).click();
  await expect(target).toHaveText('?');

  await page.getByRole('button', { name: 'Show a hint' }).click();
  await expect(page.locator('.hint-box')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show a hint' })).toBeDisabled();
});
