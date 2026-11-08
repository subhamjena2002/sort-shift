import Phaser from 'phaser';
import type { BinSide } from '../../types/game';
import type { ShiftPlan } from '../systems/ShiftManager';
import { createGlyphRow } from './GlyphRow';
import type { GameLayout } from './layout';
import { drawArrow, drawPanel } from './Panel';
import { glyphsForSide } from './ruleGlyphs';
import { COLORS, CSS, DEPTH, textStyle } from './theme';

const SIDES: readonly BinSide[] = ['LEFT', 'RIGHT'];
const CARD_DELAY_MS = 260;

/**
 * The between-shifts card: a large SHIFT CHANGE title, the mode, a reversal
 * warning when needed, the new LEFT and RIGHT mappings, and a bar counting
 * down the learning interval. It only presents; timing lives in RunSession.
 */
export class ShiftAnnouncement {
  private readonly scene: Phaser.Scene;
  private readonly layout: GameLayout;
  private readonly dim: Phaser.GameObjects.Rectangle;
  private readonly root: Phaser.GameObjects.Container;
  private readonly hazard: Phaser.GameObjects.Graphics;
  private readonly title: Phaser.GameObjects.Text;
  private readonly subtitle: Phaser.GameObjects.Text;
  private readonly warningText: Phaser.GameObjects.Text;
  private readonly instruction: Phaser.GameObjects.Text;
  private readonly columns: Readonly<Record<BinSide, Phaser.GameObjects.Container>>;
  private readonly columnX: Readonly<Record<BinSide, number>>;
  private readonly columnWidth: number;
  private readonly columnHeight: number;
  private readonly timerFill: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene, layout: GameLayout) {
    this.scene = scene;
    this.layout = layout;
    const box = layout.announcement;
    const s = layout.uiScale;
    const top = -box.height / 2;

    this.dim = scene.add
      .rectangle(layout.width / 2, layout.height / 2, layout.width, layout.height, COLORS.bgDeep, 0.62)
      .setDepth(DEPTH.dim)
      .setVisible(false);

    const panel = new Phaser.GameObjects.Graphics(scene);
    drawPanel(panel, 0, 0, box.width, box.height, { accent: COLORS.magenta, radius: 20, fillAlpha: 0.97 });

    this.hazard = new Phaser.GameObjects.Graphics(scene);
    this.hazard.fillStyle(COLORS.amber, 0.9);
    const stripeInset = 20;
    for (let x = -box.width / 2 + stripeInset; x < box.width / 2 - stripeInset - 30; x += 40) {
      this.hazard.fillTriangle(x, top + 28, x + 20, top + 12, x + 30, top + 12);
      this.hazard.fillTriangle(x, box.height / 2 - 12, x + 20, box.height / 2 - 28, x + 30, box.height / 2 - 28);
    }

    this.title = new Phaser.GameObjects.Text(scene, 0, top + 62 * s, '', textStyle({ font: 'display', size: 56 * s, weight: '900', color: CSS.white, glow: CSS.magenta, glowBlur: 20, letterSpacing: 4 })).setOrigin(0.5);
    this.subtitle = new Phaser.GameObjects.Text(scene, 0, top + 116 * s, '', textStyle({ font: 'display', size: 25 * s, weight: '700', color: CSS.cyan, letterSpacing: 3 })).setOrigin(0.5);
    this.warningText = new Phaser.GameObjects.Text(scene, 0, top + 148 * s, 'WARNING  ·  RULES REVERSED', textStyle({ font: 'display', size: 20 * s, weight: '900', color: CSS.amber, letterSpacing: 3 })).setOrigin(0.5);
    this.instruction = new Phaser.GameObjects.Text(scene, 0, top + 148 * s, '', textStyle({ size: 22 * s, color: CSS.text, letterSpacing: 1 })).setOrigin(0.5);

    this.columnWidth = (box.width - 72) / 2;
    this.columnHeight = 166 * s;
    const columnY = top + 256 * s;
    this.columnX = { LEFT: -(this.columnWidth / 2 + 12), RIGHT: this.columnWidth / 2 + 12 };
    this.columns = {
      LEFT: new Phaser.GameObjects.Container(scene, this.columnX.LEFT, columnY),
      RIGHT: new Phaser.GameObjects.Container(scene, this.columnX.RIGHT, columnY),
    };

    const barWidth = box.width - 120;
    const barY = box.height / 2 - 46 * s;
    const barLabel = new Phaser.GameObjects.Text(scene, 0, barY - 16 * s, 'LEARN THE NEW RULE', textStyle({ size: 16 * s, color: CSS.textDim, letterSpacing: 4 })).setOrigin(0.5);
    const timerBack = new Phaser.GameObjects.Rectangle(scene, -barWidth / 2, barY + 4 * s, barWidth, 8 * s, COLORS.panelEdge).setOrigin(0, 0.5);
    this.timerFill = new Phaser.GameObjects.Rectangle(scene, -barWidth / 2, barY + 4 * s, barWidth, 8 * s, COLORS.cyan).setOrigin(0, 0.5);

    this.root = scene.add
      .container(box.x, box.y, [
        panel,
        this.hazard,
        this.title,
        this.subtitle,
        this.warningText,
        this.instruction,
        this.columns.LEFT,
        this.columns.RIGHT,
        barLabel,
        timerBack,
        this.timerFill,
      ])
      .setDepth(DEPTH.announcement)
      .setVisible(false);
  }

  /** Present a shift. `animate` is false when restoring after a layout change. */
  show(plan: ShiftPlan, opening: boolean, animate: boolean): void {
    this.killTweens();
    this.title.setText(opening ? 'SHIFT START' : 'SHIFT CHANGE');
    this.subtitle.setText(`SHIFT ${plan.number}  ·  ${plan.rule.title}`);
    this.instruction.setText(plan.rule.instruction).setVisible(!plan.warning);
    this.warningText.setVisible(plan.warning).setAlpha(1);
    this.hazard.setVisible(plan.warning);
    this.timerFill.setScale(1, 1);
    for (const side of SIDES) this.buildColumn(side, plan);

    this.dim.setVisible(true).setAlpha(1);
    this.root.setVisible(true).setAlpha(1).setScale(1);
    for (const side of SIDES) this.columns[side].setPosition(this.columnX[side], this.columns[side].y).setAlpha(1).setScale(1, 1);
    if (!animate) return;

    const { tweens } = this.scene;
    this.dim.setAlpha(0);
    tweens.add({ targets: this.dim, alpha: 1, duration: 180 });
    this.root.setAlpha(0).setScale(0.86);
    tweens.add({ targets: this.root, alpha: 1, scale: 1, duration: 240, ease: 'Back.easeOut' });

    if (plan.warning) {
      tweens.add({ targets: [this.warningText, this.hazard], alpha: 0.25, duration: 130, yoyo: true, repeat: Math.max(1, Math.round(plan.warningMs / 260)) });
    }

    // The mappings flip in after the title has landed, and after any warning.
    const delay = plan.warningMs + CARD_DELAY_MS;
    for (const side of SIDES) {
      const column = this.columns[side];
      column.setAlpha(0).setScale(0.1, 1).setX(this.columnX[side] + (side === 'LEFT' ? -48 : 48));
      tweens.add({ targets: column, alpha: 1, scaleX: 1, x: this.columnX[side], delay: delay + (side === 'LEFT' ? 0 : 90), duration: 300, ease: 'Back.easeOut' });
    }
  }

  /** @param fraction of the learning interval left, 1 → 0 */
  setProgress(fraction: number): void {
    this.timerFill.setScale(Math.max(0, Math.min(1, fraction)), 1);
  }

  hide(): void {
    if (!this.root.visible) return;
    this.killTweens();
    this.scene.tweens.add({
      targets: [this.root, this.dim],
      alpha: 0,
      duration: 160,
      onComplete: () => {
        this.root.setVisible(false);
        this.dim.setVisible(false);
      },
    });
  }

  destroy(): void {
    this.killTweens();
    this.root.destroy();
    this.dim.destroy();
  }

  private killTweens(): void {
    this.scene.tweens.killTweensOf([this.root, this.dim, this.warningText, this.hazard, this.columns.LEFT, this.columns.RIGHT]);
  }

  private buildColumn(side: BinSide, plan: ShiftPlan): void {
    const column = this.columns[side];
    column.removeAll(true);
    const s = this.layout.uiScale;
    const w = this.columnWidth;
    const h = this.columnHeight;
    const accent = side === 'LEFT' ? COLORS.cyan : COLORS.magenta;

    const frame = new Phaser.GameObjects.Graphics(this.scene);
    drawPanel(frame, 0, 0, w, h, { accent, radius: 14, glow: false, fill: COLORS.steelDark });
    const headerY = -h / 2 + 30 * s;
    const header = new Phaser.GameObjects.Text(this.scene, side === 'LEFT' ? 16 : -16, headerY, side, textStyle({ font: 'display', size: 28 * s, weight: '900', color: CSS.white, letterSpacing: 3 })).setOrigin(0.5);
    const arrowX = side === 'LEFT' ? header.x - header.width / 2 - 26 * s : header.x + header.width / 2 + 26 * s;
    drawArrow(frame, arrowX, headerY, 34 * s, side === 'LEFT' ? 'left' : 'right', accent, 1);
    column.add([frame, header]);

    const glyphs = glyphsForSide(plan.rule, side);
    const listTop = headerY + 26 * s;
    const rowHeight = (h / 2 - 10 * s - listTop) / Math.max(1, glyphs.length);
    glyphs.forEach((glyph, index) => {
      const row = createGlyphRow(this.scene, [glyph], { iconSize: 34 * s, fontSize: 25 * s, gap: 0, long: true });
      row.container.setY(listTop + rowHeight * (index + 0.5));
      const maxWidth = w - 28;
      if (row.width > maxWidth) row.container.setScale(maxWidth / row.width);
      column.add(row.container);
    });
  }
}
