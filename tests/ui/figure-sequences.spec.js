import { expect, test } from '@playwright/test';
import fs from 'node:fs';
const bank = JSON.parse(fs.readFileSync(new URL('../../website/data/figure-sequences.json', import.meta.url)));
const puzzle = bank.puzzles[0];
const key = 'dmat-figures-progress-v1';
const answers = async (page, question) => {
 for (let frame = 0; frame < 2; frame++) await page.locator(`[data-frame="${frame}"][data-option="${question.questions[frame].answerIndex}"]`).click();
};

test('every silhouette renders in a playable sequence with distinct options', async ({ page }) => {
 const errors = [];
 page.on('pageerror', (error) => errors.push(error.message));
 const low = bank.puzzles.filter((puzzle) => puzzle.difficulty.level === 'low');
 const shapes = [...new Set(low.flatMap((puzzle) => puzzle.actors.map((actor) => actor.shape)))];
 expect(shapes).toHaveLength(18);
 for (const shape of shapes) {
  const question = low.find((puzzle) => puzzle.actors[0].shape === shape);
  await page.goto(`/figure-sequences/learn/?question=${question.id}`);
  await expect(page.locator(`[data-shape="${shape}"]`)).toHaveCount(10);
  await expect(page.locator(`[data-shape="${shape}"]`).first()).toBeVisible();
  const sizes = await page.locator(`[data-shape="${shape}"]`).evaluateAll((elements) => elements.map((element) => {
   const { width, height } = element.getBBox();
   return { width, height };
  }));
  expect(sizes.every(({ width, height }) => width > 0 && width <= 28 && height > 0 && height <= 28)).toBe(true);
  await answers(page, question);
  await page.getByRole('button', { name: 'Check answers' }).click();
  await expect(page.getByRole('heading', { name: 'All correct' })).toBeVisible();
 }
 expect(errors).toEqual([]);
});

test('new movement and rotation patterns can be answered and reviewed', async ({ page }) => {
 const cases = [
  (program) => program.motion === 'stationary',
  (program) => program.motion === 'small-square' && program.direction === 1 && program.path[0].row === 1 && program.path[0].column === 1,
  (program) => program.motion === 'small-square' && program.direction === -1,
  (program) => program.motion === 'diagonal-bounce' && program.path.length === 4,
  (program) => program.motion === 'perimeter' && program.direction === -1 && program.stepMode === 'increasing' && program.stepSize === 2,
  (program) => program.rotationIncreasing && program.rotationStep === -90,
 ];
 for (const matches of cases) {
  const question = bank.puzzles.find((puzzle) => puzzle.programs.some(matches));
  expect(question).toBeDefined();
  await page.goto(`/figure-sequences/learn/?question=${question.id}`);
  await expect(page.getByRole('heading', { name: 'Sequence 1 of 1' })).toBeVisible();
  await answers(page, question);
  await page.getByRole('button', { name: 'Check answers' }).click();
  await expect(page.getByRole('heading', { name: 'All correct' })).toBeVisible();
  await expect(page.locator('.inference-steps')).toContainText(question.programs.find(matches).explanation);
 }
});

test('learn, review, persistence and three-trainer backup round trip on mobile', async ({ page }) => {
 const errors = [];
 page.on('pageerror', (error) => errors.push(error.message));
 await page.setViewportSize({ width: 390, height: 844 });
 await page.goto(`/figure-sequences/learn/?question=${puzzle.id}`);
 await expect(page.getByRole('heading', { name: 'Sequence 1 of 1' })).toBeVisible();
 await expect(page.locator('#timer-value')).toHaveCount(0);
 await expect(page.getByRole('button', { name: 'Check answers' })).toBeDisabled();
 await page.getByRole('button', { name: 'Show strategy hint' }).click();
 await expect(page.locator('.hint-box')).toBeVisible();
 await answers(page, puzzle);
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 await page.screenshot({ path: '/tmp/figure-sequences-mobile.png', fullPage: true });
 await page.getByRole('button', { name: 'Check answers' }).click();
 await expect(page.getByRole('heading', { name: 'All correct' })).toBeVisible();
 await expect(page.getByRole('heading', { name: 'Rule explanation' })).toBeVisible();
 await page.goto('/figure-sequences/progress/');
 await expect(page.locator('.session-row')).toHaveCount(1);
 await page.reload();
 await expect(page.locator('.session-row')).toContainText('2/2 frames');
 const downloadPromise = page.waitForEvent('download');
 await page.getByRole('button', { name: 'Export all progress' }).click();
 const stream = await (await downloadPromise).createReadStream();
 const chunks = []; for await (const chunk of stream) chunks.push(chunk);
 const backup = Buffer.concat(chunks);
 const data = JSON.parse(backup);
 expect(data.version).toBe(3);
 expect(data.progress['figure-sequences'][0].frameCorrect).toBe(2);
 await page.evaluate(() => localStorage.clear());
 await page.reload();
 await page.getByLabel('Backup file').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: backup });
 await page.getByRole('button', { name: 'Import progress' }).click();
 await expect(page.locator('.session-row')).toHaveCount(1);
 await page.getByRole('button', { name: 'Review', exact: true }).click();
 await expect(page.getByRole('heading', { name: 'All correct' })).toBeVisible();
 await page.getByRole('button', { name: 'Review', exact: true }).click();
 await expect(page.getByRole('heading', { name: 'Rule explanation' })).toBeVisible();
 expect(errors).toEqual([]);
});

test('drill keeps both choices through navigation, hides feedback and guards leaving', async ({ page }) => {
 await page.setViewportSize({ width: 1440, height: 900 });
 await page.goto('/figure-sequences/speed-drill/');
 await page.getByRole('button', { name: 'Start Speed Drill' }).click();
 await expect(page.getByRole('heading', { name: 'Sequence 1 of 10' })).toBeVisible();
 const frames = await page.locator('.exam-sequence-layout > .sequence-frame-card, .sequence-missing-frame').evaluateAll(elements => elements.map(element => {
  const { x, y, width, height } = element.getBoundingClientRect();
  return { x, y, width, height };
 }));
 expect(frames).toHaveLength(6);
 for (const frame of frames) {
  expect(frame.y).toBeCloseTo(frames[0].y, 0);
  expect(frame.width).toBeCloseTo(frame.height, 0);
 }
 for (let frame = 0; frame < 2; frame++) {
  const options = await page.locator(`[data-frame="${frame}"]`).evaluateAll(elements => elements.map(element => {
   const { x, y, width, height } = element.getBoundingClientRect();
   return { x, y, width, height };
  }));
  expect(options).toHaveLength(3);
  for (const [index, option] of options.entries()) {
   expect(option.x).toBeCloseTo(frames[frame + 4].x, 0);
   expect(option.width).toBeCloseTo(frames[frame + 4].width, 0);
   expect(option.y).toBeGreaterThan(index ? options[index - 1].y + options[index - 1].height : frames[frame + 4].y + frames[frame + 4].height);
  }
 }
 await page.locator('[data-frame="0"][data-option="0"]').click();
 await page.locator('[data-frame="1"][data-option="1"]').click();
 await page.getByRole('button', { name: 'Save and Next' }).click();
 await page.getByRole('button', { name: 'Back', exact: true }).click();
 await expect(page.locator('[data-frame="0"][data-option="0"]')).toHaveAttribute('aria-pressed', 'true');
 await expect(page.locator('[data-frame="1"][data-option="1"]')).toHaveAttribute('aria-pressed', 'true');
 await page.locator('[data-frame="0"][data-option="2"]').press('Enter');
 await expect(page.locator('[data-frame="0"][data-option="0"]')).toHaveAttribute('aria-pressed', 'false');
 await expect(page.locator('[data-frame="0"][data-option="2"]')).toHaveAttribute('aria-pressed', 'true');
 await expect(page.locator('.sequence-option.selected')).toHaveCount(2);
 await expect(page.locator('[data-question="0"]')).toHaveAttribute('aria-label', 'Sequence 1, answered');
 await page.getByRole('heading', { name: 'Sequence 1 of 10' }).click();
 await page.mouse.move(0, 0);
 await page.screenshot({ path: '/tmp/dmat-figure-sequences-desktop.png', fullPage: true });
 await expect(page.locator('.sequence-option.correct')).toHaveCount(0);
 await expect(page.locator('#show-hint')).toHaveCount(0);
 page.once('dialog', (dialog) => dialog.dismiss());
 await page.getByRole('button', { name: 'Leave session' }).click();
 await expect(page.getByRole('heading', { name: 'Sequence 1 of 10' })).toBeVisible();
 await page.getByRole('button', { name: 'End Subtest' }).click();
 const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key))[0], key);
 expect(saved.questionCount).toBe(10);
 expect(new Set(saved.questionIds).size).toBe(10);
 expect(saved.unanswered).toBe(9);
});

test('mock expires once with paired partial credit and bounded time', async ({ page }) => {
 await page.clock.install();
 await page.goto('/figure-sequences/mock/');
 await page.getByRole('button', { name: 'Start Mock' }).click();
 await expect(page.getByRole('heading', { name: 'Sequence 1 of 20' })).toBeVisible();
 const id = await page.locator('[data-question-id]').getAttribute('data-question-id');
 const first = bank.puzzles.find((question) => question.id === id);
 await page.locator(`[data-frame="0"][data-option="${first.questions[0].answerIndex}"]`).click();
 await page.getByRole('button', { name: 'Save and Next' }).click();
 await page.clock.fastForward(1560000);
 await expect(page.getByText('Time expired, so the mock was submitted automatically.')).toBeVisible();
 await page.clock.fastForward(10000);
 const sessions = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);
 expect(sessions).toHaveLength(1);
 expect(sessions[0]).toMatchObject({ correct: 0, frameCorrect: 1, questionCount: 20, totalTime: 1500, automatic: true });
 expect(new Set(sessions[0].questionIds).size).toBe(20);
 expect(sessions[0].questionTimes.reduce((sum, time) => sum + time, 0)).toBeLessThanOrEqual(1500);
 await page.screenshot({ path: '/tmp/figure-sequences-results.png', fullPage: true });
});

test('old route redirects and unavailable bank and storage errors are visible', async ({ page }) => {
 await page.goto('/figure-sequences.html');
 await expect(page).toHaveURL(/figure-sequences\/$/);
 await expect(page.getByRole('link', { name: /^Learn/ })).toBeVisible();
 await page.goto(`/figure-sequences/learn/?question=${puzzle.id}`);
 await answers(page, puzzle);
 await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('quota'); }; });
 await page.getByRole('button', { name: 'Check answers' }).click();
 await expect(page.getByRole('alert')).toContainText('could not be saved');
 await expect(page.getByRole('heading', { name: 'All correct' })).toBeVisible();
 await page.route('**/data/figure-sequences.json', (route) => route.fulfill({ status: 503, body: 'Unavailable' }));
 await page.goto('/figure-sequences/');
 await expect(page.locator('.error')).toContainText('could not be loaded');
});
