import { expect, test } from '@playwright/test';

test('saved drill results survive reload, backup restore, and puzzle bank changes', async ({ page }) => {
  await page.clock.install();
  await page.goto('/latin-squares/speed-drill/');
  await page.getByRole('button', { name: 'Start Speed Drill' }).click();
  await page.getByRole('button', { name: 'C', exact: true }).click();
  await page.clock.fastForward(91000);
  await page.getByRole('button', { name: 'Save and Next' }).click();
  await page.clock.fastForward(4000);
  await page.getByRole('button', { name: 'End Subtest' }).click();
  const summary = await page.locator('.results-summary').innerText();
  const review = await page.locator('.review-list').innerText();
  await expect(page.getByText('Q1 (1:31)', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Review', exact: true }).first().click();
  const detail = await page.locator('#review-detail').innerText();
  await page.evaluate(async () => {
    const { exportBackup, importBackup } = await import('/js/data-transfer.js');
    const backup = exportBackup();
    localStorage.removeItem('dmat-latin-progress-v1');
    importBackup(backup, 'replace');
  });
  await page.route('**/data/latin-squares/puzzles.json', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.puzzles.forEach((puzzle) => { puzzle.id = `new-${puzzle.id}`; });
    await route.fulfill({ json: data });
  });
  await page.getByRole('link', { name: 'Back to progress' }).click();
  await page.getByRole('link', { name: 'View results' }).click();
  await page.reload();
  await expect(page.locator('.results-summary')).toHaveText(summary, { useInnerText: true });
  await expect(page.locator('.review-list')).toHaveText(review, { useInnerText: true });
  await page.getByRole('button', { name: 'Review', exact: true }).first().click();
  await expect(page.locator('#review-detail')).toHaveText(detail, { useInnerText: true });
  await page.getByRole('button', { name: 'Review', exact: true }).nth(1).click();
  await expect(page.locator('#review-detail')).toContainText('Your answer: Unanswered');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('dmat-latin-progress-v1')).length)).toBe(1);

  // Existing saves have grids and timings but no saved explanation metadata.
  await page.unroute('**/data/latin-squares/puzzles.json');
  await page.evaluate(() => {
    const sessions = JSON.parse(localStorage.getItem('dmat-latin-progress-v1'));
    delete sessions[0].reviewPuzzles;
    localStorage.setItem('dmat-latin-progress-v1', JSON.stringify(sessions));
  });
  await page.reload();
  await page.getByRole('button', { name: 'Review', exact: true }).first().click();
  await expect(page.locator('#review-detail')).toHaveText(detail, { useInnerText: true });
});

test('incomplete and missing saved sessions have an explicit fallback', async ({ page }) => {
  await page.goto('/latin-squares/progress/');
  await page.evaluate(() => localStorage.setItem('dmat-latin-progress-v1', JSON.stringify([{
    id: 'old', date: '2026-09-21T08:00:00Z', mode: 'drill', questionType: 'target',
    questionCount: 10, correct: 9, totalTime: 100, questionTimes: Array(10).fill(10),
  }])));
  await page.goto('/latin-squares/progress/?session=old');
  await expect(page.getByRole('heading', { name: 'Your recent training' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'View results' })).toHaveCount(0);
  await expect(page.locator('.session-list')).toContainText('Question details were not saved');
  await page.goto('/latin-squares/progress/?session=missing');
  await expect(page.getByText('This saved session is no longer available.')).toBeVisible();
});
