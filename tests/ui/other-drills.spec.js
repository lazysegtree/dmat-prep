import { expect, test } from '@playwright/test';
import fs from 'node:fs';

const configurations = {
  low: { low: 10 }, medium: { medium: 10 }, high: { high: 10 }, extreme: { extreme: 10 },
  'mixed-all': null,
  'mixed-easy': { low: 5, medium: 4, high: 1 },
  'mixed-medium': { low: 3, medium: 4, high: 3 },
  'mixed-hard': { medium: 4, high: 5, extreme: 1 },
  'mixed-extreme': null,
};
const trainers = [
  { task: 'mathematical-equations', key: 'dmat-equations-progress-v1', heading: 'Question', file: 'mathematical-equations/questions.json', collection: 'questions' },
  { task: 'figure-sequences', key: 'dmat-figures-progress-v1', heading: 'Sequence', file: 'figure-sequences.json', collection: 'puzzles' },
];

for (const { task, key, heading, file, collection } of trainers) {
  const bank = JSON.parse(fs.readFileSync(new URL(`../../website/data/${file}`, import.meta.url)))[collection];
  for (const [difficulty, expected] of Object.entries(configurations)) {
    test(`${task}: ${difficulty} selects the mix and repeats all settings`, async ({ page }) => {
      await page.goto(`/${task}/speed-drill/`);
      await expect(page.getByLabel('Questions', { exact: true })).toHaveValue('5');
      await expect(page.getByLabel('Mix', { exact: true })).toHaveValue('mixed-all');
      await expect(page.locator('#drill-mix-description')).toContainText('25% Easy · 25% Medium · 25% Hard · 25% Extreme');
      const mixed = difficulty.startsWith('mixed-');
      await page.getByLabel('Distribution', { exact: true }).selectOption(mixed ? 'mixed' : 'single');
      await page.getByLabel(mixed ? 'Mix' : 'Training difficulty', { exact: true }).selectOption(difficulty);
      const count = difficulty === 'mixed-all' ? 5 : 10;
      await page.getByLabel('Questions', { exact: true }).selectOption(String(count));
      if (difficulty === 'mixed-hard') await expect(page.locator('#drill-mix-description')).toContainText('40% Medium · 50% Hard · 10% Extreme');
      await page.reload();
      await expect(page.locator('#difficulty')).toHaveValue(difficulty);
      await page.getByRole('button', { name: 'Start Speed Drill' }).click();
      await expect(page.getByRole('heading', { name: `${heading} 1 of ${count}` })).toBeVisible();
      await expect(page.locator('#timer-value')).toHaveText(count === 5 ? '6:15' : '12:30');
      await expect(page.locator('#app')).not.toContainText(/\b(Easy|Medium|Hard|Extreme|Low|High|Mixed)\b/);
      await expect(page.locator('#show-hint, .correct, .incorrect')).toHaveCount(0);
      await page.getByRole('button', { name: 'End Subtest' }).click();
      const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key))[0], key);
      expect(saved).toMatchObject({ difficulty, questionCount: count, timeLimit: count * 75, drillTimer: 'pace' });
      expect(new Set(saved.questionIds).size).toBe(count);
      const questions = saved.questionIds.map(id => bank.find(question => question.id === id));
      const counts = {};
      for (const question of questions) counts[question.difficulty.level] = (counts[question.difficulty.level] || 0) + 1;
      if (expected) expect(counts).toEqual(expected);
      else if (difficulty === 'mixed-all') expect(Object.values(counts).sort()).toEqual([1, 1, 1, 2]);
      else {
        expect(counts.high).toBe(5);
        expect([counts.medium, counts.extreme].sort()).toEqual([2, 3]);
        expect(counts.low).toBeUndefined();
      }
      if (task === 'figure-sequences' && difficulty === 'low') expect(new Set(questions.flatMap(question => question.actors.map(actor => actor.shape))).size).toBe(10);
      await page.getByRole('button', { name: 'New Speed Drill' }).click();
      await expect(page.locator('#difficulty')).toHaveValue(difficulty);
      await expect(page.getByLabel('Questions', { exact: true })).toHaveValue(String(count));
      await expect(page.getByLabel('Time limit', { exact: true })).toHaveValue('pace');
    });
  }

  test(`${task}: custom expiry preserves scoring, backup settings and compact layout`, async ({ page }) => {
    await page.clock.install();
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(`/${task}/speed-drill/?difficulty=mixed-hard`);
    await page.getByLabel('Time limit', { exact: true }).selectOption('custom');
    await page.getByLabel('Minutes', { exact: true }).fill('0.25');
    await page.reload();
    await expect(page.getByLabel('Minutes', { exact: true })).toHaveValue('0.25');
    const distribution = await page.getByLabel('Distribution', { exact: true }).boundingBox();
    const mix = await page.getByLabel('Mix', { exact: true }).boundingBox();
    expect(distribution.y).toBe(mix.y);
    const time = await page.getByLabel('Time limit', { exact: true }).boundingBox();
    expect((await page.locator('#custom-time-field').boundingBox()).x).toBe(time.x);
    await page.screenshot({ path: `/tmp/dmat-${task}-drill-desktop.png`, fullPage: true });
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.screenshot({ path: `/tmp/dmat-${task}-drill-mobile.png`, fullPage: true });
    await page.getByRole('button', { name: 'Start Speed Drill' }).click();
    await expect(page.locator('#timer-value')).toHaveText('0:15');
    if (task === 'figure-sequences') {
      const id = await page.locator('[data-question-id]').getAttribute('data-question-id');
      const question = bank.find(item => item.id === id);
      for (const frame of [0, 1]) await page.locator(`[data-frame="${frame}"][data-option="${question.questions[frame].answerIndex}"]`).click();
    } else {
      const equations = await page.locator('[aria-label="System of equations"] p').allTextContents();
      const question = bank.find(item => JSON.stringify(item.equations.map(equation => equation.display)) === JSON.stringify(equations));
      expect(question).toBeDefined();
      for (const variable of question.variables) await page.locator(`[data-variable="${variable}"]`).fill(String(question.answer[variable]));
    }
    await page.getByRole('button', { name: 'Save and Next' }).click();
    if (task === 'figure-sequences') await page.locator('[data-frame="0"][data-option="0"]').click();
    else for (const input of await page.locator('[data-variable]').all()) await input.fill('2');
    await page.clock.fastForward(5000);
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.locator('#timer-value')).toHaveText('0:10');
    await page.clock.fastForward(60000);
    await expect(page.getByText('Time expired, so the drill was submitted automatically.')).toBeVisible();
    const sessions = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ difficulty: 'mixed-hard', questionCount: 5, timeLimit: 15, totalTime: 15, automatic: true, correct: 1, unanswered: 4 });
    expect(sessions[0].questionTimes.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(15);
    if (task === 'figure-sequences') expect(sessions[0].frameCorrect).toBe(2);
    await page.evaluate(async () => {
      const { exportBackup, importBackup } = await import('/js/data-transfer.js');
      const backup = exportBackup();
      localStorage.clear();
      importBackup(backup, 'replace');
    });
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key)).toEqual(sessions);
    await page.getByRole('button', { name: 'New Speed Drill' }).click();
    await expect(page.getByLabel('Time limit', { exact: true })).toHaveValue('custom');
    await expect(page.getByLabel('Minutes', { exact: true })).toHaveValue('0.25');
    await expect(page.getByLabel('Questions', { exact: true })).toHaveValue('5');
    await expect(page.getByLabel('Mix', { exact: true })).toHaveValue('mixed-hard');
    await page.goto(`/${task}/progress/`);
    await expect(page.locator('.session-row')).toContainText('Mixed · Hard');
  });

  test(`${task}: native difficulty links, stopwatch and invalid settings stay usable`, async ({ page }) => {
    await page.clock.install();
    await page.goto(`/${task}/speed-drill/?difficulty=high&count=5&timer=none`);
    await expect(page.getByLabel('Training difficulty')).toHaveValue('high');
    await page.getByRole('button', { name: 'Start Speed Drill' }).click();
    await page.clock.fastForward(400000);
    await page.locator('[data-question="4"]').click();
    await expect(page.locator('#timer-value')).toHaveText('6:40');
    await page.getByRole('button', { name: 'End Subtest' }).click();
    await expect(page.locator('.results-summary')).toContainText('Pace target6:15');
    await page.getByRole('button', { name: 'New Speed Drill' }).click();
    await expect(page.getByLabel('Time limit', { exact: true })).toHaveValue('none');
    await expect(page.getByLabel('Training difficulty')).toHaveValue('high');
    await page.goto(`/${task}/speed-drill/?difficulty=unknown&count=999&timer=invalid&minutes=-2`);
    await expect(page.getByLabel('Mix', { exact: true })).toHaveValue('mixed-all');
    await expect(page.getByLabel('Questions', { exact: true })).toHaveValue('5');
    await expect(page.getByLabel('Time limit', { exact: true })).toHaveValue('pace');
    await expect(page).not.toHaveURL(/unknown|999|invalid|-2/);
  });
}
