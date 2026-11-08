import type { ParcelColor, ParcelShape } from '../../types/game';

/** Visual + textual definition of a parcel colour. */
export interface ParcelColorDefinition {
  readonly id: ParcelColor;
  readonly label: string;
  /** Main body colour. */
  readonly fill: number;
  /** Darker side / shadow tone. */
  readonly shade: number;
  /** Bevel highlight tone. */
  readonly highlight: number;
  /** Packing tape tone. */
  readonly tape: number;
  /** CSS colour for text labels. */
  readonly css: string;
  /** Texture key of the square parcel generated at boot. */
  readonly textureKey: string;
}

export const PARCEL_COLORS: Readonly<Record<ParcelColor, ParcelColorDefinition>> = {
  BLUE: {
    id: 'BLUE',
    label: 'BLUE',
    fill: 0x2f7dff,
    shade: 0x1846a8,
    highlight: 0x8cc4ff,
    tape: 0xcfe6ff,
    css: '#5aa2ff',
    textureKey: 'parcel-blue',
  },
  RED: {
    id: 'RED',
    label: 'RED',
    fill: 0xff3a56,
    shade: 0xa3142e,
    highlight: 0xff9eac,
    tape: 0xffd8de,
    css: '#ff5a72',
    textureKey: 'parcel-red',
  },
  YELLOW: {
    id: 'YELLOW',
    label: 'YELLOW',
    fill: 0xffcf2e,
    shade: 0xa87a08,
    highlight: 0xffeda0,
    tape: 0xfff6cf,
    css: '#ffd84d',
    textureKey: 'parcel-yellow',
  },
  GREEN: {
    id: 'GREEN',
    label: 'GREEN',
    fill: 0x27c76b,
    shade: 0x0f7a3d,
    highlight: 0x96f0bb,
    tape: 0xd2f7e1,
    css: '#4fe08f',
    textureKey: 'parcel-green',
  },
};

export interface ParcelShapeDefinition {
  readonly id: ParcelShape;
  readonly label: string;
}

export const PARCEL_SHAPES: Readonly<Record<ParcelShape, ParcelShapeDefinition>> = {
  CIRCLE: { id: 'CIRCLE', label: 'CIRCLE' },
  SQUARE: { id: 'SQUARE', label: 'SQUARE' },
};

/** Colours used by a fixed-rule session unless it says otherwise, in a stable order. */
export const SPAWNABLE_COLORS: readonly ParcelColor[] = ['BLUE', 'RED'];

/** Every supported colour, in a stable order. */
export const ALL_COLORS: readonly ParcelColor[] = ['BLUE', 'RED', 'YELLOW', 'GREEN'];

/** Every supported shape, in a stable order. */
export const ALL_SHAPES: readonly ParcelShape[] = ['CIRCLE', 'SQUARE'];

/** Texture key of the parcel with the given attributes. */
export function parcelTextureKey(color: ParcelColor, shape: ParcelShape): string {
  const base = PARCEL_COLORS[color].textureKey;
  return shape === 'SQUARE' ? base : `${base}-circle`;
}
