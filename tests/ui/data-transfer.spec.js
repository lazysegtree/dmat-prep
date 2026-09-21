import { expect, test } from '@playwright/test';

const session = (id) => ({ id, date: '2026-09-21T09:00:00.000Z', mode: 'learn', questionType: 'target', questionCount: 1, correct: 1, totalTime: 30, questionTimes: [30] });
const file = (sessions) => ({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ version: 1, sessions })) });
const key = 'dmat-latin-progress-v1';

test('home exports both trainers and imports with merge and confirmed replace', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key, value: [session('local')] });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export all progress' }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const backup = JSON.parse(Buffer.concat(chunks).toString());
  expect(backup.progress['latin-squares'][0].id).toBe('local');
  expect(backup.progress['mathematical-equations']).toEqual([]);
  await page.getByLabel('Backup file').setInputFiles(file([session('imported')]));
  await page.getByRole('button', { name: 'Import progress' }).click();
  await expect(page.getByRole('status')).toHaveText('Progress merged successfully.');
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).length, key)).toBe(2);
  await page.getByLabel('Import mode').selectOption('replace');
  await page.getByLabel('Backup file').setInputFiles(file([]));
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Import progress' }).click();
  await expect(page.getByRole('status')).toHaveText('Import cancelled. Existing progress was kept.');
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).length, key)).toBe(2);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Import progress' }).click();
  await expect(page.getByRole('status')).toHaveText('Progress replaced successfully.');
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key)).toEqual([]);
});

for (const route of ['latin-squares', 'mathematical-equations']) {
  test(`${route} progress supports import on an empty browser and refreshes the view`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`/${route}/progress/`);
    const payload = { version: 1, task: route, sessions: [session('restored')] };
    await page.getByLabel('Backup file').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(payload)) });
    await page.getByRole('button', { name: 'Import progress' }).click();
    await expect(page.getByRole('status')).toHaveText('Progress merged successfully.');
    await expect(page.locator('.session-row')).toHaveCount(1);
    await page.reload();
    await expect(page.locator('.session-row')).toHaveCount(1);
    await page.getByLabel('Backup file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{') });
    await page.getByRole('button', { name: 'Import progress' }).click();
    await expect(page.getByRole('status')).toContainText('valid JSON');
    await expect(page.locator('.session-row')).toHaveCount(1);
    expect(errors).toEqual([]);
  });
}
