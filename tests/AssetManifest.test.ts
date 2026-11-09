import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ALL_ASSETS,
  BACKGROUND_ASSETS,
  BIN_ASSETS,
  binAssetKey,
  CONVEYOR_ASSETS,
  GOLDEN_ASSET,
  PARCEL_ASSETS,
  parcelAssetKey,
  resolveParcelTexture,
  startupAssets,
  TEXTURE_KEYS,
} from '../src/game/assets/assetManifest';
import { ALL_COLORS, ALL_SHAPES, parcelTextureKey } from '../src/game/data/parcelCatalog';

const publicFile = (path: string): string => resolve(__dirname, '..', 'public', path);

/** Reads the pixel size from a WebP header (VP8, VP8L or VP8X). */
function webpSize(file: string): { width: number; height: number } {
  const b = readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') throw new Error(`${file} is not a WebP`);
  const format = b.toString('ascii', 12, 16);
  if (format === 'VP8X') return { width: b.readUIntLE(24, 3) + 1, height: b.readUIntLE(27, 3) + 1 };
  if (format === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (format === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  throw new Error(`Unknown WebP format ${format}`);
}

describe('parcel texture mapping', () => {
  const combinations = ALL_COLORS.flatMap((color) => ALL_SHAPES.map((shape) => [color, shape] as const));

  it.each(combinations)('%s %s maps to its own key and file', (color, shape) => {
    const key = parcelAssetKey(color, shape);
    expect(key).toBe(`PARCEL_${color}_${shape}`);
    const asset = PARCEL_ASSETS.find((a) => a.key === key);
    expect(asset?.path).toContain(`${color.toLowerCase()}_${shape.toLowerCase()}`);
  });

  it('has exactly eight distinct parcels', () => {
    expect(new Set(PARCEL_ASSETS.map((a) => a.key)).size).toBe(8);
    expect(new Set(PARCEL_ASSETS.map((a) => a.path)).size).toBe(8);
  });

  it('keeps colour and shape independent', () => {
    expect(parcelAssetKey('RED', 'CIRCLE')).not.toBe(parcelAssetKey('RED', 'SQUARE'));
    expect(parcelAssetKey('RED', 'CIRCLE')).not.toBe(parcelAssetKey('BLUE', 'CIRCLE'));
  });

  it('gives the golden carrier its own key', () => {
    expect(GOLDEN_ASSET.key).toBe(TEXTURE_KEYS.PARCEL_GOLDEN_BONUS);
    expect(PARCEL_ASSETS.map((a) => a.key)).not.toContain(GOLDEN_ASSET.key);
  });
});

describe('missing texture handling', () => {
  const combinations = ALL_COLORS.flatMap((color) => ALL_SHAPES.map((shape) => ({ color, shape })));

  it('uses rendered art when it is loaded', () => {
    expect(resolveParcelTexture({ color: 'GREEN', shape: 'CIRCLE' }, () => true)).toEqual({ key: 'PARCEL_GREEN_CIRCLE', source: 'blender' });
  });

  it.each(combinations)('falls back to the same variant for $color $shape', (attributes) => {
    const resolved = resolveParcelTexture(attributes, () => false);
    expect(resolved).toEqual({ key: parcelTextureKey(attributes.color, attributes.shape), source: 'fallback' });
  });

  it('never borrows another variant, even when all others are loaded', () => {
    const resolved = resolveParcelTexture({ color: 'BLUE', shape: 'CIRCLE' }, (key) => key !== 'PARCEL_BLUE_CIRCLE');
    expect(resolved.source).toBe('fallback');
    expect(resolved.key).toBe(parcelTextureKey('BLUE', 'CIRCLE'));
  });
});

describe('bin and background selection', () => {
  it('maps each side to its bin', () => {
    expect(binAssetKey('LEFT')).toBe('SORTING_BIN_LEFT');
    expect(binAssetKey('RIGHT')).toBe('SORTING_BIN_RIGHT');
    expect(BIN_ASSETS.map((a) => a.key)).toEqual(['SORTING_BIN_LEFT', 'SORTING_BIN_RIGHT']);
  });

  it('has a purpose-made background for each orientation', () => {
    expect(BACKGROUND_ASSETS.landscape).toMatchObject({ key: 'FACTORY_LANDSCAPE', width: 1280, height: 720 });
    expect(BACKGROUND_ASSETS.portrait).toMatchObject({ key: 'FACTORY_PORTRAIT', width: 720, height: 1280 });
  });

  it('loads only the current orientation at startup', () => {
    const landscape = startupAssets('landscape').map((a) => a.key);
    const portrait = startupAssets('portrait').map((a) => a.key);
    expect(landscape).toContain('FACTORY_LANDSCAPE');
    expect(landscape).not.toContain('FACTORY_PORTRAIT');
    expect(portrait).toContain('FACTORY_PORTRAIT');
    expect(portrait).not.toContain('FACTORY_LANDSCAPE');
  });
});

describe('asset manifest correctness', () => {
  it('lists every texture key exactly once', () => {
    const keys = ALL_ASSETS.map((a) => a.key).sort();
    expect(keys).toEqual(Object.values(TEXTURE_KEYS).sort());
  });

  it('uses only relative local paths', () => {
    for (const asset of ALL_ASSETS) {
      expect(asset.path).toMatch(/^assets\/images\/blender\/[a-z]+\/[a-z_]+\.webp$/);
    }
  });

  it.each(ALL_ASSETS.map((a) => [a.path, a] as const))('%s exists with the declared size', (path, asset) => {
    const file = publicFile(path);
    expect(existsSync(file)).toBe(true);
    expect(webpSize(file)).toEqual({ width: asset.width, height: asset.height });
  });

  it('keeps the whole pack within the 2 MB budget', () => {
    const total = ALL_ASSETS.reduce((sum, asset) => sum + statSync(publicFile(asset.path)).size, 0);
    expect(total).toBeLessThan(2 * 1024 * 1024);
  });

  it('has the three conveyor parts', () => {
    expect(CONVEYOR_ASSETS.map((a) => a.key)).toEqual(['CONVEYOR_BELT_TILE', 'CONVEYOR_RAIL', 'CONVEYOR_ROLLER']);
  });

  it('keeps tile art at repeat-friendly power-of-two sizes', () => {
    for (const asset of CONVEYOR_ASSETS.slice(0, 2)) {
      expect(Math.log2(asset.width) % 1).toBe(0);
      expect(Math.log2(asset.height) % 1).toBe(0);
    }
  });
});
