import Phaser from 'phaser';
import type { BinSide } from '../../types/game';
import type { BriefingEntry, ShiftBriefing } from '../systems/ShiftBriefing';
import type { GameLayout } from './layout';
import { NeonButton } from './NeonButton';
import { drawArrow, drawPanel } from './Panel';
import { createParcelPreview } from './ParcelPreview';
import { glyphForClause } from './ruleGlyphs';
import { COLORS, CSS, DEPTH, textStyle } from './theme';

const SIDES: readonly BinSide[] = ['LEFT', 'RIGHT'];
/** Brief guard so a tap meant for the belt can't dismiss a card nobody has seen. */
const READY_ARM_MS = 350;

/** Positions are offsets from the top of the card. */
interface CardMetrics {
  readonly eyebrowY: number;
  readonly titleY: number;
  readonly titleSize: number;
  readonly titleJoin: string;
  readonly changeY: number;
  readonly columnY: number;
  readonly columnHeight: number;
  readonly headerSize: number;
  readonly previewSize: number;
  readonly labelSize: number;
  readonly infoY: number;
  readonly infoSize: number;
  readonly readyY: number;
  readonly readyWidth: number;
  readonly readyHeight: number;
}

const LANDSCAPE_METRICS: CardMetrics = {
  eyebrowY: 40,
  titleY: 80,
  titleSize: 42,
  titleJoin: ' — ',
  changeY: 128,
  columnY: 278,
  columnHeight: 238,
  headerSize: 30,
  previewSize: 72,
  labelSize: 25,
  infoY: 412,
  infoSize: 21,
  readyY: 620,
  readyWidth: 460,
  readyHeight: 104,
};

const PORTRAIT_METRICS: CardMetrics = {
  eyebrowY: 44,
  titleY: 132,
  titleSize: 46,
  titleJoin: '\n',
  changeY: 232,
  columnY: 442,
  columnHeight: 330,
  headerSize: 26,
  previewSize: 76,
  labelSize: 24,
  infoY: 628,
  infoSize: 25,
  readyY: 1046,
  readyWidth: 560,
  readyHeight: 140,
};

/**
 * The full rule card shown between shifts. It has no timer of any kind: it
 * stays until the player presses I'M READY, and only reports that press. The
 * session decides what happens next.
 */
export class ShiftAnnouncement {
  private readonly scene: Phaser.Scene;
  private readonly metrics: CardMetrics;
  private readonly cardWidth: number;
  private readonly dim: Phaser.GameObjects.Rectangle;
  private readonly root: Phaser.GameObjects.Container;
  private readonly hazard: Phaser.GameObjects.Graphics;
  private readonly eyebrow: Phaser.GameObjects.Text;
  private readonly title: Phaser.GameObjects.Text;
  private readonly change: Phaser.GameObjects.Text;
  private readonly columns: Readonly<Record<BinSide, Phaser.GameObjects.Container>>;
  private readonly columnWidth: number;
  private readonly info: Phaser.GameObjects.Container;
  private readonly readyGlow: Phaser.GameObjects.Graphics;
  private readonly readyButton: NeonButton;
  private armedAt = Number.POSITIVE_INFINITY;
  private showing = false;

  constructor(scene: Phaser.Scene, layout: GameLayout, onReady: () => void) {
    this.scene = scene;
    const box = layout.announcement;
    this.cardWidth = box.width;
    const portrait = layout.orientation === 'portrait';
    const m = (this.metrics = portrait ? PORTRAIT_METRICS : LANDSCAPE_METRICS);
    const top = -box.height / 2;

    // Nearly opaque and input-blocking, so nothing behind competes with the card.
    this.dim = scene.add
      .rectangle(layout.width / 2, layout.height / 2, layout.width, layout.height, COLORS.bgDeep, 0.93)
      .setDepth(DEPTH.dim)
      .setInteractive()
      .setVisible(false);

    const panel = new Phaser.GameObjects.Graphics(scene);
    drawPanel(panel, 0, 0, box.width, box.height, { accent: COLORS.magenta, radius: 22, fillAlpha: 1 });

    this.hazard = new Phaser.GameObjects.Graphics(scene);
    this.hazard.fillStyle(COLORS.amber, 0.9);
    for (let x = -box.width / 2 + 26; x < box.width / 2 - 56; x += 40) {
      this.hazard.fillTriangle(x, top + 26, x + 20, top + 10, x + 30, top + 10);
    }

    this.eyebrow = new Phaser.GameObjects.Text(scene, 0, top + m.eyebrowY, '', textStyle({ font: 'display', size: 20, weight: '700', color: CSS.magenta, letterSpacing: 6 })).setOrigin(0.5);
    this.title = new Phaser.GameObjects.Text(scene, 0, top + m.titleY, '', textStyle({ font: 'display', size: m.titleSize, weight: '900', color: CSS.white, glow: CSS.magenta, glowBlur: 14, letterSpacing: 2, align: 'center' })).setOrigin(0.5);
    this.change = new Phaser.GameObjects.Text(scene, 0, top + m.changeY, '', textStyle({ size: portrait ? 27 : 26, color: CSS.cyan, letterSpacing: 1, align: 'center' })).setOrigin(0.5).setWordWrapWidth(box.width - 60);

    this.columnWidth = (box.width - 64) / 2;
    const columnY = top + m.columnY;
    this.columns = {
      LEFT: new Phaser.GameObjects.Container(scene, -(this.columnWidth / 2 + 10), columnY),
      RIGHT: new Phaser.GameObjects.Container(scene, this.columnWidth / 2 + 10, columnY),
    };
    this.info = new Phaser.GameObjects.Container(scene, 0, top + m.infoY);

    this.readyGlow = new Phaser.GameObjects.Graphics(scene);
    this.readyGlow.lineStyle(10, COLORS.success, 0.55);
    this.readyGlow.strokeRoundedRect(-m.readyWidth / 2 - 8, top + m.readyY - m.readyHeight / 2 - 8, m.readyWidth + 16, m.readyHeight + 16, 24);

    this.root = scene.add
      .container(box.x, box.y, [panel, this.hazard, this.eyebrow, this.title, this.change, this.columns.LEFT, this.columns.RIGHT, this.info, this.readyGlow])
      .setDepth(DEPTH.announcement)
      .setVisible(false);

    this.readyButton = new NeonButton(scene, {
      x: box.x,
      y: box.y + top + m.readyY,
      width: m.readyWidth,
      height: m.readyHeight,
      label: "I'M READY",
      sublabel: 'ENTER  /  SPACE',
      accent: COLORS.success,
      fontSize: portrait ? 50 : 40,
      fireOn: 'up',
      onActivate: onReady,
    }).setDepth(DEPTH.announcement);
    this.readyButton.setVisible(false).setEnabled(false);
  }

  get isShowing(): boolean {
    return this.showing;
  }

  /** True once the card has been up long enough to accept a confirmation. */
  isArmed(now: number): boolean {
    return this.showing && now >= this.armedAt;
  }

  /** Present a shift. `animate` is false when restoring after a layout change. */
  show(briefing: ShiftBriefing, opening: boolean, animate: boolean): void {
    this.killTweens();
    const { metrics: m } = this;
    this.showing = true;
    this.armedAt = animate ? this.scene.time.now + READY_ARM_MS : this.scene.time.now;

    this.eyebrow.setText(opening ? 'SHIFT START' : 'SHIFT CHANGE').setColor(briefing.warning ? CSS.amber : CSS.magenta);
    this.title.setScale(1).setText(`${briefing.shiftLabel}${m.titleJoin}${briefing.modeName}`);
    if (this.title.width > this.cardWidth - 50) this.title.setScale((this.cardWidth - 50) / this.title.width);
    this.change.setText(briefing.warning ? `WARNING: ${briefing.change}` : briefing.change).setColor(briefing.warning ? CSS.amber : CSS.cyan);
    this.hazard.setVisible(briefing.warning).setAlpha(1);
    for (const side of SIDES) this.buildColumn(side, briefing);
    this.buildInfo(briefing);

    this.dim.setVisible(true).setAlpha(1);
    this.root.setVisible(true).setAlpha(1).setScale(1);
    this.readyButton.setVisible(true).setEnabled(true);
    this.readyGlow.setAlpha(1);
    this.scene.tweens.add({ targets: this.readyGlow, alpha: 0.25, duration: 620, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    if (!animate) return;

    this.dim.setAlpha(0);
    this.scene.tweens.add({ targets: this.dim, alpha: 1, duration: 200 });
    this.root.setAlpha(0).setScale(0.94);
    this.scene.tweens.add({ targets: this.root, alpha: 1, scale: 1, duration: 240, ease: 'Back.easeOut' });
    this.readyButton.setAlpha(0);
    this.scene.tweens.add({ targets: this.readyButton, alpha: 1, delay: 180, duration: 170 });

    for (const side of SIDES) {
      const column = this.columns[side];
      const finalX = column.x;
      column.setAlpha(0).setX(finalX + (side === 'LEFT' ? -40 : 40));
      this.scene.tweens.add({ targets: column, alpha: 1, x: finalX, delay: 120, duration: 260, ease: 'Back.easeOut' });
    }
  }

  hide(): void {
    if (!this.showing) return;
    this.showing = false;
    this.armedAt = Number.POSITIVE_INFINITY;
    this.killTweens();
    this.readyButton.setEnabled(false).setVisible(false);
    this.resetColumnPositions();
    this.scene.tweens.add({
      targets: [this.root, this.dim],
      alpha: 0,
      duration: 180,
      onComplete: () => {
        this.root.setVisible(false);
        this.dim.setVisible(false);
      },
    });
  }

  destroy(): void {
    this.killTweens();
    this.readyButton.destroy();
    this.root.destroy();
    this.dim.destroy();
  }

  private killTweens(): void {
    this.scene.tweens.killTweensOf([this.root, this.dim, this.readyGlow, this.readyButton, this.columns.LEFT, this.columns.RIGHT]);
    this.resetColumnPositions();
  }

  private resetColumnPositions(): void {
    this.columns.LEFT.setX(-(this.columnWidth / 2 + 10)).setAlpha(1);
    this.columns.RIGHT.setX(this.columnWidth / 2 + 10).setAlpha(1);
  }

  private buildColumn(side: BinSide, briefing: ShiftBriefing): void {
    const { metrics: m, columnWidth: w } = this;
    const h = m.columnHeight;
    const column = this.columns[side];
    column.removeAll(true);
    const accent = briefing.warning ? COLORS.amber : side === 'LEFT' ? COLORS.cyan : COLORS.magenta;

    const frame = new Phaser.GameObjects.Graphics(this.scene);
    drawPanel(frame, 0, 0, w, h, { accent, radius: 14, glow: false, fill: COLORS.steelDark, fillAlpha: 1 });

    const headerY = -h / 2 + 34;
    const header = new Phaser.GameObjects.Text(this.scene, 0, headerY, `${side} BIN`, textStyle({ font: 'display', size: m.headerSize, weight: '900', color: CSS.white, letterSpacing: 2 })).setOrigin(0.5);
    const direction = side === 'LEFT' ? 'left' : 'right';
    const arrowX = side === 'LEFT' ? -header.width / 2 - 28 : header.width / 2 + 28;
    drawArrow(frame, arrowX, headerY, 36, direction, accent, 1);
    column.add([frame, header]);

    const entries = briefing.entries[side];
    const listTop = headerY + 30;
    const rowHeight = (h / 2 - 8 - listTop) / Math.max(1, entries.length);
    entries.forEach((entry, index) => {
      const row = this.buildEntryRow(entry);
      row.container.setY(listTop + rowHeight * (index + 0.5));
      const maxWidth = w - 30;
      const scale = Math.min(1, maxWidth / row.width);
      row.container.setScale(scale).setX((-row.width * scale) / 2);
      column.add(row.container);
    });
  }

  /** [parcel previews] LABEL, with an optional note beneath. Origin is its left edge. */
  private buildEntryRow(entry: BriefingEntry): { container: Phaser.GameObjects.Container; width: number } {
    const { metrics: m } = this;
    const container = new Phaser.GameObjects.Container(this.scene, 0, 0);
    let x = 0;
    for (const example of entry.examples) {
      const preview = createParcelPreview(this.scene, example, m.previewSize).setX(x + m.previewSize / 2);
      container.add(preview);
      x += m.previewSize + 6;
    }
    x += 8;

    const glyph = glyphForClause(entry.clause);
    const label = new Phaser.GameObjects.Text(this.scene, x, entry.note ? -12 : 0, entry.label, textStyle({ font: 'display', size: m.labelSize, weight: '900', color: glyph.css, letterSpacing: 1 })).setOrigin(0, 0.5);
    container.add(label);
    let width = x + label.width;
    if (entry.note) {
      const note = new Phaser.GameObjects.Text(this.scene, x, 18, entry.note, textStyle({ font: 'display', size: m.labelSize * 0.68, weight: '700', color: CSS.amber, letterSpacing: 1 })).setOrigin(0, 0.5);
      container.add(note);
      width = Math.max(width, x + note.width);
    }
    return { container, width };
  }

  private buildInfo(briefing: ShiftBriefing): void {
    const { metrics: m, cardWidth } = this;
    this.info.removeAll(true);
    let y = 0;

    if (briefing.firstTime) {
      const tag = new Phaser.GameObjects.Text(this.scene, 0, y + 12, 'NEW MECHANIC', textStyle({ font: 'display', size: m.infoSize * 0.82, weight: '900', color: CSS.amber, letterSpacing: 4 })).setOrigin(0.5);
      this.info.add(tag);
      y += 34;
    }

    const explanation = new Phaser.GameObjects.Text(this.scene, 0, y, briefing.explanation, textStyle({ size: m.infoSize + 1, color: CSS.text, letterSpacing: 1, align: 'center' }))
      .setOrigin(0.5, 0)
      .setWordWrapWidth(cardWidth - 70);
    this.info.add(explanation);
    y += explanation.height + 12;

    if (!briefing.worked) return;
    const previewSize = m.previewSize * 0.9;
    const preview = createParcelPreview(this.scene, briefing.worked.parcel, previewSize);
    const text = new Phaser.GameObjects.Text(this.scene, 0, 0, briefing.worked.text, textStyle({ size: m.infoSize, color: CSS.white, letterSpacing: 1 }))
      .setOrigin(0, 0.5)
      .setWordWrapWidth(cardWidth - 110 - previewSize);
    const total = previewSize + 14 + text.width;
    preview.setPosition(-total / 2 + previewSize / 2, y + previewSize / 2);
    text.setPosition(-total / 2 + previewSize + 14, y + previewSize / 2);
    this.info.add([preview, text]);
  }
}
