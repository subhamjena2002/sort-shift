import Phaser from 'phaser';
import type { GameLayout } from './layout';
import { COLORS, CSS, DEPTH, textStyle } from './theme';

const COLOR_BY_VALUE: Readonly<Record<number, { css: string; ring: number }>> = {
  3: { css: CSS.cyan, ring: COLORS.cyan },
  2: { css: CSS.amber, ring: COLORS.amber },
  1: { css: CSS.magenta, ring: COLORS.magenta },
};
const FALLBACK_STYLE = { css: CSS.white, ring: COLORS.white };

/** The large 3-2-1 over the belt. Timing comes from the session; this only shows it. */
export class CountdownDisplay {
  private readonly scene: Phaser.Scene;
  private readonly root: Phaser.GameObjects.Container;
  private readonly disc: Phaser.GameObjects.Graphics;
  private readonly ring: Phaser.GameObjects.Graphics;
  private readonly digit: Phaser.GameObjects.Text;
  private readonly radius: number;
  private shownValue: number | null = null;

  constructor(scene: Phaser.Scene, layout: GameLayout) {
    this.scene = scene;
    const s = layout.uiScale;
    this.radius = 118 * s;

    this.disc = new Phaser.GameObjects.Graphics(scene);
    this.disc.fillStyle(COLORS.bgDeep, 0.88);
    this.disc.fillCircle(0, 0, this.radius);
    this.ring = new Phaser.GameObjects.Graphics(scene);
    this.digit = new Phaser.GameObjects.Text(scene, 0, -8 * s, '', textStyle({ font: 'display', size: 150 * s, weight: '900', color: CSS.white, glowBlur: 26, glow: CSS.cyan })).setOrigin(0.5);
    const caption = new Phaser.GameObjects.Text(scene, 0, this.radius * 0.68, 'GET READY', textStyle({ size: 18 * s, color: CSS.text, letterSpacing: 5 })).setOrigin(0.5);

    this.root = scene.add
      .container(layout.countdown.x, layout.countdown.y, [this.disc, this.ring, this.digit, caption])
      .setDepth(DEPTH.announcement)
      .setVisible(false);
  }

  /** The number currently displayed, or null when hidden. */
  get value(): number | null {
    return this.shownValue;
  }

  show(value: number, animate: boolean): void {
    const style = COLOR_BY_VALUE[value] ?? FALLBACK_STYLE;
    this.shownValue = value;
    this.scene.tweens.killTweensOf([this.root, this.digit, this.ring]);
    this.digit.setText(String(value)).setColor(style.css).setShadow(0, 0, style.css, 26, true, true).setScale(1).setAlpha(1);
    this.ring.clear().lineStyle(7, style.ring, 1).strokeCircle(0, 0, this.radius).setScale(1).setAlpha(1);
    this.root.setVisible(true).setAlpha(1).setScale(1);
    if (!animate) return;

    this.digit.setScale(1.5).setAlpha(0.2);
    this.scene.tweens.add({ targets: this.digit, scale: 1, alpha: 1, duration: 220, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: this.ring, scale: 1.22, alpha: 0.15, duration: 880, ease: 'Quad.easeOut' });
  }

  hide(): void {
    this.shownValue = null;
    this.scene.tweens.killTweensOf([this.root, this.digit, this.ring]);
    this.root.setVisible(false);
  }

  destroy(): void {
    this.scene.tweens.killTweensOf([this.root, this.digit, this.ring]);
    this.root.destroy();
  }
}
