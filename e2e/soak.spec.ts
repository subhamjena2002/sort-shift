import type { Page } from '@playwright/test';
import { expect, openGame, startBot, startToAnnouncement, state, stopBot, test, waitForGameOverScreen, waitForMachine, waitFrames } from './helpers';

type Metrics = Record<string, number | null> & { orphanSizes?: string };

const metrics = (page: Page): Promise<Metrics> => page.evaluate(() => window.__SORT_SHIFT_E2E__?.metrics() as unknown as Metrics);

/** Quiet moment comparable between samples: the announcement card, with the bot stopped. */
async function sampleAtAnnouncement(page: Page): Promise<Metrics> {
  await expect.poll(() => state(page).then((s) => s.readyArmed), { intervals: [25] }).toBe(true);
  await waitFrames(page, 45); // let exit animations and their tweens finish
  return metrics(page);
}

const STABLE_KEYS = ['children', 'textures', 'orphanTextures', 'blurListeners', 'hiddenListeners', 'resizeListeners', 'keyListeners', 'sceneEventListeners', 'audioContexts'];

test.describe('long sessions @soak', () => {
  test.setTimeout(590_000);

  test('object and listener counts stay flat across many restarts', async ({ page }) => {
    await openGame(page, { seed: 9 });
    await startToAnnouncement(page);
    const baseline = await sampleAtAnnouncement(page);
    const samples: Metrics[] = [];

    for (let run = 0; run < 25; run += 1) {
      await startBot(page, { accuracy: 0, thinkAt: 0.02 });
      await waitForGameOverScreen(page);
      await stopBot(page);
      await page.keyboard.press('Enter');
      await waitForMachine(page, 'SHIFT_ANNOUNCEMENT');
      samples.push(await sampleAtAnnouncement(page));
    }

    console.log('restart baseline', JSON.stringify(baseline));
    console.log('restart final', JSON.stringify(samples.at(-1)));
    console.log('restart textures per sample', samples.map((s) => s.textures).join(' '));
    for (const sample of samples) {
      for (const key of STABLE_KEYS) expect(sample[key], key).toBe(baseline[key]);
      expect(sample.timers).toBeLessThanOrEqual((baseline.timers ?? 0) + 2);
      expect(sample.tweens).toBeLessThanOrEqual((baseline.tweens ?? 0) + 4);
    }
  });

  test('a long run through many shifts stays flat', async ({ page }) => {
    await openGame(page, { seed: 21 });
    await startToAnnouncement(page);
    const baseline = await sampleAtAnnouncement(page);
    const startHeap = baseline.heapBytes ?? 0;
    let last: Metrics = baseline;
    let maxEarlyTextures = baseline.textures ?? 0;
    const shifts = 24;

    for (let shift = 2; shift <= shifts; shift += 1) {
      await startBot(page, { untilShift: shift, thinkAt: 0.03, extraSteps: 2 });
      await expect
        .poll(() => state(page).then((s) => s.machine === 'SHIFT_ANNOUNCEMENT' && s.shift === shift), { timeout: 120_000, intervals: [50] })
        .toBe(true);
      await stopBot(page);
      last = await sampleAtAnnouncement(page);
      for (const key of STABLE_KEYS) {
        // Each rule card has its own number of labels, so these two vary by shift.
        if (key === 'children' || key === 'textures') continue;
        expect(last[key], `${key} at shift ${shift}`).toBe(baseline[key]);
      }
      // By shift 12 every card size has appeared; later shifts must never exceed that.
      if (shift <= 12) maxEarlyTextures = Math.max(maxEarlyTextures, last.textures ?? 0);
      else expect(last.textures ?? 0, `textures at shift ${shift}`).toBeLessThanOrEqual(maxEarlyTextures);
      expect(last.children ?? 0).toBeLessThanOrEqual((baseline.children ?? 0) + 2);
      expect(last.audioActiveNodes ?? 0).toBeLessThan(40);
    }

    const s = await state(page);
    expect(s.shift).toBe(shifts);
    expect(s.mistakes).toBe(0);
    console.log('run baseline', JSON.stringify(baseline));
    console.log('run final', JSON.stringify(last));
    console.log('heap growth MB', ((last.heapBytes ?? 0) - startHeap) / 1048576);
  });

  test('frame times during play', async ({ page }) => {
    await openGame(page, { seed: 33 });
    await startToAnnouncement(page);
    await startBot(page, { thinkAt: 0.15 });
    await page.evaluate(() => window.__SORT_SHIFT_E2E__?.startFrameSampling());
    await waitFrames(page, 900);
    const result = await page.evaluate(() => window.__SORT_SHIFT_E2E__?.stopFrameSampling());
    await stopBot(page);
    console.log('software-rendered frame times', JSON.stringify(result));
    expect(result?.frames ?? 0).toBeGreaterThan(100);
  });
});
