import { expect, test as base, type Page } from '@playwright/test';
import type { BotOptions, LoggedEvent } from '../src/game/e2e/bridge';

export interface GameState {
  machine: string;
  size: { width: number; height: number };
  phase: string | null;
  stage: string | null;
  countdownValue: number | null;
  briefing: { label: string; mode: string; change: string; firstTime: boolean } | null;
  shift: number | null;
  mode: string | null;
  correctInShift: number;
  ruleId: string | null;
  left: string[];
  right: string[];
  score: number;
  mistakes: number;
  streak: number;
  resolved: number;
  active: { id: number; kind: string; progress: number; attributes: { color: string; shape: string }; expected: 'LEFT' | 'RIGHT' } | null;
  goldenSeen: number;
  activeTexture: string | null;
  activeCarrierVisible: boolean;
  backgroundTexture: string | null;
  binTextures: { LEFT: string | null; RIGHT: string | null };
  loadedArt: string[];
  announcementVisible: boolean;
  announcementTitle: string | null;
  readyArmed: boolean;
  countdownShown: number | null;
  beltOffset: number | null;
  beltSpeedFactor: number;
  ruleTitle: string | null;
  ruleRowsVisible: boolean;
  muted: boolean;
  audio: { contextState: string; contextsCreated: number; activeNodes: number; activeInstances: number; played: Record<string, number>; droppedMuted: number };
}

/** Fails any test in which the page throws or logs an error. */
export const test = base.extend<{ allowFailedRequests: boolean; pageErrors: string[] }>({
  // Set for tests that deliberately make a file fail to load.
  allowFailedRequests: [false, { option: true }],
  pageErrors: [
    async ({ page, allowFailedRequests }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
      page.on('console', (message) => {
        const failedRequest = message.text().startsWith('Failed to load resource');
        if (message.type() === 'error' && !(allowFailedRequests && failedRequest)) errors.push(`console: ${message.text()}`);
      });
      await use(errors);
      expect(errors, 'uncaught browser errors').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

export async function openGame(page: Page, options: { seed?: number; startShift?: number } = {}): Promise<void> {
  const params = new URLSearchParams({ seed: String(options.seed ?? 1234) });
  if (options.startShift !== undefined) params.set('startShift', String(options.startShift));
  await page.goto(`/?${params.toString()}`);
  await expect.poll(() => page.evaluate(() => window.__SORT_SHIFT_E2E__ !== undefined)).toBe(true);
  await expect.poll(() => state(page).then((s) => s.machine)).toBe('MENU');
  // Buttons exist once the menu scene has created them.
  await expect.poll(() => buttonPoint(page, 'Menu', 'PLAY')).not.toBeNull();
}

export function state(page: Page): Promise<GameState> {
  return page.evaluate(() => window.__SORT_SHIFT_E2E__?.state() as unknown as GameState);
}

export function events(page: Page): Promise<readonly LoggedEvent[]> {
  return page.evaluate(() => window.__SORT_SHIFT_E2E__?.events() ?? []);
}

export function eventTypes(page: Page): Promise<string[]> {
  return events(page).then((list) => list.map((e) => e.type));
}

export function clearEvents(page: Page): Promise<void> {
  return page.evaluate(() => window.__SORT_SHIFT_E2E__?.clearEvents());
}

export function buttonPoint(page: Page, scene: 'Menu' | 'Game' | 'Pause' | 'GameOver', name: string): Promise<{ x: number; y: number } | null> {
  return page.evaluate(([s, n]) => window.__SORT_SHIFT_E2E__?.buttonPoint(s as never, n as string) ?? null, [scene, name] as const);
}

export async function clickButton(page: Page, scene: 'Menu' | 'Game' | 'Pause' | 'GameOver', name: string): Promise<void> {
  await expect.poll(() => buttonPoint(page, scene, name)).not.toBeNull();
  const point = await buttonPoint(page, scene, name);
  if (!point) throw new Error(`Button ${name} not found`);
  await page.mouse.click(point.x, point.y);
}

/** Wait until the game has rendered `count` more frames. Never a wall-clock sleep. */
export async function waitFrames(page: Page, count: number): Promise<void> {
  const start = await page.evaluate(() => window.__SORT_SHIFT_E2E__?.frame() ?? 0);
  await expect.poll(() => page.evaluate(() => window.__SORT_SHIFT_E2E__?.frame() ?? 0), { timeout: 120_000, intervals: [50] }).toBeGreaterThanOrEqual(start + count);
}

export async function waitForMachine(page: Page, machine: string): Promise<void> {
  await expect.poll(() => state(page).then((s) => s.machine), { intervals: [25] }).toBe(machine);
}

/** Paused, with the pause screen built and its keys bound. */
export async function waitForPauseScreen(page: Page): Promise<void> {
  await waitForMachine(page, 'PAUSED');
  await expect.poll(() => buttonPoint(page, 'Pause', 'RESUME'), { intervals: [25] }).not.toBeNull();
}

/** Game over, with its screen built and its keys bound. */
export async function waitForGameOverScreen(page: Page): Promise<void> {
  await waitForMachine(page, 'GAME_OVER');
  await expect.poll(() => buttonPoint(page, 'GameOver', 'RESTART'), { intervals: [25] }).not.toBeNull();
}

/** From the menu, to a shift announcement that is ready to be confirmed. */
export async function startToAnnouncement(page: Page): Promise<void> {
  await page.keyboard.press('Enter');
  await waitForMachine(page, 'SHIFT_ANNOUNCEMENT');
  await expect.poll(() => state(page).then((s) => s.readyArmed), { intervals: [25] }).toBe(true);
}

export async function confirmAndWaitForParcel(page: Page): Promise<GameState> {
  await page.keyboard.press('Enter');
  return waitForParcel(page);
}

export async function waitForParcel(page: Page): Promise<GameState> {
  await expect.poll(() => state(page).then((s) => s.active !== null), { timeout: 30_000, intervals: [25] }).toBe(true);
  return state(page);
}

export function startBot(page: Page, options: BotOptions = {}): Promise<void> {
  return page.evaluate((o) => window.__SORT_SHIFT_E2E__?.startBot(o), options);
}

export function stopBot(page: Page): Promise<void> {
  return page.evaluate(() => window.__SORT_SHIFT_E2E__?.endBot());
}

/** Have the bot play until the given shift is on the announcement card. */
export async function playToAnnouncementOf(page: Page, shift: number): Promise<void> {
  await startBot(page, { untilShift: shift });
  await expect
    .poll(() => state(page).then((s) => s.machine === 'SHIFT_ANNOUNCEMENT' && s.shift === shift), { timeout: 170_000, intervals: [50] })
    .toBe(true);
  await stopBot(page);
  await expect.poll(() => state(page).then((s) => s.readyArmed), { intervals: [25] }).toBe(true);
}
