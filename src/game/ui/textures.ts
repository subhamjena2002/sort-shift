import Phaser from 'phaser';
import { ALL_COLORS, ALL_SHAPES, PARCEL_COLORS, parcelTextureKey, type ParcelColorDefinition } from '../data/parcelCatalog';
import { COLORS } from './theme';

/**
 * Procedurally generated placeholder textures. Each is drawn once with an
 * off-screen Graphics object and baked with generateTexture(), so in-game
 * objects are cheap Images rather than per-frame vector redraws.
 * These keys are the swap points for the Blender-rendered sprites later.
 */
export const TEXTURES = {
  parcelShadow: 'parcel-shadow',
  parcelShadowCircle: 'parcel-shadow-circle',
  parcelGlow: 'parcel-glow',
  goldRimSquare: 'gold-rim-square',
  goldRimCircle: 'gold-rim-circle',
  goldRays: 'gold-rays',
  roller: 'roller-gear',
  rollerBar: 'roller-bar',
  beltStreaks: 'belt-streaks',
  railChase: 'rail-chase',
  spark: 'spark',
  glowDot: 'glow-dot',
} as const;

/** Edge length of the generated parcel textures. */
export const PARCEL_TEXTURE_SIZE = 128;
const BELT_TILE_HEIGHT = 48;

export function beltTileKey(width: number): string {
  return `belt-tile-${Math.round(width)}`;
}

function withGraphics(scene: Phaser.Scene, key: string, width: number, height: number, draw: (g: Phaser.GameObjects.Graphics) => void): void {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  draw(g);
  g.generateTexture(key, width, height);
  g.destroy();
}

function drawParcel(g: Phaser.GameObjects.Graphics, def: ParcelColorDefinition): void {
  const s = PARCEL_TEXTURE_SIZE;
  const inset = 6;
  const size = s - inset * 2;
  const r = 14;

  // Outer neon rim.
  g.lineStyle(4, def.highlight, 0.9);
  g.strokeRoundedRect(inset, inset, size, size, r);

  // Body: darker base with a lighter top face to read as a box seen from above.
  g.fillStyle(def.shade, 1);
  g.fillRoundedRect(inset, inset, size, size, r);
  g.fillStyle(def.fill, 1);
  g.fillRoundedRect(inset + 4, inset + 4, size - 8, size - 14, r - 4);

  // Bevel highlight along the top-left edges.
  g.fillStyle(def.highlight, 0.35);
  g.fillRoundedRect(inset + 8, inset + 8, size - 16, 10, 5);

  // Packing tape across the middle, with a seam line.
  const tapeH = 22;
  const tapeY = s / 2 - tapeH / 2 - 4;
  g.fillStyle(def.tape, 0.85);
  g.fillRect(inset + 4, tapeY, size - 8, tapeH);
  g.lineStyle(2, def.shade, 0.45);
  g.lineBetween(inset + 4, tapeY + tapeH / 2, s - inset - 4, tapeY + tapeH / 2);

  // Corner reinforcement marks.
  g.lineStyle(3, def.shade, 0.7);
  const m = 22;
  const a = inset + 12;
  const b = s - inset - 12;
  g.lineBetween(a, a + m, a, a);
  g.lineBetween(a, a, a + m, a);
  g.lineBetween(b - m, b - 6, b, b - 6);
  g.lineBetween(b, b - 6, b, b - 6 - m);

  // Barcode strip, bottom-left.
  g.fillStyle(0x0b1022, 0.55);
  const barY = s - inset - 34;
  const bars = [3, 1, 2, 1, 3, 2, 1, 1, 3, 1, 2];
  let x = inset + 16;
  for (const w of bars) {
    g.fillRect(x, barY, w * 2, 16);
    x += w * 2 + 2;
  }
}

/** Round parcel. The silhouette alone tells it apart from a square one. */
function drawCircleParcel(g: Phaser.GameObjects.Graphics, def: ParcelColorDefinition): void {
  const c = PARCEL_TEXTURE_SIZE / 2;
  const r = 58;

  g.fillStyle(def.shade, 1);
  g.fillCircle(c, c, r);
  g.lineStyle(4, def.highlight, 0.9);
  g.strokeCircle(c, c, r);
  g.fillStyle(def.fill, 1);
  g.fillCircle(c, c - 3, r - 7);

  // Bevel highlight along the top of the drum.
  g.fillStyle(def.highlight, 0.35);
  g.fillEllipse(c, c - 36, 62, 16);

  // Packing tape band, kept inside the circle, with a seam line.
  const tapeH = 22;
  const tapeW = 98;
  const tapeY = c - tapeH / 2 - 4;
  g.fillStyle(def.tape, 0.85);
  g.fillRect(c - tapeW / 2, tapeY, tapeW, tapeH);
  g.lineStyle(2, def.shade, 0.45);
  g.lineBetween(c - tapeW / 2, tapeY + tapeH / 2, c + tapeW / 2, tapeY + tapeH / 2);

  // Short barcode below the tape.
  g.fillStyle(0x0b1022, 0.55);
  const bars = [3, 1, 2, 1, 3, 1, 2];
  let x = c - 26;
  for (const w of bars) {
    g.fillRect(x, c + 26, w * 2, 12);
    x += w * 2 + 2;
  }
}

function starPath(g: Phaser.GameObjects.Graphics, x: number, y: number, outer: number, inner: number): void {
  g.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (Math.PI / 5) * i;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath();
}

/** Gold frame laid over a normal parcel, leaving its colour and shape readable. */
function drawGoldRim(g: Phaser.GameObjects.Graphics, circle: boolean): void {
  const s = PARCEL_TEXTURE_SIZE;
  const c = s / 2;
  g.lineStyle(9, COLORS.goldDeep, 1);
  if (circle) g.strokeCircle(c, c, 58);
  else g.strokeRoundedRect(6, 6, s - 12, s - 12, 14);
  g.lineStyle(4, COLORS.gold, 1);
  if (circle) g.strokeCircle(c, c, 58);
  else g.strokeRoundedRect(6, 6, s - 12, s - 12, 14);

  g.fillStyle(COLORS.goldDeep, 1);
  starPath(g, c, 22, 19, 9);
  g.fillPath();
  g.fillStyle(COLORS.gold, 1);
  starPath(g, c, 22, 14, 6.5);
  g.fillPath();
}

function drawGoldRays(g: Phaser.GameObjects.Graphics): void {
  const s = PARCEL_TEXTURE_SIZE * 1.5;
  const c = s / 2;
  const rays = 10;
  g.fillStyle(COLORS.gold, 0.55);
  for (let i = 0; i < rays; i += 1) {
    const angle = (Math.PI * 2 * i) / rays;
    const spread = Math.PI / rays / 2;
    g.fillTriangle(
      c + Math.cos(angle - spread) * 30,
      c + Math.sin(angle - spread) * 30,
      c + Math.cos(angle + spread) * 30,
      c + Math.sin(angle + spread) * 30,
      c + Math.cos(angle) * c,
      c + Math.sin(angle) * c,
    );
  }
}

function drawParcelGlow(g: Phaser.GameObjects.Graphics): void {
  const s = PARCEL_TEXTURE_SIZE * 1.5;
  const c = s / 2;
  const steps = 14;
  for (let i = steps; i >= 1; i -= 1) {
    const t = i / steps;
    g.fillStyle(COLORS.white, 0.06 * (1 - t) + 0.01);
    g.fillCircle(c, c, (s / 2) * t);
  }
}

function drawRoller(g: Phaser.GameObjects.Graphics): void {
  const s = 32;
  const c = s / 2;
  g.fillStyle(COLORS.steelDark, 1);
  g.fillCircle(c, c, 15);
  g.lineStyle(2, COLORS.steelHighlight, 1);
  g.strokeCircle(c, c, 14);
  g.lineStyle(3, COLORS.steelLight, 1);
  for (let i = 0; i < 4; i += 1) {
    const angle = (Math.PI / 2) * i;
    g.lineBetween(c, c, c + Math.cos(angle) * 12, c + Math.sin(angle) * 12);
  }
  g.fillStyle(COLORS.cyan, 1);
  g.fillCircle(c, c, 3.5);
}

/** A horizontal end roller; scrolling it vertically reads as rotation. */
function drawRollerBar(g: Phaser.GameObjects.Graphics): void {
  const w = 64;
  const h = 16;
  g.fillStyle(COLORS.steel, 1);
  g.fillRect(0, 0, w, h);
  g.fillStyle(COLORS.steelHighlight, 0.9);
  g.fillRect(0, 2, w, 3);
  g.fillStyle(COLORS.steelDark, 1);
  g.fillRect(0, 11, w, 4);
  // Knurled grooves make the rotation visible along the whole roller.
  g.fillStyle(COLORS.steelDark, 0.7);
  for (let x = 4; x < w; x += 16) g.fillRect(x, 0, 4, h);
}

/** Sparse motion streaks, faded in as the belt gets faster. */
function drawBeltStreaks(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(COLORS.cyan, 0.5);
  g.fillRoundedRect(10, 12, 2, 40, 1);
  g.fillRoundedRect(44, 74, 2, 52, 1);
  g.fillStyle(COLORS.white, 0.35);
  g.fillRoundedRect(28, 40, 2, 28, 1);
}

/** Dashes that chase along the rails at belt speed. */
function drawRailChase(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(COLORS.cyan, 1);
  g.fillRoundedRect(1, 6, 4, 18, 2);
}

function drawBeltTile(g: Phaser.GameObjects.Graphics, width: number): void {
  const h = BELT_TILE_HEIGHT;
  g.fillStyle(COLORS.belt, 1);
  g.fillRect(0, 0, width, h);

  // Slat seam.
  g.fillStyle(0x070b16, 1);
  g.fillRect(0, 0, width, 3);
  g.fillStyle(0x26375c, 1);
  g.fillRect(0, 3, width, 2);

  // Chevron tread pointing in the direction of travel (down).
  const cx = width / 2;
  const span = width * 0.32;
  g.lineStyle(5, 0x1d2a47, 1);
  g.beginPath();
  g.moveTo(cx - span, 14);
  g.lineTo(cx, 34);
  g.lineTo(cx + span, 14);
  g.strokePath();
  g.lineStyle(2, 0x2a3d66, 1);
  g.beginPath();
  g.moveTo(cx - span, 12);
  g.lineTo(cx, 32);
  g.lineTo(cx + span, 12);
  g.strokePath();

  // Edge grip studs.
  g.fillStyle(0x2a3d66, 1);
  g.fillCircle(10, h / 2 + 4, 2.5);
  g.fillCircle(width - 10, h / 2 + 4, 2.5);
}

function drawSpark(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(COLORS.white, 1);
  g.fillRoundedRect(0, 0, 10, 10, 3);
}

function drawGlowDot(g: Phaser.GameObjects.Graphics): void {
  const s = 64;
  const c = s / 2;
  for (let i = 10; i >= 1; i -= 1) {
    const t = i / 10;
    g.fillStyle(COLORS.white, 0.1 * (1 - t) + 0.02);
    g.fillCircle(c, c, c * t);
  }
}

/** Generate every shared texture. Safe to call more than once. */
export function generateSharedTextures(scene: Phaser.Scene): void {
  for (const color of ALL_COLORS) {
    const def = PARCEL_COLORS[color];
    for (const shape of ALL_SHAPES) {
      withGraphics(scene, parcelTextureKey(color, shape), PARCEL_TEXTURE_SIZE, PARCEL_TEXTURE_SIZE, (g) =>
        shape === 'CIRCLE' ? drawCircleParcel(g, def) : drawParcel(g, def),
      );
    }
  }
  withGraphics(scene, TEXTURES.parcelShadow, PARCEL_TEXTURE_SIZE, PARCEL_TEXTURE_SIZE, (g) => {
    g.fillStyle(0x000000, 0.45);
    g.fillRoundedRect(8, 8, PARCEL_TEXTURE_SIZE - 16, PARCEL_TEXTURE_SIZE - 16, 18);
  });
  withGraphics(scene, TEXTURES.parcelShadowCircle, PARCEL_TEXTURE_SIZE, PARCEL_TEXTURE_SIZE, (g) => {
    g.fillStyle(0x000000, 0.45);
    g.fillCircle(PARCEL_TEXTURE_SIZE / 2, PARCEL_TEXTURE_SIZE / 2, 56);
  });
  const glowSize = PARCEL_TEXTURE_SIZE * 1.5;
  withGraphics(scene, TEXTURES.parcelGlow, glowSize, glowSize, drawParcelGlow);
  withGraphics(scene, TEXTURES.goldRimSquare, PARCEL_TEXTURE_SIZE, PARCEL_TEXTURE_SIZE, (g) => drawGoldRim(g, false));
  withGraphics(scene, TEXTURES.goldRimCircle, PARCEL_TEXTURE_SIZE, PARCEL_TEXTURE_SIZE, (g) => drawGoldRim(g, true));
  withGraphics(scene, TEXTURES.goldRays, glowSize, glowSize, drawGoldRays);
  withGraphics(scene, TEXTURES.roller, 32, 32, drawRoller);
  withGraphics(scene, TEXTURES.rollerBar, 64, 16, drawRollerBar);
  withGraphics(scene, TEXTURES.beltStreaks, 64, 144, drawBeltStreaks);
  withGraphics(scene, TEXTURES.railChase, 6, 30, drawRailChase);
  withGraphics(scene, TEXTURES.spark, 10, 10, drawSpark);
  withGraphics(scene, TEXTURES.glowDot, 64, 64, drawGlowDot);
}

/** Belt tiles are generated per belt width so the tread is centred. */
export function ensureBeltTile(scene: Phaser.Scene, width: number): string {
  const key = beltTileKey(width);
  withGraphics(scene, key, Math.round(width), BELT_TILE_HEIGHT, (g) => drawBeltTile(g, Math.round(width)));
  return key;
}
