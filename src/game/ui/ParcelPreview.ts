import Phaser from 'phaser';
import type { ParcelAttributes, ParcelShape } from '../../types/game';
import { PARCEL_COLORS, parcelTextureKey } from '../data/parcelCatalog';
import { PARCEL_TEXTURE_SIZE } from './textures';
import { textStyle } from './theme';

/** Widest a label may be, in texture pixels, so it stays on the parcel's tape. */
const MAX_LABEL_WIDTH: Readonly<Record<ParcelShape, number>> = { CIRCLE: 92, SQUARE: 106 };

export function createParcelLabel(scene: Phaser.Scene): Phaser.GameObjects.Text {
  return new Phaser.GameObjects.Text(scene, 0, -4, '', textStyle({ font: 'display', size: 22, weight: '900', color: '#050914', letterSpacing: 1 })).setOrigin(0.5);
}

/** Set a parcel's label text and shrink it to fit that parcel's tape band. */
export function applyParcelLabel(label: Phaser.GameObjects.Text, attributes: ParcelAttributes): void {
  const limit = MAX_LABEL_WIDTH[attributes.shape];
  label.setScale(1).setText(PARCEL_COLORS[attributes.color].label);
  if (label.width > limit) label.setScale(limit / label.width);
}

/** A still picture of a parcel, using the same art as the belt. */
export function createParcelPreview(scene: Phaser.Scene, attributes: ParcelAttributes, size: number): Phaser.GameObjects.Container {
  const body = new Phaser.GameObjects.Image(scene, 0, 0, parcelTextureKey(attributes.color, attributes.shape));
  const label = createParcelLabel(scene);
  applyParcelLabel(label, attributes);
  return new Phaser.GameObjects.Container(scene, 0, 0, [body, label]).setScale(size / PARCEL_TEXTURE_SIZE);
}
