import type { BinSide, ParcelAttributes, ParcelColor, ParcelShape } from '../../types/game';
import { parcelTextureKey } from '../data/parcelCatalog';
import type { Orientation } from '../ui/layout';

/**
 * Every Blender-rendered image the game uses. Paths are relative so the build
 * also works when hosted from a sub-folder. See blender/README.md to regenerate.
 */
export interface ImageAsset {
  readonly key: string;
  readonly path: string;
  readonly width: number;
  readonly height: number;
}

const ROOT = 'assets/images/blender';

export const TEXTURE_KEYS = {
  PARCEL_BLUE_SQUARE: 'PARCEL_BLUE_SQUARE',
  PARCEL_BLUE_CIRCLE: 'PARCEL_BLUE_CIRCLE',
  PARCEL_RED_SQUARE: 'PARCEL_RED_SQUARE',
  PARCEL_RED_CIRCLE: 'PARCEL_RED_CIRCLE',
  PARCEL_YELLOW_SQUARE: 'PARCEL_YELLOW_SQUARE',
  PARCEL_YELLOW_CIRCLE: 'PARCEL_YELLOW_CIRCLE',
  PARCEL_GREEN_SQUARE: 'PARCEL_GREEN_SQUARE',
  PARCEL_GREEN_CIRCLE: 'PARCEL_GREEN_CIRCLE',
  PARCEL_GOLDEN_BONUS: 'PARCEL_GOLDEN_BONUS',
  CONVEYOR_BELT_TILE: 'CONVEYOR_BELT_TILE',
  CONVEYOR_RAIL: 'CONVEYOR_RAIL',
  CONVEYOR_ROLLER: 'CONVEYOR_ROLLER',
  SORTING_BIN_LEFT: 'SORTING_BIN_LEFT',
  SORTING_BIN_RIGHT: 'SORTING_BIN_RIGHT',
  FACTORY_LANDSCAPE: 'FACTORY_LANDSCAPE',
  FACTORY_PORTRAIT: 'FACTORY_PORTRAIT',
} as const;

function asset(key: string, file: string, width: number, height: number): ImageAsset {
  return { key, path: `${ROOT}/${file}.webp`, width, height };
}

const COLORS: readonly ParcelColor[] = ['BLUE', 'RED', 'YELLOW', 'GREEN'];
const SHAPES: readonly ParcelShape[] = ['SQUARE', 'CIRCLE'];

export function parcelAssetKey(color: ParcelColor, shape: ParcelShape): string {
  return `PARCEL_${color}_${shape}`;
}

export const PARCEL_ASSETS: readonly ImageAsset[] = COLORS.flatMap((color) =>
  SHAPES.map((shape) => asset(parcelAssetKey(color, shape), `parcels/${color.toLowerCase()}_${shape.toLowerCase()}`, 256, 256)),
);

export const GOLDEN_ASSET: ImageAsset = asset(TEXTURE_KEYS.PARCEL_GOLDEN_BONUS, 'parcels/golden_bonus', 368, 368);

export const CONVEYOR_ASSETS: readonly ImageAsset[] = [
  asset(TEXTURE_KEYS.CONVEYOR_BELT_TILE, 'conveyor/conveyor_belt_tile', 256, 128),
  asset(TEXTURE_KEYS.CONVEYOR_RAIL, 'conveyor/conveyor_rail', 64, 128),
  asset(TEXTURE_KEYS.CONVEYOR_ROLLER, 'conveyor/conveyor_roller', 96, 96),
];

export const BIN_ASSETS: readonly ImageAsset[] = [
  asset(TEXTURE_KEYS.SORTING_BIN_LEFT, 'bins/sorting_bin_left', 420, 420),
  asset(TEXTURE_KEYS.SORTING_BIN_RIGHT, 'bins/sorting_bin_right', 420, 420),
];

export const BACKGROUND_ASSETS: Readonly<Record<Orientation, ImageAsset>> = {
  landscape: asset(TEXTURE_KEYS.FACTORY_LANDSCAPE, 'backgrounds/factory_landscape', 1280, 720),
  portrait: asset(TEXTURE_KEYS.FACTORY_PORTRAIT, 'backgrounds/factory_portrait', 720, 1280),
};

export function binAssetKey(side: BinSide): string {
  return side === 'LEFT' ? TEXTURE_KEYS.SORTING_BIN_LEFT : TEXTURE_KEYS.SORTING_BIN_RIGHT;
}

/** What to load at boot: everything except the background for the other orientation. */
export function startupAssets(orientation: Orientation): ImageAsset[] {
  return [...PARCEL_ASSETS, GOLDEN_ASSET, ...CONVEYOR_ASSETS, ...BIN_ASSETS, BACKGROUND_ASSETS[orientation]];
}

/** Every asset in the pack, for validation. */
export const ALL_ASSETS: readonly ImageAsset[] = [
  ...PARCEL_ASSETS,
  GOLDEN_ASSET,
  ...CONVEYOR_ASSETS,
  ...BIN_ASSETS,
  BACKGROUND_ASSETS.landscape,
  BACKGROUND_ASSETS.portrait,
];

export interface ResolvedTexture {
  readonly key: string;
  readonly source: 'blender' | 'fallback';
}

/**
 * The texture for a parcel. If its Blender image is missing, the generated
 * placeholder for the same colour and shape is used, never a different variant.
 */
export function resolveParcelTexture(attributes: ParcelAttributes, isLoaded: (key: string) => boolean): ResolvedTexture {
  const key = parcelAssetKey(attributes.color, attributes.shape);
  if (isLoaded(key)) return { key, source: 'blender' };
  return { key: parcelTextureKey(attributes.color, attributes.shape), source: 'fallback' };
}

/**
 * How the rendered images line up with the game. All measurements come from the
 * Blender camera framing in blender/scripts, in that script's world units.
 */
const PARCEL_FRAME_UNITS = 1.36;
const GOLDEN_FRAME_UNITS = 1.96;
/** Size of one world unit (a parcel's width) in parcel-container units. */
const CONTAINER_UNITS_PER_WORLD_UNIT = 116;

export const PARCEL_ART = {
  spriteScale: (PARCEL_FRAME_UNITS * CONTAINER_UNITS_PER_WORLD_UNIT) / 256,
  goldenScale: (GOLDEN_FRAME_UNITS * CONTAINER_UNITS_PER_WORLD_UNIT) / 368,
  /** Centre of the blank label plate on the parcel's top face. */
  labelY: -15.5,
  /** Centre of the colour-symbol badge, above the label plate. */
  symbolY: -47,
  symbolScale: 0.78,
  maxLabelWidth: { SQUARE: 90, CIRCLE: 78 } as Readonly<Record<ParcelShape, number>>,
} as const;

/** Where features sit within the bin image, as fractions of its size. */
export const BIN_ART = {
  bodyWidth: 0.79,
  bodyHeight: 0.826,
  bodyCentreY: 0.488,
  openingCentreY: 0.295,
  labelPanelTop: 0.564,
  labelPanelBottom: 0.902,
} as const;
