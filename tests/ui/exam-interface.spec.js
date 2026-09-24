import { expect, test } from '@playwright/test';

test('equation keyboard edits the focused answer and keeps answers through navigation', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/mathematical-equations/speed-drill/');
  await page.getByLabel('Training difficulty').selectOption('low');
  await page.getByRole('button', { name: 'Start Speed Drill' }).click();
  const first = page.locator('[data-variable]').first();
  const second = page.locator('[data-variable]').nth(1);
  const keyboard = page.getByRole('group', { name: 'Virtual keyboard' });
  await first.fill('7');
  await second.focus();
  await keyboard.getByRole('button', { name: '1', exact: true }).click();
  await keyboard.getByRole('button', { name: '0', exact: true }).click();
  await expect(second).toHaveValue('10');
  await first.selectText();
  await keyboard.getByRole('button', { name: '2', exact: true }).click();
  await expect(first).toHaveValue('2');
  await keyboard.getByRole('button', { name: 'Delete digit' }).click();
  await expect(first).toHaveValue('');
  await first.pressSequentially('7');
  const fieldCount = await page.locator('[data-variable]').count();
  for (let index = 2; index < fieldCount; index++) await page.locator('[data-variable]').nth(index).fill('1');
  await expect(page.locator('[data-question="0"]')).toHaveAttribute('aria-label', 'Question 1, unanswered');
  await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeDisabled();
  await page.screenshot({ path: '/tmp/dmat-exam-equations-desktop.png', fullPage: true });

  await page.getByRole('button', { name: 'Large text', exact: true }).click();
  await page.getByRole('button', { name: 'Hide instructions', exact: true }).click();
  await page.getByRole('button', { name: 'Save and Next' }).click();
  await expect(page.locator('#exam-instruction-text')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Large text', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(first).toHaveValue('7');
  await expect(second).toHaveValue('10');
  await page.locator('[data-question="9"]').click();
  await expect(page.locator('[data-question="9"]')).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Save answer', exact: true })).toBeEnabled();
  await expect(page.locator('#show-hint')).toHaveCount(0);
  await expect(page.locator('.status, .answer-comparison')).toHaveCount(0);
  await page.getByRole('button', { name: 'End Subtest' }).click();
  await expect(page.locator('body')).not.toHaveClass(/exam-mode/);
  await expect(page.locator('.site-header')).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('dmat-equations-progress-v1'))[0]);
  expect(Object.values(saved.answers[0])).toEqual(['7', '10', ...Array(fieldCount - 2).fill('1')]);
  expect(errors).toEqual([]);
});

for (const task of ['mathematical-equations', 'latin-squares', 'figure-sequences']) {
  test(`${task} keeps review marks separate from answers and clears them for a new test`, async ({ page }) => {
    await page.goto(`/${task}/mock/`);
    await page.getByRole('button', { name: 'Start Mock', exact: true }).click();
    const review = page.locator('#mark-for-review');
    const first = page.locator('[data-question="0"]');
    await expect(review).toHaveAttribute('aria-pressed', 'false');
    await page.getByRole('button', { name: 'Mark for review', exact: true }).click();
    await expect(review).toHaveAttribute('aria-pressed', 'true');
    await expect(first).toHaveAttribute('aria-label', /unanswered, marked for review$/);
    await expect(first).toHaveClass(/marked-for-review/);
    await expect(page.locator('#exam-instruction-text')).toBeVisible();

    if (task === 'mathematical-equations') {
      for (const input of await page.locator('[data-variable]').all()) await input.fill('1');
    } else if (task === 'latin-squares') {
      await page.getByRole('button', { name: 'A', exact: true }).click();
    } else {
      await page.locator('[data-frame="0"][data-option="0"]').click();
      await page.locator('[data-frame="1"][data-option="1"]').click();
    }
    await expect(first).toHaveAttribute('aria-label', /, unanswered, marked for review$/);
    await expect(review).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Save and Next' }).click();
    await expect(review).toHaveAttribute('aria-pressed', 'false');
    await review.click();
    await expect(page.locator('.nav-question.marked-for-review')).toHaveCount(2);
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(review).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Remove review mark', exact: true }).click();
    await expect(first).not.toHaveClass(/marked-for-review/);
    await expect(first).toHaveAttribute('aria-label', /, answered$/);
    await expect(page.locator('[data-question="1"]')).toHaveClass(/marked-for-review/);
    await page.getByRole('button', { name: 'Hide instructions', exact: true }).click();
    await expect(page.locator('#exam-instruction-text')).toBeHidden();
    await expect(review).toHaveAttribute('aria-pressed', 'false');
    await page.locator('[data-question="1"]').click();
    await expect(review).toHaveAttribute('aria-pressed', 'true');

    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'End Subtest' }).click();
    await page.getByRole('button', { name: 'Take another mock' }).click();
    await page.getByRole('button', { name: 'Start Mock', exact: true }).click();
    await expect(review).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.nav-question.marked-for-review')).toHaveCount(0);
  });

  test(`${task} uses the exam shell and keeps navigation reachable on mobile`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/${task}/mock/`);
    await page.getByRole('button', { name: 'Start Mock', exact: true }).click();
    await expect(page.locator('.exam-header')).toHaveCSS('background-color', 'rgb(152, 0, 93)');
    await expect(page.locator('#timer-value')).toHaveText('25:00');
    await page.getByRole('button', { name: 'Large text', exact: true }).click();
    await page.locator('[data-question="19"]').click();
    await expect(page.locator('[data-question="19"]')).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('[data-question="19"]')).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Save answer', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.locator('[data-question="18"]')).toHaveAttribute('aria-current', 'true');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/dmat-exam-${task}-mobile.png`, fullPage: true });
    await page.setViewportSize({ width: 320, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/dmat-exam-${task}-compact.png`, fullPage: true });
  });
}
