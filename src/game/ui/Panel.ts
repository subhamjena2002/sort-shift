import Phaser from 'phaser';
import { COLORS } from './theme';

export interface PanelStyle {
  readonly accent: number;
  readonly fill?: number;
  readonly fillAlpha?: number;
  readonly radius?: number;
  /** Draw soft outer glow strokes. */
  readonly glow?: boolean;
}

/**
 * Draws a sci-fi panel (rounded body, accent border, corner brackets) centred
 * on (x, y) into an existing Graphics object.
 */
export function drawPanel(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  style: PanelStyle,
): void {
  const left = x - width / 2;
  const top = y - height / 2;
  const r = style.radius ?? 16;

  if (style.glow ?? true) {
    g.lineStyle(14, style.accent, 0.05);
    g.strokeRoundedRect(left, top, width, height, r);
    g.lineStyle(7, style.accent, 0.1);
    g.strokeRoundedRect(left, top, width, height, r);
  }

  g.fillStyle(style.fill ?? COLORS.panel, style.fillAlpha ?? 0.92);
  g.fillRoundedRect(left, top, width, height, r);

  // Subtle top sheen.
  g.fillStyle(COLORS.white, 0.04);
  g.fillRoundedRect(left + 4, top + 4, width - 8, Math.min(28, height * 0.3), { tl: r - 3, tr: r - 3, bl: 0, br: 0 });

  g.lineStyle(2, style.accent, 0.85);
  g.strokeRoundedRect(left, top, width, height, r);

  // Corner brackets.
  const b = Math.min(26, width * 0.12, height * 0.3);
  const o = 7;
  g.lineStyle(3, style.accent, 1);
  g.beginPath();
  g.moveTo(left + o, top + o + b);
  g.lineTo(left + o, top + o);
  g.lineTo(left + o + b, top + o);
  g.moveTo(left + width - o - b, top + o);
  g.lineTo(left + width - o, top + o);
  g.lineTo(left + width - o, top + o + b);
  g.moveTo(left + width - o, top + height - o - b);
  g.lineTo(left + width - o, top + height - o);
  g.lineTo(left + width - o - b, top + height - o);
  g.moveTo(left + o + b, top + height - o);
  g.lineTo(left + o, top + height - o);
  g.lineTo(left + o, top + height - o - b);
  g.strokePath();
}

/** Filled arrow pointing left or right, centred on (x, y). */
export function drawArrow(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  size: number,
  direction: 'left' | 'right',
  color: number,
  alpha = 1,
): void {
  const d = direction === 'left' ? -1 : 1;
  const half = size / 2;
  const shaft = size * 0.22;
  g.fillStyle(color, alpha);
  g.fillTriangle(x + d * half, y, x + d * (half - size * 0.5), y - half * 0.8, x + d * (half - size * 0.5), y + half * 0.8);
  g.fillRect(direction === 'left' ? x : x - half, y - shaft / 2, half, shaft);
}
