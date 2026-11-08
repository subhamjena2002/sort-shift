import type { ParcelColor } from '../../types/game';

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
  /** Texture key generated at boot. */
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
};

/** Colours that can currently be spawned, in a stable order. */
export const SPAWNABLE_COLORS: readonly ParcelColor[] = ['BLUE', 'RED'];
