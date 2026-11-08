import Phaser from 'phaser';
import type { BinSide } from '../../types/game';
import type { ParcelColorDefinition } from '../data/parcelCatalog';
import type { Box, Point } from '../ui/layout';
import { drawPanel } from '../ui/Panel';
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

  constructor(scene: Phaser.Scene, box: Box, side: BinSide, accepts: readonly ParcelColorDefinition[], uiScale: number) {
    this.scene = scene;
    this.box = box;
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

    // "Accepts" chips derived from the active rule.
    const chips = new Phaser.GameObjects.Graphics(scene);
    const chipTexts: Phaser.GameObjects.Text[] = [];
    const chipY = title.y + title.height + 8;
    const chipSize = 16 * uiScale;
    let totalW = 0;
    const entries = accepts.map((def) => {
      const text = new Phaser.GameObjects.Text(scene, 0, chipY, def.label, textStyle({ size: 18 * uiScale, color: def.css, letterSpacing: 2 })).setOrigin(0, 0.5);
      chipTexts.push(text);
      const width = chipSize + 6 + text.width;
      totalW += width;
      return { def, text, width };
    });
    totalW += Math.max(0, entries.length - 1) * 14;
    let cx = -totalW / 2;
    for (const entry of entries) {
      chips.fillStyle(entry.def.fill, 1);
      chips.fillRoundedRect(cx, chipY - chipSize / 2, chipSize, chipSize, 4);
      entry.text.setX(cx + chipSize + 6);
      cx += entry.width + 14;
    }

    this.flashLayer = new Phaser.GameObjects.Graphics(scene).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);

    this.container = scene.add
      .container(box.x, box.y, [g, title, chips, ...chipTexts, this.flashLayer])
      .setDepth(DEPTH.bins);
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
