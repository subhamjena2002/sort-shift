import Phaser from 'phaser';

/** Neon-industrial palette. Numeric values for Graphics, CSS strings for Text. */
export const COLORS = {
  bgDeep: 0x040914,
  bgNavy: 0x0a1630,
  bgNavyLight: 0x10224a,
  panel: 0x0b1733,
  panelEdge: 0x1d3466,
  steelDark: 0x0f1a30,
  steel: 0x1c2a48,
  steelLight: 0x30466f,
  steelHighlight: 0x5873a6,
  belt: 0x121a2d,
  cyan: 0x22f0ff,
  cyanDeep: 0x0a8fb3,
  magenta: 0xff2bd6,
  magentaDeep: 0x8f1279,
  amber: 0xffb020,
  success: 0x3dffa8,
  danger: 0xff5a3c,
  white: 0xffffff,
  textDim: 0x7f94bd,
} as const;

export const CSS = {
  white: '#ffffff',
  text: '#e6f0ff',
  textDim: '#7f94bd',
  cyan: '#22f0ff',
  magenta: '#ff2bd6',
  amber: '#ffb020',
  success: '#3dffa8',
  danger: '#ff5a3c',
  navy: '#050b1a',
} as const;

export const FONTS = {
  display: '"Orbitron", "Segoe UI", "Helvetica Neue", Arial, sans-serif',
  ui: '"Rajdhani", "Segoe UI", "Helvetica Neue", Arial, sans-serif',
} as const;

export type FontKind = keyof typeof FONTS;

/** Depth bands so layering stays consistent across components. */
export const DEPTH = {
  backdrop: 0,
  machinery: 10,
  bins: 15,
  belt: 20,
  parcel: 30,
  beltOverlay: 40,
  controls: 50,
  hud: 60,
  feedback: 70,
  overlay: 100,
} as const;

export interface TextOptions {
  readonly font?: FontKind;
  readonly size: number;
  readonly color?: string;
  readonly weight?: '600' | '700' | '900';
  readonly align?: 'left' | 'center' | 'right';
  readonly letterSpacing?: number;
  /** Neon glow colour (implemented with a blurred canvas shadow). */
  readonly glow?: string;
  readonly glowBlur?: number;
  readonly stroke?: string;
  readonly strokeThickness?: number;
}

export function textStyle(options: TextOptions): Phaser.Types.GameObjects.Text.TextStyle {
  const glowBlur = options.glowBlur ?? 14;
  const pad = options.glow ? Math.ceil(glowBlur * 1.2) : 4;
  const style: Phaser.Types.GameObjects.Text.TextStyle = {
    fontFamily: FONTS[options.font ?? 'ui'],
    fontSize: `${Math.round(options.size)}px`,
    fontStyle: options.weight ?? '700',
    color: options.color ?? CSS.text,
    align: options.align ?? 'left',
    letterSpacing: options.letterSpacing ?? 0,
    padding: { left: pad, right: pad, top: pad, bottom: pad },
  };
  if (options.glow) {
    style.shadow = { offsetX: 0, offsetY: 0, color: options.glow, blur: glowBlur, fill: true, stroke: true };
  }
  if (options.stroke) {
    style.stroke = options.stroke;
    style.strokeThickness = options.strokeThickness ?? 2;
  }
  return style;
}

export function toCss(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}
