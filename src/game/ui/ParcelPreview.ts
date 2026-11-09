import Phaser from 'phaser';
import type { ParcelAttributes, ParcelShape } from '../../types/game';
import { PARCEL_ART, resolveParcelTexture } from '../assets/assetManifest';
import { PARCEL_COLORS } from '../data/parcelCatalog';
import { PARCEL_TEXTURE_SIZE, symbolTextureKey } from './textures';
import { textStyle } from './theme';

/** Widest a label may be on a generated fallback parcel, in texture pixels. */
const FALLBACK_LABEL_WIDTH: Readonly<Record<ParcelShape, number>> = { CIRCLE: 92, SQUARE: 106 };

export interface ParcelParts {
  readonly body: Phaser.GameObjects.Image;
  readonly label: Phaser.GameObjects.Text;
  readonly symbol: Phaser.GameObjects.Image;
}

export function createParcelParts(scene: Phaser.Scene): ParcelParts {
  return {
    body: new Phaser.GameObjects.Image(scene, 0, 0, '__WHITE'),
    label: new Phaser.GameObjects.Text(scene, 0, 0, '', textStyle({ font: 'display', size: 20, weight: '900', color: '#050914', letterSpacing: 1 })).setOrigin(0.5),
    symbol: new Phaser.GameObjects.Image(scene, 0, PARCEL_ART.symbolY, symbolTextureKey('BLUE')).setScale(PARCEL_ART.symbolScale),
  };
}

/**
 * Show a parcel with the art for its colour and shape. Text and the colour
 * symbol are always drawn live, so sorting information is never baked into art.
 * Returns true when rendered art was used.
 */
export function dressParcel(scene: Phaser.Scene, parts: ParcelParts, attributes: ParcelAttributes): boolean {
  const resolved = resolveParcelTexture(attributes, (key) => scene.textures.exists(key));
  const rendered = resolved.source === 'blender';
  const { body, label, symbol } = parts;

  body.setTexture(resolved.key).setScale(rendered ? PARCEL_ART.spriteScale : 1).clearTint();
  // The generated fallback already has its symbol drawn in.
  symbol.setVisible(rendered).setTexture(symbolTextureKey(attributes.color));

  const limit = (rendered ? PARCEL_ART.maxLabelWidth : FALLBACK_LABEL_WIDTH)[attributes.shape];
  label.setScale(1).setY(rendered ? PARCEL_ART.labelY : -4).setText(PARCEL_COLORS[attributes.color].label);
  if (label.width > limit) label.setScale(limit / label.width);
  return rendered;
}

/** A still picture of a parcel, using the same art as the belt. */
export function createParcelPreview(scene: Phaser.Scene, attributes: ParcelAttributes, size: number): Phaser.GameObjects.Container {
  const parts = createParcelParts(scene);
  dressParcel(scene, parts, attributes);
  return new Phaser.GameObjects.Container(scene, 0, 0, [parts.body, parts.symbol, parts.label]).setScale(size / PARCEL_TEXTURE_SIZE);
}
