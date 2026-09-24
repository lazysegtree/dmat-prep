import { expect, test } from '@playwright/test';
import fs from 'node:fs';

const bank = JSON.parse(fs.readFileSync(new URL('../../website/data/latin-squares/puzzles.json', import.meta.url))).puzzles;
const key = 'dmat-latin-progress-v1';
const configurations = {
  easy: { easy: 10 }, exam: { exam: 10 }, hard: { hard: 10 }, extreme: { extreme: 10 },
  'mixed-all': null,
  'mixed-easy': { easy: 5, exam: 4, hard: 1 },
  'mixed-medium': { easy: 3, exam: 4, hard: 3 },
  'mixed-hard': { exam: 4, hard: 5, extreme: 1 },
  'mixed-extreme': null,
};

for (const [difficulty, expected] of Object.entries(configurations)) {
  test(`${difficulty} drill selects ten unique puzzles and repeats its settings`, async ({ page }) => {
    await page.goto('/latin-squares/speed-drill/');
    const mixed = difficulty.startsWith('mixed-');
    await page.getByLabel('Distribution', { exact: true }).selectOption(mixed ? 'mixed' : 'single');
    await page.getByLabel(mixed ? 'Mix' : 'Training difficulty', { exact: true }).selectOption(difficulty);
    await page.getByLabel('Questions', { exact: true }).selectOption('10');
    await page.reload();
    await expect(page.locator('#difficulty')).toHaveValue(difficulty);
    await expect(page.getByLabel('Questions', { exact: true })).toHaveValue('10');
    await page.getByRole('button', { name: 'Start Speed Drill' }).click();
    await expect(page.getByRole('heading', { name: 'Question 1 of 10' })).toBeVisible();
    await expect(page.locator('#timer-value')).toHaveText('12:30');
    await expect(page.locator('#app')).not.toContainText(/Easy|Medium|Exam Standard|Hard|Extreme|Mixed/);
    await expect(page.locator('#show-hint, .status, .inference-summary')).toHaveCount(0);
    await page.getByRole('button', { name: 'End Subtest' }).click();
    const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key))[0], key);
    expect(saved).toMatchObject({ difficulty, questionCount: 10, timeLimit: 750, drillTimer: 'pace' });
    expect(new Set(saved.puzzleIds).size).toBe(10);
    const counts = {};
    for (const id of saved.puzzleIds) {
      const level = bank.find(puzzle => puzzle.id === id).difficulty.targetCell;
      counts[level] = (counts[level] || 0) + 1;
    }
    if (expected) expect(counts).toEqual(expected);
    else if (difficulty === 'mixed-all') expect(Object.values(counts).sort()).toEqual([2, 2, 3, 3]);
    else {
      expect(counts.hard).toBe(5);
      expect([counts.exam, counts.extreme].sort()).toEqual([2, 3]);
      expect(counts.easy).toBeUndefined();
    }
    await page.getByRole('button', { name: 'New Speed Drill' }).click();
    await expect(page.locator('#difficulty')).toHaveValue(difficulty);
    await expect(page.getByLabel('Questions', { exact: true })).toHaveValue('10');
    await expect(page.getByLabel('Time limit', { exact: true })).toHaveValue('pace');
  });
}

test('five-question mixed default fits desktop and mobile and custom expiry scores only saved answers once', async ({ page }) => {
  await page.clock.install();
  await page.goto('/latin-squares/speed-drill/');
  await expect(page.getByLabel('Questions', { exact: true })).toHaveValue('5');
  await expect(page.getByLabel('Mix', { exact: true })).toHaveValue('mixed-all');
  await expect(page.locator('#drill-summary')).toContainText('6:15');
  await page.screenshot({ path: '/tmp/dmat-latin-drill-setup-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel('Time limit', { exact: true }).selectOption('custom');
  const minutes = page.getByLabel('Minutes', { exact: true });
  await minutes.fill('0');
  await page.getByRole('button', { name: 'Start Speed Drill' }).click();
  await expect(page.locator('#drill-setup')).toBeVisible();
  expect(await minutes.evaluate(input => input.validity.valid)).toBe(false);
  await minutes.fill('0.25');
  await page.reload();
  await expect(minutes).toHaveValue('0.25');
  await page.screenshot({ path: '/tmp/dmat-latin-drill-setup-mobile.png', fullPage: true });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByRole('button', { name: 'Start Speed Drill' }).click();
  await expect(page.getByRole('heading', { name: 'Question 1 of 5' })).toBeVisible();
  await expect(page.locator('#timer-value')).toHaveText('0:15');
  await page.getByRole('button', { name: 'A', exact: true }).click();
  await page.getByRole('button', { name: 'Save and Next' }).click();
  await page.getByRole('button', { name: 'B', exact: true }).click();
  await page.clock.fastForward(5000);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.locator('#timer-value')).toHaveText('0:10');
  await page.clock.fastForward(10000);
  await expect(page.getByText('Time expired, so the drill was submitted automatically.')).toBeVisible();
  await page.clock.fastForward(10000);
  const sessions = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
  expect(sessions).toHaveLength(1);
  expect(sessions[0]).toMatchObject({ difficulty: 'mixed-all', questionCount: 5, timeLimit: 15, totalTime: 15, timeRemaining: 0, automatic: true, unanswered: 4 });
  expect(sessions[0].statuses[0]).not.toBe('unanswered');
  expect(sessions[0].statuses[1]).toBe('unanswered');
  const summary = await page.locator('.results-summary').innerText();
  await page.evaluate(async () => {
    const { exportBackup, importBackup } = await import('/js/data-transfer.js');
    const backup = exportBackup();
    localStorage.removeItem('dmat-latin-progress-v1');
    importBackup(backup, 'replace');
  });
  await page.getByRole('link', { name: 'Back to progress' }).click();
  await expect(page.locator('.session-row')).toContainText('Mixed · All difficulties');
  await page.getByRole('link', { name: 'View results' }).click();
  await page.reload();
  await expect(page.locator('.results-summary')).toHaveText(summary, { useInnerText: true });
  await page.getByRole('button', { name: 'Review', exact: true }).first().click();
  await expect(page.locator('.inference-summary')).toContainText(/Easy|Exam Standard|Hard|Extreme/);
  await page.getByRole('button', { name: 'New Speed Drill' }).click();
  await expect(page.getByLabel('Time limit', { exact: true })).toHaveValue('custom');
  await expect(page.getByLabel('Minutes', { exact: true })).toHaveValue('0.25');
  await expect(page.getByLabel('Questions', { exact: true })).toHaveValue('5');
});

test('stopwatch keeps running past the pace target and legacy results repeat without adding a limit', async ({ page }) => {
  await page.clock.install();
  await page.goto('/latin-squares/speed-drill/?difficulty=hard&count=5&timer=none');
  await expect(page.getByLabel('Distribution', { exact: true })).toHaveValue('single');
  await page.getByRole('button', { name: 'Start Speed Drill' }).click();
  await page.clock.fastForward(400000);
  await page.locator('[data-question="4"]').click();
  await expect(page.locator('#timer-value')).toHaveText('6:40');
  await page.getByRole('button', { name: 'End Subtest' }).click();
  await expect(page.locator('.results-summary')).toContainText('Pace target6:15');
  await page.evaluate(key => {
    const saved = JSON.parse(localStorage.getItem(key));
    delete saved[0].timeLimit;
    delete saved[0].drillTimer;
    localStorage.setItem(key, JSON.stringify(saved));
  }, key);
  await page.getByRole('link', { name: 'Back to progress' }).click();
  await page.getByRole('link', { name: 'View results' }).click();
  await page.getByRole('button', { name: 'New Speed Drill' }).click();
  await expect(page.getByLabel('Time limit', { exact: true })).toHaveValue('none');
  await expect(page.getByLabel('Training difficulty')).toHaveValue('hard');
});

test('malformed settings fall back safely and Full Mock stays separate', async ({ page }) => {
  await page.goto('/latin-squares/speed-drill/?difficulty=unknown&count=999&timer=invalid&minutes=-2');
  await expect(page.getByLabel('Mix', { exact: true })).toHaveValue('mixed-all');
  await expect(page.getByLabel('Questions', { exact: true })).toHaveValue('5');
  await expect(page.getByLabel('Time limit', { exact: true })).toHaveValue('pace');
  await expect(page).not.toHaveURL(/unknown|999|invalid|-2/);
  await page.getByRole('link', { name: 'Back', exact: true }).click();
  await page.getByRole('link', { name: /^Full Mock / }).click();
  await expect(page.getByRole('heading', { name: '20 “Find the ?” questions. 25 minutes.' })).toBeVisible();
  await expect(page.getByLabel('Mock difficulty')).toHaveValue('normal');
  await expect(page.locator('#drill-setup')).toHaveCount(0);
});
