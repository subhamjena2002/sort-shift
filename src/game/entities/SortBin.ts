import Phaser from 'phaser';
import type { BinSide } from '../../types/game';
import { createGlyphRow } from '../ui/GlyphRow';
import type { Box, Point } from '../ui/layout';
import { drawPanel } from '../ui/Panel';
import type { RuleGlyph } from '../ui/ruleGlyphs';
import { COLORS, CSS, DEPTH, textStyle } from '../ui/theme';

/**
 * A destination bin. Shows its side, which parcels the active rule routes into
 * it, and flashes green/orange when a parcel lands in it.
 */
export class SortBin {
  private readonly scene: Phaser.Scene;
  private readonly box: Box;
  private readonly container: Phaser.GameObjects.Container;
  private readonly flashLayer: Phaser.GameObjects.Graphics;
  private readonly chipY: number;
  private readonly uiScale: number;
  private acceptsRow: Phaser.GameObjects.Container | null = null;

  constructor(scene: Phaser.Scene, box: Box, side: BinSide, accepts: readonly RuleGlyph[], uiScale: number) {
    this.scene = scene;
    this.box = box;
    this.uiScale = uiScale;
    const w = box.width;
    const h = box.height;

    const g = new Phaser.GameObjects.Graphics(scene);
    drawPanel(g, 0, 0, w, h, { accent: COLORS.cyan, fill: COLORS.steelDark, radius: 18 });

    // Open cavity the parcels drop into.
    const cavityW = w - 40;
    const cavityH = h * 0.5;
    const cavityY = -h / 2 + 22;
    g.fillStyle(0x02050c, 1);
    g.fillRoundedRect(-cavityW / 2, cavityY, cavityW, cavityH, 12);
    g.fillGradientStyle(COLORS.cyanDeep, COLORS.cyanDeep, 0x02050c, 0x02050c, 0.35, 0.35, 0, 0);
    g.fillRect(-cavityW / 2 + 6, cavityY + 4, cavityW - 12, cavityH * 0.45);
    g.lineStyle(2, COLORS.cyan, 0.6);
    g.strokeRoundedRect(-cavityW / 2, cavityY, cavityW, cavityH, 12);

    // Front lip with hazard stripes.
    const lipY = cavityY + cavityH + 4;
    g.fillStyle(COLORS.steel, 1);
    g.fillRect(-w / 2 + 14, lipY, w - 28, 12);
    g.fillStyle(COLORS.amber, 0.55);
    for (let x = -w / 2 + 16; x < w / 2 - 22; x += 20) {
      g.fillTriangle(x, lipY + 12, x + 10, lipY, x + 18, lipY);
    }

    const title = new Phaser.GameObjects.Text(
      scene,
      0,
      lipY + 22,
      `${side} BIN`,
      textStyle({ font: 'display', size: 22 * uiScale, weight: '900', color: CSS.white, letterSpacing: 3 }),
    ).setOrigin(0.5, 0);

    this.chipY = title.y + title.height + 12;
    this.flashLayer = new Phaser.GameObjects.Graphics(scene).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);

    this.container = scene.add.container(box.x, box.y, [g, title, this.flashLayer]).setDepth(DEPTH.bins);
    this.setAccepts(accepts);
  }

  /** Replace the "accepts" chips with those of the active rule. */
  setAccepts(accepts: readonly RuleGlyph[]): void {
    this.acceptsRow?.destroy();
    const s = this.uiScale;
    const row = createGlyphRow(this.scene, accepts, { iconSize: 16 * s, fontSize: 15 * s, gap: 12 * s });
    row.container.setY(this.chipY);
    const maxWidth = this.box.width - 24;
    if (row.width > maxWidth) row.container.setScale(maxWidth / row.width);
    this.acceptsRow = row.container;
    this.container.addAt(row.container, 2);
  }

  /** Where a sorted parcel should travel to. */
  get mouth(): Point {
    return { x: this.box.x, y: this.box.y - this.box.height / 2 + 22 + this.box.height * 0.25 };
  }

  flash(success: boolean): void {
    const color = success ? COLORS.success : COLORS.danger;
    const { width: w, height: h } = this.box;
    this.flashLayer.clear();
    this.flashLayer.fillStyle(color, 0.35);
    this.flashLayer.fillRoundedRect(-w / 2, -h / 2, w, h, 18);
    this.flashLayer.lineStyle(6, color, 1);
    this.flashLayer.strokeRoundedRect(-w / 2, -h / 2, w, h, 18);

    this.scene.tweens.killTweensOf([this.flashLayer, this.container]);
    this.flashLayer.setAlpha(1);
    this.container.setScale(1);
    this.scene.tweens.add({ targets: this.flashLayer, alpha: 0, duration: 480, ease: 'Cubic.easeOut' });
    this.scene.tweens.add({ targets: this.container, scale: success ? 1.04 : 0.97, duration: 90, yoyo: true, ease: 'Quad.easeOut' });
  }

  destroy(): void {
    this.scene.tweens.killTweensOf([this.flashLayer, this.container]);
    this.container.destroy();
  }
}
