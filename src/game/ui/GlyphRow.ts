import Phaser from 'phaser';
import { drawGlyphIcon, type RuleGlyph } from './ruleGlyphs';
import { textStyle } from './theme';

export interface GlyphRowOptions {
  readonly iconSize: number;
  readonly fontSize: number;
  /** Space between entries. */
  readonly gap: number;
  /** Use the full label instead of the compact one. */
  readonly long?: boolean;
}

export interface GlyphRow {
  readonly container: Phaser.GameObjects.Container;
  readonly width: number;
}

/** A horizontal run of [icon][label] entries, centred on the container's origin. */
export function createGlyphRow(scene: Phaser.Scene, glyphs: readonly RuleGlyph[], options: GlyphRowOptions): GlyphRow {
  const { iconSize, fontSize, gap } = options;
  const iconGap = iconSize * 0.34;
  const icons = new Phaser.GameObjects.Graphics(scene);
  const labels = glyphs.map((glyph) =>
    new Phaser.GameObjects.Text(
      scene,
      0,
      0,
      options.long ? glyph.longText : glyph.text,
      textStyle({ font: 'display', size: fontSize, weight: '900', color: glyph.css, letterSpacing: 1 }),
    ).setOrigin(0, 0.5),
  );

  const contentWidth = labels.reduce((sum, label) => sum + iconSize + iconGap + label.width, 0);
  const width = contentWidth + Math.max(0, glyphs.length - 1) * gap;
  let x = -width / 2;
  glyphs.forEach((glyph, index) => {
    drawGlyphIcon(icons, x + iconSize / 2, 0, iconSize, glyph);
    const label = labels[index];
    if (!label) return;
    label.setX(x + iconSize + iconGap);
    x += iconSize + iconGap + label.width + gap;
  });

  return { container: new Phaser.GameObjects.Container(scene, 0, 0, [icons, ...labels]), width };
}
