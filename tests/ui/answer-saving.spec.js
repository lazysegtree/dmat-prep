import { expect, test } from '@playwright/test';

const trainers = [
  ['latin-squares', 'dmat-latin-progress-v1'],
  ['mathematical-equations', 'dmat-equations-progress-v1'],
  ['figure-sequences', 'dmat-figures-progress-v1'],
];

async function enterAnswer(page, task, alternate = false) {
  if (task === 'latin-squares') {
    await page.getByRole('button', { name: alternate ? 'B' : 'A', exact: true }).click();
  } else if (task === 'mathematical-equations') {
    for (const input of await page.locator('[data-variable]').all()) await input.fill(alternate ? '2' : '1');
  } else {
    for (const frame of [0, 1]) await page.locator(`[data-frame="${frame}"][data-option="${alternate ? 1 : 0}"]`).click();
  }
}

async function expectAnswer(page, task, value) {
  if (task === 'latin-squares') {
    const selected = page.locator('[data-symbol][aria-pressed="true"]');
    if (value === null) await expect(selected).toHaveCount(0);
    else await expect(selected).toHaveAttribute('data-symbol', value ? 'B' : 'A');
  } else if (task === 'mathematical-equations') {
    for (const input of await page.locator('[data-variable]').all()) await expect(input).toHaveValue(value === null ? '' : value ? '2' : '1');
  } else {
    await expect(page.locator('.sequence-option.selected')).toHaveCount(value === null ? 0 : 2);
    if (value !== null) for (const frame of [0, 1]) await expect(page.locator(`[data-frame="${frame}"][data-option="${value ? 1 : 0}"]`)).toHaveAttribute('aria-pressed', 'true');
  }
}

for (const [task, key] of trainers) {
  test(`${task}: only explicit saving retains answers across navigation and submission`, async ({ page }) => {
    await page.goto(`/${task}/speed-drill/`);
    await page.getByLabel('Questions', { exact: true }).selectOption('10');
    await page.getByRole('button', { name: 'Start Speed Drill' }).click();
    const question = index => page.locator(`[data-question="${index}"]`);
    await enterAnswer(page, task);
    await expect(question(0)).toHaveAttribute('aria-label', /, unanswered$/);
    // Clicking the current question does not discard a draft.
    await question(0).click();
    await expectAnswer(page, task, false);
    await question(1).click();
    await question(0).click();
    await expectAnswer(page, task, null);
    // Back is navigation, not a save action.
    await question(1).click();
    await enterAnswer(page, task);
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await question(1).click();
    await expectAnswer(page, task, null);
    await question(0).click();
    await enterAnswer(page, task);
    await page.getByRole('button', { name: 'Save and Next' }).click();
    await expect(question(0)).toHaveAttribute('aria-label', /, answered$/);
    await question(0).click();
    await expectAnswer(page, task, false);
    // Unsaved edits must not overwrite an earlier saved answer.
    await enterAnswer(page, task, true);
    await question(1).click();
    await question(0).click();
    await expectAnswer(page, task, false);
    // The final question can be saved without ending the test.
    await question(9).click();
    await enterAnswer(page, task);
    await page.getByRole('button', { name: 'Save answer', exact: true }).click();
    await expect(question(9)).toHaveAttribute('aria-label', /, answered$/);
    await question(0).click();
    await enterAnswer(page, task, true);
    await page.getByRole('button', { name: 'End Subtest' }).click();
    const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key))[0], key);
    expect(saved.unanswered).toBe(8);
    expect(saved.statuses[1]).toBe('unanswered');
    expect(saved.statuses[9]).not.toBe('unanswered');
    if (task === 'latin-squares') {
      const { row, column } = saved.targets[0];
      expect(saved.answers[0][row][column]).toBe('A');
    } else if (task === 'mathematical-equations') {
      expect(Object.values(saved.answers[0]).every(value => value === '1')).toBe(true);
    } else expect(saved.answers[0]).toEqual([0, 0]);
  });

  for (const automatic of [false, true]) {
    test(`${task}: ${automatic ? 'expiry' : 'submission'} leaves an unsaved current answer unattempted`, async ({ page }) => {
      await page.clock.install();
      await page.goto(`/${task}/mock/`);
      await page.getByRole('button', { name: 'Start Mock', exact: true }).click();
      await enterAnswer(page, task);
      if (automatic) await page.clock.fastForward(1500000);
      else {
        page.once('dialog', dialog => dialog.accept());
        await page.getByRole('button', { name: 'End Subtest' }).click();
      }
      const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key))[0], key);
      expect(saved.unanswered).toBe(20);
      expect(saved.correct).toBe(0);
      expect(saved.incorrect).toBe(0);
      expect(saved.automatic).toBe(automatic);
      if (task === 'figure-sequences') expect(saved.frameCorrect).toBe(0);
    });
  }
}
