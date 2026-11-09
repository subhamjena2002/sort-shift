import { ALL_ASSETS, BACKGROUND_ASSETS, parcelAssetKey, startupAssets } from '../src/game/assets/assetManifest';
import type { ParcelColor, ParcelShape } from '../src/types/game';
import { expect, openGame, startBot, startToAnnouncement, state, stopBot, test, waitForGameOverScreen, waitForMachine, waitForParcel } from './helpers';

test.describe('rendered art', () => {
  test('all startup art loads, without the other orientation', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/assets/images/blender/')) requests.push(request.url());
    });
    await openGame(page);
    const s = await state(page);
    expect([...s.loadedArt].sort()).toEqual(startupAssets('landscape').map((a) => a.key).sort());
    expect(requests.some((url) => url.includes('factory_portrait'))).toBe(false);
    expect(requests.every((url) => url.startsWith('http://localhost'))).toBe(true);
  });

  test('parcels use the art for their exact colour and shape, across a whole shift', async ({ page }) => {
    await openGame(page, { startShift: 5, seed: 8 });
    await startToAnnouncement(page);
    await page.keyboard.press('Enter');
    for (let i = 0; i < 8; i += 1) {
      const s = await waitForParcel(page);
      const { color, shape } = s.active?.attributes as { color: ParcelColor; shape: ParcelShape };
      expect(s.activeTexture).toBe(parcelAssetKey(color, shape));
      await page.keyboard.press(s.active?.expected === 'LEFT' ? 'ArrowLeft' : 'ArrowRight');
      await expect.poll(() => state(page).then((x) => x.active?.id ?? -1), { intervals: [25] }).not.toBe(s.active?.id);
    }
  });

  test('bins and background use rendered art', async ({ page }) => {
    await openGame(page);
    await startToAnnouncement(page);
    const s = await state(page);
    expect(s.binTextures).toEqual({ LEFT: 'SORTING_BIN_LEFT', RIGHT: 'SORTING_BIN_RIGHT' });
    expect(s.backgroundTexture).toBe('FACTORY_LANDSCAPE');
  });

  test('a golden parcel keeps its real art and gains the gold carrier', async ({ page }) => {
    await openGame(page, { startShift: 3, seed: 77 });
    await startToAnnouncement(page);
    await page.keyboard.press('Enter');
    await expect
      .poll(
        async () => {
          const s = await state(page);
          if (s.active?.kind === 'GOLDEN') return true;
          if (s.active) await page.keyboard.press(s.active.expected === 'LEFT' ? 'ArrowLeft' : 'ArrowRight');
          return false;
        },
        { timeout: 120_000, intervals: [60] },
      )
      .toBe(true);
    const s = await state(page);
    const { color, shape } = s.active?.attributes as { color: ParcelColor; shape: ParcelShape };
    expect(s.activeTexture).toBe(parcelAssetKey(color, shape));
    expect(s.activeCarrierVisible).toBe(true);
  });

  test('the portrait background is fetched only when needed, then used', async ({ page }) => {
    await openGame(page);
    await startToAnnouncement(page);
    expect((await state(page)).loadedArt).not.toContain(BACKGROUND_ASSETS.portrait.key);
    await page.setViewportSize({ width: 412, height: 800 });
    await expect.poll(() => state(page).then((s) => s.backgroundTexture)).toBe(BACKGROUND_ASSETS.portrait.key);
    expect((await state(page)).machine).toBe('SHIFT_ANNOUNCEMENT');
  });

  test('restarts reuse the same textures', async ({ page }) => {
    const textureIdentity = (): Promise<string[]> =>
      page.evaluate(() => {
        const w = window as unknown as {
          __SORT_SHIFT_DEBUG__: { game: { textures: { getTextureKeys(): string[]; get(k: string): { source: unknown[] } } } };
          __seen?: Map<string, unknown>;
          __ids?: Map<unknown, number>;
        };
        const textures = w.__SORT_SHIFT_DEBUG__.game.textures;
        w.__ids ??= new Map();
        const ids = w.__ids;
        return textures
          .getTextureKeys()
          .filter((key) => /^(PARCEL|CONVEYOR|SORTING|FACTORY)_/.test(key))
          .sort()
          .map((key) => {
            const source = textures.get(key).source[0];
            if (!ids.has(source)) ids.set(source, ids.size);
            return `${key}:${ids.get(source)}`;
          });
      });

    await openGame(page, { seed: 3 });
    await startToAnnouncement(page);
    const first = await textureIdentity();
    for (let run = 0; run < 3; run += 1) {
      await startBot(page, { accuracy: 0, thinkAt: 0.02 });
      await waitForGameOverScreen(page);
      await stopBot(page);
      await page.keyboard.press('Enter');
      await waitForMachine(page, 'SHIFT_ANNOUNCEMENT');
    }
    expect(await textureIdentity()).toEqual(first);
    expect(first).toHaveLength(startupAssets('landscape').length);
  });

  test('every manifest file is served', async ({ request }) => {
    for (const asset of ALL_ASSETS) {
      const response = await request.get(`/${asset.path}`);
      expect(response.status(), asset.path).toBe(200);
      expect(response.headers()['content-type'], asset.path).toContain('webp');
    }
  });
});

test.describe('missing art', () => {
  test.use({ allowFailedRequests: true });

  test('a missing parcel image falls back to the same variant, never another', async ({ page }) => {
    await page.route('**/parcels/blue_square.webp', (route) => route.fulfill({ status: 404, body: '' }));
    await openGame(page, { seed: 11 });
    await startToAnnouncement(page);
    await page.keyboard.press('Enter');
    const seen = new Map<string, string | null>();
    for (let i = 0; i < 12 && seen.size < 2; i += 1) {
      const s = await waitForParcel(page);
      seen.set(s.active?.attributes.color ?? '', s.activeTexture);
      await page.keyboard.press(s.active?.expected === 'LEFT' ? 'ArrowLeft' : 'ArrowRight');
      await expect.poll(() => state(page).then((x) => x.active?.id ?? -1), { intervals: [25] }).not.toBe(s.active?.id);
    }
    expect(seen.get('BLUE')).toBe('parcel-blue');
    expect(seen.get('RED')).toBe('PARCEL_RED_SQUARE');
    expect((await state(page)).machine).toBe('PLAYING');
  });

  test('a missing bin and background fall back to the drawn versions', async ({ page }) => {
    await page.route('**/bins/sorting_bin_left.webp', (route) => route.fulfill({ status: 404, body: '' }));
    await page.route('**/backgrounds/factory_landscape.webp', (route) => route.fulfill({ status: 404, body: '' }));
    await openGame(page);
    await startToAnnouncement(page);
    const s = await state(page);
    expect(s.backgroundTexture).toBeNull();
    expect(s.binTextures.RIGHT).toBe('SORTING_BIN_RIGHT');
    expect(s.binTextures.LEFT).not.toBe('SORTING_BIN_LEFT');
    await page.keyboard.press('Enter');
    await waitForParcel(page);
  });
});
