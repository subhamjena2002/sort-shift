import {
  buttonPoint,
  clearEvents,
  clickButton,
  confirmAndWaitForParcel,
  eventTypes,
  events,
  expect,
  openGame,
  playToAnnouncementOf,
  startBot,
  startToAnnouncement,
  state,
  stopBot,
  test,
  waitForGameOverScreen,
  waitForMachine,
  waitForParcel,
  waitForPauseScreen,
  waitFrames,
} from './helpers';

const LANDSCAPE = { width: 1280, height: 720 };
const PORTRAIT = { width: 412, height: 800 };

test.describe('menu and starting', () => {
  test('menu loads', async ({ page }) => {
    await openGame(page);
    await expect(page.locator('canvas')).toBeVisible();
    const s = await state(page);
    expect(s.machine).toBe('MENU');
    expect(s.audio.contextsCreated).toBe(0); // no audio before a gesture
  });

  test('the play button starts a run', async ({ page }) => {
    await openGame(page);
    await clickButton(page, 'Menu', 'PLAY');
    await waitForMachine(page, 'SHIFT_ANNOUNCEMENT');
    const s = await state(page);
    expect(s.shift).toBe(1);
    expect(s.announcementVisible).toBe(true);
  });
});

test.describe('sorting input', () => {
  test('keyboard sorting reaches the chosen bin', async ({ page }) => {
    await openGame(page);
    await startToAnnouncement(page);
    let s = await confirmAndWaitForParcel(page);
    const correctKey = s.active?.expected === 'LEFT' ? 'ArrowLeft' : 'ArrowRight';
    await page.keyboard.press(correctKey);
    await expect.poll(() => state(page).then((x) => x.score)).toBe(10);

    s = await waitForParcel(page);
    const letter = s.active?.expected === 'LEFT' ? 'a' : 'd';
    await page.keyboard.press(letter);
    await expect.poll(() => state(page).then((x) => x.score)).toBe(20);

    s = await waitForParcel(page);
    await page.keyboard.press(s.active?.expected === 'LEFT' ? 'd' : 'a');
    await expect.poll(() => state(page).then((x) => x.mistakes)).toBe(1);
  });

  test('mouse sorting uses the on-screen buttons', async ({ page }) => {
    await openGame(page);
    await startToAnnouncement(page);
    const s = await confirmAndWaitForParcel(page);
    const side = s.active?.expected ?? 'LEFT';
    await clickButton(page, 'Game', side);
    await expect.poll(() => state(page).then((x) => x.score)).toBe(10);
    expect((await events(page)).find((e) => e.type === 'PARCEL_SORTED')).toMatchObject({ chosen: side, correct: true });
  });

  test.describe('touch', () => {
    test.use({ hasTouch: true, viewport: PORTRAIT });

    test('tapping a button sends the parcel to that destination', async ({ page }) => {
      await openGame(page);
      await startToAnnouncement(page);
      const ready = await buttonPoint(page, 'Game', "I'M READY");
      if (!ready) throw new Error('no ready button');
      await page.touchscreen.tap(ready.x, ready.y);
      await waitForMachine(page, 'COUNTDOWN');
      const s = await waitForParcel(page);
      const side = s.active?.expected ?? 'LEFT';
      const point = await buttonPoint(page, 'Game', side);
      if (!point) throw new Error('no sort button');
      await page.touchscreen.tap(point.x, point.y);
      await expect.poll(() => state(page).then((x) => x.score)).toBe(10);
      expect((await events(page)).find((e) => e.type === 'PARCEL_SORTED')).toMatchObject({ chosen: side, correct: true });
    });
  });
});

test.describe('pause', () => {
  test('pause stops gameplay and resume continues it', async ({ page }) => {
    await openGame(page);
    await startToAnnouncement(page);
    await confirmAndWaitForParcel(page);
    await page.keyboard.press('Escape');
    await waitForPauseScreen(page);
    const paused = await state(page);
    await waitFrames(page, 40);
    const later = await state(page);
    expect(later.active?.progress).toBe(paused.active?.progress);
    expect(later.beltOffset).toBe(paused.beltOffset);

    await page.keyboard.press('Escape');
    await waitForMachine(page, 'PLAYING');
    await expect.poll(() => state(page).then((x) => x.active?.progress ?? 0)).toBeGreaterThan(paused.active?.progress ?? 0);
  });

  test('pausing during an announcement returns to the same announcement', async ({ page }) => {
    await openGame(page);
    await startToAnnouncement(page);
    await page.keyboard.press('Escape');
    await waitForPauseScreen(page);
    await page.keyboard.press('Escape');
    await waitForMachine(page, 'SHIFT_ANNOUNCEMENT');
    const s = await state(page);
    expect(s.announcementVisible).toBe(true);
    expect(await eventTypes(page)).not.toContain('COUNTDOWN_STARTED');
  });

  test('pausing during the countdown cannot restart or duplicate it', async ({ page }) => {
    await openGame(page);
    await startToAnnouncement(page);
    await clearEvents(page);
    await page.keyboard.press('Enter');
    await expect.poll(() => state(page).then((s) => s.countdownValue), { intervals: [20] }).toBe(3);
    await page.keyboard.press('Escape');
    await waitForPauseScreen(page);
    await waitFrames(page, 90); // longer than a countdown step
    expect((await state(page)).countdownValue).not.toBeNull();
    await page.keyboard.press('Enter'); // must do nothing while paused
    await page.keyboard.press('Escape');
    await waitForMachine(page, 'COUNTDOWN');
    await waitForMachine(page, 'PLAYING');
    const ticks = (await events(page)).filter((e) => e.type === 'COUNTDOWN_TICK').map((e) => e.value);
    expect(ticks).toEqual([3, 2, 1]);
    expect((await eventTypes(page)).filter((t) => t === 'COUNTDOWN_STARTED')).toHaveLength(1);
  });
});

test.describe('shift announcements', () => {
  test('the announcement appears and shows the full rule', async ({ page }) => {
    await openGame(page);
    await startToAnnouncement(page);
    const s = await state(page);
    expect(s.announcementVisible).toBe(true);
    expect(s.announcementTitle).toContain('SHIFT 01');
    expect(s.announcementTitle).toContain('COLOR SORTING');
    expect(s.briefing?.firstTime).toBe(true);
    expect(s.left).toEqual(['BLUE']);
    expect(s.right).toEqual(['RED']);
  });

  test('the announcement never dismisses itself', async ({ page }) => {
    await openGame(page);
    await startToAnnouncement(page);
    await clearEvents(page);
    const before = await state(page);

    await waitFrames(page, 240);
    // Then ten simulated minutes through the real session, in one go.
    const produced = await page.evaluate(() => window.__SORT_SHIFT_E2E__?.simulateTime(600_000));
    expect(produced).toBe(0);

    const after = await state(page);
    expect(after.machine).toBe('SHIFT_ANNOUNCEMENT');
    expect(after.stage).toBe('ANNOUNCING');
    expect(after.announcementVisible).toBe(true);
    expect(after.beltOffset).toBe(before.beltOffset);
    expect(after.active).toBeNull();
    expect(await eventTypes(page)).toEqual([]);
  });

  test('nothing happens before I\'M READY is pressed', async ({ page }) => {
    await openGame(page);
    await startToAnnouncement(page);
    await clearEvents(page);
    const before = await state(page);

    // Every sorting input, by keyboard and by clicking where the buttons are.
    for (const key of ['ArrowLeft', 'ArrowRight', 'a', 'd']) await page.keyboard.press(key);
    for (const side of ['LEFT', 'RIGHT']) await clickButton(page, 'Game', side);
    await waitFrames(page, 60);

    const after = await state(page);
    expect(after.machine).toBe('SHIFT_ANNOUNCEMENT');
    expect(after.score).toBe(before.score);
    expect(after.mistakes).toBe(before.mistakes);
    expect(after.resolved).toBe(0);
    expect(after.active).toBeNull();
    expect(after.beltOffset).toBe(before.beltOffset);
    expect(await eventTypes(page)).toEqual([]);
  });

  test('the ready button triggers only one countdown', async ({ page }) => {
    await openGame(page);
    await startToAnnouncement(page);
    await clearEvents(page);
    const point = await buttonPoint(page, 'Game', "I'M READY");
    if (!point) throw new Error('no ready button');
    await page.mouse.click(point.x, point.y);
    await page.mouse.click(point.x, point.y);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Space');
    await waitForMachine(page, 'PLAYING');
    const types = await eventTypes(page);
    expect(types.filter((t) => t === 'COUNTDOWN_STARTED')).toHaveLength(1);
    expect(types.filter((t) => t === 'COUNTDOWN_TICK')).toHaveLength(3);
    expect(types.filter((t) => t === 'SHIFT_STARTED')).toHaveLength(1);
  });

  test('the countdown shows 3, 2, 1 in order and refuses sorting', async ({ page }) => {
    await openGame(page);
    await startToAnnouncement(page);
    await clearEvents(page);
    await page.keyboard.press('Enter');
    await waitForMachine(page, 'COUNTDOWN');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowRight');
    await waitForMachine(page, 'PLAYING');
    const ticks = (await events(page)).filter((e) => e.type === 'COUNTDOWN_TICK');
    expect(ticks.map((e) => e.value)).toEqual([3, 2, 1]);
    expect(ticks.map((e) => e.displayed)).toEqual([3, 2, 1]);
    const s = await state(page);
    expect(s.score).toBe(0);
    expect(s.mistakes).toBe(0);
    expect(s.countdownShown).toBeNull();
  });

  test('the conveyor stays stopped until the countdown ends, then resumes', async ({ page }) => {
    await openGame(page);
    await startToAnnouncement(page);
    const atCard = await state(page);
    expect(atCard.beltSpeedFactor).toBe(0);

    await page.keyboard.press('Enter');
    await expect.poll(() => state(page).then((s) => s.countdownValue), { intervals: [20] }).toBe(2);
    const counting = await state(page);
    expect(counting.beltSpeedFactor).toBe(0);
    expect(counting.beltOffset).toBe(atCard.beltOffset);

    await waitForMachine(page, 'PLAYING');
    await expect.poll(() => state(page).then((s) => s.beltSpeedFactor)).toBeGreaterThan(0.5);
    expect((await state(page)).beltOffset).not.toBe(atCard.beltOffset);
    const parcel = await waitForParcel(page);
    await expect.poll(() => state(page).then((s) => s.active?.progress ?? 0)).toBeGreaterThan(parcel.active?.progress ?? 0);
  });

  test('sorting rules change correctly between shifts', async ({ page }) => {
    await openGame(page);
    await startToAnnouncement(page);
    const first = await state(page);
    await playToAnnouncementOf(page, 2);
    const second = await state(page);
    expect(second.ruleId).not.toBe(first.ruleId);
    expect(second.mode).toBe('SHAPE');
    expect(second.left).toEqual(['CIRCLE']);
    expect(second.right).toEqual(['SQUARE']);
    expect(second.ruleTitle).toBe('SORT BY SHAPE');
    expect(second.announcementTitle).toContain('SHIFT 02');
    expect(second.briefing?.change).toContain('Shape only');

    const s = await confirmAndWaitForParcel(page);
    expect(s.active?.expected).toBe(s.active?.attributes.shape === 'CIRCLE' ? 'LEFT' : 'RIGHT');
  });

  test('sorting rules stay visible during gameplay', async ({ page }) => {
    await openGame(page);
    await startToAnnouncement(page);
    await confirmAndWaitForParcel(page);
    const s = await state(page);
    expect(s.announcementVisible).toBe(false);
    expect(s.ruleRowsVisible).toBe(true);
    expect(s.ruleTitle).toBe('SORT BY COLOR');
  });

  test('a returning mode shows the concise card, still needing confirmation', async ({ page }) => {
    await openGame(page, { startShift: 5 });
    await startToAnnouncement(page);
    const s = await state(page);
    expect(s.briefing?.firstTime).toBe(false);
    expect(s.machine).toBe('SHIFT_ANNOUNCEMENT');
  });
});

test.describe('progression and endings', () => {
  test('golden parcels appear when progression allows', async ({ page }) => {
    await openGame(page, { startShift: 3, seed: 77 });
    await startToAnnouncement(page);
    await startBot(page);
    await expect.poll(() => state(page).then((s) => s.goldenSeen), { timeout: 150_000, intervals: [50] }).toBeGreaterThan(0);
    await stopBot(page);
  });

  test('game over appears after three mistakes, and restart is fresh', async ({ page }) => {
    await openGame(page);
    await startToAnnouncement(page);
    let s = await confirmAndWaitForParcel(page);
    await page.keyboard.press(s.active?.expected === 'LEFT' ? 'ArrowLeft' : 'ArrowRight');
    await expect.poll(() => state(page).then((x) => x.score)).toBe(10);

    for (let mistakes = 1; mistakes <= 3; mistakes += 1) {
      s = await waitForParcel(page);
      await page.keyboard.press(s.active?.expected === 'LEFT' ? 'ArrowRight' : 'ArrowLeft');
      await expect.poll(() => state(page).then((x) => x.mistakes)).toBe(mistakes);
    }
    await waitForGameOverScreen(page);

    await page.keyboard.press('Enter');
    await waitForMachine(page, 'SHIFT_ANNOUNCEMENT');
    const fresh = await state(page);
    expect(fresh).toMatchObject({ score: 0, mistakes: 0, streak: 0, resolved: 0, shift: 1, correctInShift: 0, active: null, countdownValue: null });
    expect(fresh.stage).toBe('ANNOUNCING');
  });

  test('restarting from a countdown resets all transition state', async ({ page }) => {
    await openGame(page);
    await startToAnnouncement(page);
    await page.keyboard.press('Enter');
    await waitForMachine(page, 'COUNTDOWN');
    await page.keyboard.press('Escape');
    await waitForPauseScreen(page);
    await clearEvents(page);
    await page.keyboard.press('r');
    await waitForMachine(page, 'SHIFT_ANNOUNCEMENT');
    const s = await state(page);
    expect(s).toMatchObject({ stage: 'ANNOUNCING', countdownValue: null, countdownShown: null, announcementVisible: true });
    expect(await eventTypes(page)).toEqual(['SHIFT_ANNOUNCED']);
  });
});

test.describe('layouts', () => {
  test('resizing keeps the announcement and its state', async ({ page }) => {
    await openGame(page);
    await startToAnnouncement(page);
    await page.setViewportSize(PORTRAIT);
    await expect.poll(() => state(page).then((s) => s.size.height)).toBe(1280);
    let s = await state(page);
    expect(s).toMatchObject({ machine: 'SHIFT_ANNOUNCEMENT', stage: 'ANNOUNCING', announcementVisible: true });

    await page.setViewportSize(LANDSCAPE);
    await expect.poll(() => state(page).then((x) => x.size.width)).toBe(1280);
    s = await state(page);
    expect(s.announcementVisible).toBe(true);
  });

  for (const [name, viewport] of [['landscape', LANDSCAPE], ['portrait', PORTRAIT], ['small phone', { width: 360, height: 640 }], ['tablet', { width: 820, height: 1180 }]] as const) {
    test(`${name} stays playable`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await openGame(page);
      await startToAnnouncement(page);

      for (const button of ["I'M READY", 'pause', 'mute', 'LEFT', 'RIGHT']) {
        const point = await buttonPoint(page, 'Game', button);
        expect(point, button).not.toBeNull();
        expect(point?.x ?? -1, button).toBeGreaterThan(0);
        expect(point?.x ?? 1e9, button).toBeLessThan(viewport.width);
        expect(point?.y ?? -1, button).toBeGreaterThan(0);
        expect(point?.y ?? 1e9, button).toBeLessThan(viewport.height);
      }

      await clickButton(page, 'Game', "I'M READY");
      const s = await waitForParcel(page);
      expect(s.ruleRowsVisible).toBe(true);
      await clickButton(page, 'Game', s.active?.expected ?? 'LEFT');
      await expect.poll(() => state(page).then((x) => x.score)).toBe(10);
    });
  }
});

test.describe('audio', () => {
  test('audio starts only after a gesture, and only once', async ({ page }) => {
    await openGame(page);
    expect((await state(page)).audio.contextState).toBe('none');
    await startToAnnouncement(page);
    await expect.poll(() => state(page).then((s) => s.audio.contextState)).toBe('running');
    await confirmAndWaitForParcel(page);
    const s = await state(page);
    expect(s.audio.contextsCreated).toBe(1);
    expect(s.audio.played).toMatchObject({ ready: 1, tick: 3, go: 1 });
  });

  test('mute and unmute work from gameplay', async ({ page }) => {
    await openGame(page);
    await startToAnnouncement(page);
    expect((await state(page)).muted).toBe(false);
    await clickButton(page, 'Game', 'mute');
    await expect.poll(() => state(page).then((s) => s.muted)).toBe(true);

    const before = (await state(page)).audio;
    await confirmAndWaitForParcel(page);
    const muted = (await state(page)).audio;
    expect(muted.droppedMuted).toBeGreaterThan(before.droppedMuted);
    expect(muted.played.tick ?? 0).toBe(before.played.tick ?? 0);

    await page.keyboard.press('n');
    await expect.poll(() => state(page).then((s) => s.muted)).toBe(false);
  });

  test('mute works from the menu and persists after refresh', async ({ page }) => {
    await openGame(page);
    await clickButton(page, 'Menu', 'mute');
    await expect.poll(() => state(page).then((s) => s.muted)).toBe(true);

    await page.reload();
    await expect.poll(() => page.evaluate(() => window.__SORT_SHIFT_E2E__ !== undefined)).toBe(true);
    await expect.poll(() => state(page).then((s) => s.muted)).toBe(true);

    await expect.poll(() => buttonPoint(page, 'Menu', 'mute')).not.toBeNull();
    await clickButton(page, 'Menu', 'mute');
    await expect.poll(() => state(page).then((s) => s.muted)).toBe(false);
    await page.reload();
    await expect.poll(() => page.evaluate(() => window.__SORT_SHIFT_E2E__ !== undefined)).toBe(true);
    await expect.poll(() => state(page).then((s) => s.muted)).toBe(false);
  });

  test('gameplay is fully usable while muted', async ({ page }) => {
    await openGame(page);
    await page.keyboard.press('n');
    await expect.poll(() => state(page).then((s) => s.muted)).toBe(true);
    await startToAnnouncement(page);
    const s = await confirmAndWaitForParcel(page);
    await page.keyboard.press(s.active?.expected === 'LEFT' ? 'ArrowLeft' : 'ArrowRight');
    await expect.poll(() => state(page).then((x) => x.score)).toBe(10);
    expect((await state(page)).audio.activeNodes).toBe(0);
  });
});
