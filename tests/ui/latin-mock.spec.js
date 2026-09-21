import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import { parseBackup } from '../../website/js/data-transfer.js';

const bank = JSON.parse(fs.readFileSync(new URL('../../website/data/latin-squares/puzzles.json', import.meta.url))).puzzles;
const key = 'dmat-latin-progress-v1';
const mixes = {
  easy: { easy: 10, exam: 8, hard: 2 },
  normal: { easy: 6, exam: 8, hard: 6 },
  hard: { exam: 8, hard: 10, extreme: 2 },
  extreme: { exam: 5, hard: 10, extreme: 5 },
};

for (const [level, mix] of Object.entries(mixes)) {
  test(`${level} mock has exact mix, persists and repeats its level`, async ({ page }) => {
    await page.goto('/latin-squares/mock/');
    await expect(page.getByLabel('Mock difficulty')).toHaveValue('normal');
    await page.getByLabel('Mock difficulty').selectOption(level);
    for (const [difficulty, count] of Object.entries(mix)) {
      await expect(page.locator('#mock-mix')).toContainText(`${count} ${{ easy: 'Easy', exam: 'Exam Standard', hard: 'Hard', extreme: 'Extreme' }[difficulty]}`);
    }
    await page.reload();
    await expect(page.getByLabel('Mock difficulty')).toHaveValue(level);
    await page.getByRole('button', { name: 'Start Mock', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Question 1 of 20' })).toBeVisible();
    await expect(page.locator('#timer-value')).toHaveText('25:00');
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'End Subtest' }).click();
    const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key))[0], key);
    expect(saved.difficulty).toBe(level);
    expect(new Set(saved.puzzleIds).size).toBe(20);
    const counts = {};
    for (const id of saved.puzzleIds) {
      const difficulty = bank.find(question => question.id === id).difficulty.targetCell;
      counts[difficulty] = (counts[difficulty] || 0) + 1;
    }
    expect(counts).toEqual(mix);
    expect(() => parseBackup(JSON.stringify({ version: 1, task: 'latin-squares', sessions: [saved] }))).not.toThrow();
    const label = level[0].toUpperCase() + level.slice(1);
    await expect(page.locator('.eyebrow')).toContainText(label);
    await page.getByRole('button', { name: 'Take another mock' }).click();
    await expect(page.getByLabel('Mock difficulty')).toHaveValue(level);
    await page.goto('/latin-squares/progress/');
    await expect(page.locator('.session-row')).toContainText(label);
  });
}

test('invalid level defaults to Normal and mock expires once after 25 minutes', async ({ page }) => {
  await page.clock.install();
  await page.goto('/latin-squares/mock/?difficulty=unknown');
  await expect(page.getByLabel('Mock difficulty')).toHaveValue('normal');
  await expect(page).not.toHaveURL(/unknown/);
  await page.getByRole('button', { name: 'Start Mock', exact: true }).click();
  await page.clock.fastForward(1500000);
  await expect(page.getByText('Time expired, so the mock was submitted automatically.')).toBeVisible();
  await page.clock.fastForward(10000);
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ difficulty: 'normal', totalTime: 1500, automatic: true, questionCount: 20 });
  await page.evaluate(key => { const saved = JSON.parse(localStorage.getItem(key)); saved[0].difficulty = null; localStorage.setItem(key, JSON.stringify(saved)); }, key);
  await page.goto('/latin-squares/progress/');
  await expect(page.locator('.session-row')).toContainText('Previous mix');
});
