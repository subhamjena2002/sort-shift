import Phaser from 'phaser';
import type { BinSide } from '../../types/game';
import { MODE_LABELS, type SortingRule } from '../data/sortingRules';
import type { ShiftPlan } from '../systems/ShiftManager';
import { createGlyphRow } from './GlyphRow';
import type { GameLayout, Point } from './layout';
import { NeonButton } from './NeonButton';
import { drawArrow, drawPanel } from './Panel';
import { glyphsForSide } from './ruleGlyphs';
import { TEXTURES } from './textures';
import { COLORS, CSS, DEPTH, textStyle } from './theme';

export interface HudOptions {
  readonly rule: SortingRule;
  readonly bestScore: number;
  readonly maxMistakes: number;
  readonly onPause: () => void;
}

const SPEED_SEGMENTS = 8;

/**
 * Score, best, mistakes-remaining pips, the active rule, the streak readout,
 * shift progress, speed and the pause button.
 */
export class Hud {
  private readonly scene: Phaser.Scene;
  private readonly layout: GameLayout;
  private readonly maxMistakes: number;
  private readonly objects: Phaser.GameObjects.GameObject[] = [];
  private readonly scoreText: Phaser.GameObjects.Text;
  private readonly metaText: Phaser.GameObjects.Text;
  private readonly pips: Phaser.GameObjects.Graphics;
  private readonly pipFlash: Phaser.GameObjects.Image;
  private readonly pauseButton: NeonButton;
  private readonly ruleTitle: Phaser.GameObjects.Text;
  private ruleRows: Phaser.GameObjects.Container[] = [];
  private readonly streakText: Phaser.GameObjects.Text;
  private readonly multiplierText: Phaser.GameObjects.Text;
  private readonly comboBar: Phaser.GameObjects.Graphics;
  private readonly comboCallout: Phaser.GameObjects.Text;
  private readonly shiftText: Phaser.GameObjects.Text;
  private readonly modeText: Phaser.GameObjects.Text;
  private readonly quotaText: Phaser.GameObjects.Text;
  private readonly speedText: Phaser.GameObjects.Text;
  private readonly shiftBars: Phaser.GameObjects.Graphics;
  private bestScore: number;
  private remaining: number;

  constructor(scene: Phaser.Scene, layout: GameLayout, options: HudOptions) {
    this.scene = scene;
    this.layout = layout;
    this.maxMistakes = options.maxMistakes;
    this.remaining = options.maxMistakes;
    this.bestScore = options.bestScore;
    const s = layout.uiScale;

    // Score block (top-left).
    const scoreLabel = scene.add
      .text(layout.score.x, layout.score.y, 'SCORE', textStyle({ size: 18 * s, color: CSS.textDim, letterSpacing: 4 }))
      .setDepth(DEPTH.hud);
    this.scoreText = scene.add
      .text(layout.score.x, layout.score.y + 20 * s, '0', textStyle({ font: 'display', size: 44 * s, weight: '900', color: CSS.white, glow: CSS.cyan, glowBlur: 12 }))
      .setDepth(DEPTH.hud);
    this.metaText = scene.add
      .text(layout.score.x, layout.score.y + 78 * s, '', textStyle({ size: 18 * s, color: CSS.textDim, letterSpacing: 2 }))
      .setDepth(DEPTH.hud);
    this.objects.push(scoreLabel, this.scoreText, this.metaText);

    // Mistakes block (top-right anchor).
    const mistakesLabel = scene.add
      .text(layout.mistakes.x, layout.mistakes.y, 'MISTAKES LEFT', textStyle({ size: 18 * s, color: CSS.textDim, letterSpacing: 3, align: 'right' }))
      .setOrigin(1, 0)
      .setDepth(DEPTH.hud);
    this.pips = scene.add.graphics().setDepth(DEPTH.hud);
    this.pipFlash = scene.add
      .image(0, 0, TEXTURES.glowDot)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(COLORS.danger)
      .setAlpha(0)
      .setDepth(DEPTH.hud);
    this.objects.push(mistakesLabel, this.pips, this.pipFlash);

    // Rule panel (always visible, above the belt).
    const box = layout.rulePanel;
    const ruleFrame = scene.add.graphics().setDepth(DEPTH.hud);
    drawPanel(ruleFrame, box.x, box.y, box.width, box.height, { accent: COLORS.magenta, radius: 14 });
    ruleFrame.lineStyle(2, COLORS.panelEdge, 1);
    ruleFrame.lineBetween(box.x, box.y - box.height / 2 + 34 * s, box.x, box.y + box.height / 2 - 12 * s);
    this.ruleTitle = scene.add
      .text(box.x, box.y - box.height / 2 + 8 * s, '', textStyle({ size: 16 * s, color: CSS.magenta, letterSpacing: 5 }))
      .setOrigin(0.5, 0)
      .setDepth(DEPTH.hud);
    this.objects.push(ruleFrame, this.ruleTitle);

    // Streak panel.
    const combo = layout.comboPanel;
    const comboLeft = combo.x - combo.width / 2 + 14;
    const comboTop = combo.y - combo.height / 2;
    const comboFrame = scene.add.graphics().setDepth(DEPTH.hud);
    drawPanel(comboFrame, combo.x, combo.y, combo.width, combo.height, { accent: COLORS.amber, radius: 14, glow: false });
    const streakLabel = scene.add
      .text(comboLeft, comboTop + 10, 'STREAK', textStyle({ size: 16 * s, color: CSS.amber, letterSpacing: 4 }))
      .setDepth(DEPTH.hud);
    this.streakText = scene.add
      .text(comboLeft, comboTop + 34 * s, '0', textStyle({ font: 'display', size: 42 * s, weight: '900', color: CSS.white }))
      .setDepth(DEPTH.hud);
    this.multiplierText = scene.add
      .text(combo.x + combo.width / 2 - 14, comboTop + 62 * s, '×1', textStyle({ font: 'display', size: 34 * s, weight: '900', color: CSS.textDim, align: 'right' }))
      .setOrigin(1, 0.5)
      .setDepth(DEPTH.hud);
    this.comboBar = scene.add.graphics().setDepth(DEPTH.hud);
    this.comboCallout = scene.add
      .text(combo.x + combo.width / 2 - 14, comboTop + 10, '', textStyle({ size: 16 * s, color: CSS.amber, letterSpacing: 1, align: 'right' }))
      .setOrigin(1, 0)
      .setAlpha(0)
      .setDepth(DEPTH.hud);
    this.objects.push(comboFrame, streakLabel, this.streakText, this.multiplierText, this.comboBar, this.comboCallout);

    // Shift panel.
    const shift = layout.shiftPanel;
    const shiftLeft = shift.x - shift.width / 2 + 14;
    const shiftRight = shift.x + shift.width / 2 - 14;
    const shiftTop = shift.y - shift.height / 2;
    const shiftFrame = scene.add.graphics().setDepth(DEPTH.hud);
    drawPanel(shiftFrame, shift.x, shift.y, shift.width, shift.height, { accent: COLORS.cyan, radius: 14, glow: false });
    this.shiftText = scene.add
      .text(shiftLeft, shiftTop + 8, 'SHIFT 1', textStyle({ font: 'display', size: 26 * s, weight: '900', color: CSS.white, letterSpacing: 2 }))
      .setDepth(DEPTH.hud);
    this.modeText = scene.add
      .text(shiftLeft, shiftTop + 46 * s, '', textStyle({ size: 17 * s, color: CSS.cyan, letterSpacing: 2 }))
      .setDepth(DEPTH.hud);
    this.quotaText = scene.add
      .text(shiftRight, shiftTop + 46 * s, '', textStyle({ size: 17 * s, color: CSS.text, align: 'right' }))
      .setOrigin(1, 0)
      .setDepth(DEPTH.hud);
    this.speedText = scene.add
      .text(shiftLeft, shiftTop + 92 * s, '', textStyle({ size: 15 * s, color: CSS.textDim, letterSpacing: 1 }))
      .setDepth(DEPTH.hud);
    this.shiftBars = scene.add.graphics().setDepth(DEPTH.hud);
    this.objects.push(shiftFrame, this.shiftText, this.modeText, this.quotaText, this.speedText, this.shiftBars);

    this.setRule(options.rule, false);

    const pb = layout.pauseButton;
    this.pauseButton = new NeonButton(scene, {
      x: pb.x,
      y: pb.y,
      width: pb.width,
      height: pb.height,
      label: '',
      icon: 'pause',
      accent: COLORS.cyan,
      fireOn: 'up',
      onActivate: options.onPause,
    });
    this.pauseButton.setDepth(DEPTH.hud);
    this.objects.push(this.pauseButton);

    this.drawPips();
    this.refreshMeta();
    this.setCombo(0, 1, 5, false);
  }

  /** Brief message in the streak panel's title row, clear of its numbers. */
  showComboCallout(message: string, color: string): void {
    this.scene.tweens.killTweensOf(this.comboCallout);
    this.comboCallout.setText(message).setColor(color).setAlpha(1);
    this.scene.tweens.add({ targets: this.comboCallout, alpha: 0, delay: 650, duration: 300 });
  }

  /** Where score bonus call-outs should appear. */
  get scoreAnchor(): Point {
    return { x: this.layout.score.x + 170, y: this.layout.score.y + 50 };
  }

  setScore(score: number, animate: boolean): void {
    this.scoreText.setText(String(score));
    if (score > this.bestScore) {
      this.bestScore = score;
      this.refreshMeta();
    }
    if (!animate) return;
    this.scene.tweens.killTweensOf(this.scoreText);
    this.scoreText.setScale(1.18);
    this.scene.tweens.add({ targets: this.scoreText, scale: 1, duration: 220, ease: 'Back.easeOut' });
  }

  setMistakesRemaining(remaining: number, animate: boolean): void {
    const lostIndex = this.remaining - 1;
    this.remaining = Math.max(0, remaining);
    this.drawPips();
    if (!animate || remaining >= this.maxMistakes) return;
    const pos = this.pipPosition(lostIndex);
    this.scene.tweens.killTweensOf(this.pipFlash);
    this.pipFlash.setPosition(pos.x, pos.y).setScale(0.4).setAlpha(1);
    this.scene.tweens.add({ targets: this.pipFlash, scale: 1.6, alpha: 0, duration: 520, ease: 'Cubic.easeOut' });
  }

  /** Show the mappings of `rule`, with LEFT on the left and RIGHT on the right. */
  setRule(rule: SortingRule, animate: boolean): void {
    this.scene.tweens.killTweensOf(this.ruleRows);
    for (const row of this.ruleRows) row.destroy();
    this.ruleTitle.setText(rule.title);

    const box = this.layout.rulePanel;
    const rowY = box.y + 14 * this.layout.uiScale;
    const quarter = box.width / 4;
    const maxWidth = box.width / 2 - 28 * this.layout.uiScale;
    this.ruleRows = [
      this.buildRuleSide(rule, 'LEFT', box.x - quarter, rowY, maxWidth),
      this.buildRuleSide(rule, 'RIGHT', box.x + quarter, rowY, maxWidth),
    ];

    if (!animate) return;
    for (const row of this.ruleRows) {
      const finalScale = row.scaleX;
      row.setScale(finalScale * 0.6).setAlpha(0);
      this.scene.tweens.add({ targets: row, scale: finalScale, alpha: 1, duration: 320, ease: 'Back.easeOut' });
    }
  }

  setCombo(streak: number, multiplier: number, nextTierAt: number | null, animate: boolean): void {
    this.streakText.setText(String(streak));
    this.multiplierText.setText(`×${multiplier}`).setColor(multiplier > 1 ? CSS.amber : CSS.textDim);

    const box = this.layout.comboPanel;
    const s = this.layout.uiScale;
    const fraction = nextTierAt === null ? 1 : Math.min(1, streak / nextTierAt);
    drawBar(this.comboBar, box.x - box.width / 2 + 14, box.y + box.height / 2 - 20 * s, box.width - 28, 10 * s, fraction, COLORS.amber);

    if (!animate) return;
    this.scene.tweens.killTweensOf([this.streakText, this.multiplierText]);
    this.streakText.setScale(1);
    this.multiplierText.setScale(1);
    this.scene.tweens.add({ targets: [this.streakText, this.multiplierText], scale: 1.2, duration: 90, yoyo: true, ease: 'Quad.easeOut' });
  }

  setShift(plan: ShiftPlan, correctInShift: number): void {
    this.shiftText.setText(`SHIFT ${plan.number}`);
    this.quotaText.setText(`${Math.min(correctInShift, plan.quota)}/${plan.quota}`);
    this.speedText.setText(`SPEED ${plan.difficulty.speedLevel}`);

    const box = this.layout.shiftPanel;
    const s = this.layout.uiScale;
    const left = box.x - box.width / 2 + 14;
    const top = box.y - box.height / 2;
    const width = box.width - 28;

    // Long mode names shrink so they never run into the quota counter.
    this.modeText.setScale(1).setText(MODE_LABELS[plan.mode]);
    const modeRoom = width - this.quotaText.width - 8;
    if (this.modeText.width > modeRoom) this.modeText.setScale(modeRoom / this.modeText.width);

    const g = this.shiftBars;
    g.clear();
    drawBar(g, left, top + 76 * s, width, 8 * s, correctInShift / plan.quota, COLORS.cyan, false);

    // Speed gauge: a segment for each slice of the path to top speed.
    const gaugeLeft = left + 74 * s;
    const gaugeWidth = width - 74 * s;
    const gap = 3;
    const segment = (gaugeWidth - gap * (SPEED_SEGMENTS - 1)) / SPEED_SEGMENTS;
    const lit = Math.max(1, Math.ceil(plan.difficulty.pressure * SPEED_SEGMENTS));
    for (let i = 0; i < SPEED_SEGMENTS; i += 1) {
      const hot = i >= SPEED_SEGMENTS - 2;
      g.fillStyle(i < lit ? (hot ? COLORS.danger : COLORS.magenta) : COLORS.panelEdge, 1);
      g.fillRect(gaugeLeft + i * (segment + gap), top + 96 * s, segment, 12 * s);
    }
  }

  setPauseEnabled(enabled: boolean): void {
    this.pauseButton.setEnabled(enabled);
  }

  flashPause(): void {
    this.pauseButton.flash();
  }

  destroy(): void {
    this.scene.tweens.killTweensOf([this.scoreText, this.pipFlash, this.streakText, this.multiplierText, this.comboCallout, ...this.ruleRows]);
    for (const row of this.ruleRows) row.destroy();
    this.ruleRows = [];
    for (const obj of this.objects) obj.destroy();
    this.objects.length = 0;
  }

  // ------------------------------------------------------------- internals

  private refreshMeta(): void {
    this.metaText.setText(`BEST ${this.bestScore}`);
  }

  private buildRuleSide(rule: SortingRule, side: BinSide, x: number, y: number, maxWidth: number): Phaser.GameObjects.Container {
    const s = this.layout.uiScale;
    const arrowSize = 24 * s;
    const pad = 8 * s;
    const glyphs = createGlyphRow(this.scene, glyphsForSide(rule, side), { iconSize: 22 * s, fontSize: 22 * s, gap: 14 * s });
    const label = new Phaser.GameObjects.Text(this.scene, 0, 0, side, textStyle({ font: 'display', size: 22 * s, weight: '900', color: CSS.white, letterSpacing: 1 })).setOrigin(0, 0.5);
    const arrow = new Phaser.GameObjects.Graphics(this.scene);

    const total = arrowSize + pad + label.width + pad * 2 + glyphs.width;
    const start = -total / 2;
    if (side === 'LEFT') {
      drawArrow(arrow, start + arrowSize / 2, 0, arrowSize, 'left', COLORS.white, 0.9);
      label.setX(start + arrowSize + pad);
      glyphs.container.setX(start + arrowSize + pad + label.width + pad * 2 + glyphs.width / 2);
    } else {
      glyphs.container.setX(start + glyphs.width / 2);
      label.setX(start + glyphs.width + pad * 2);
      drawArrow(arrow, start + total - arrowSize / 2, 0, arrowSize, 'right', COLORS.white, 0.9);
    }

    const row = this.scene.add.container(x, y, [glyphs.container, label, arrow]).setDepth(DEPTH.hud);
    if (total > maxWidth) row.setScale(maxWidth / total);
    return row;
  }

  private pipPosition(index: number): { x: number; y: number } {
    const s = this.layout.uiScale;
    const size = 26 * s;
    const gap = 12 * s;
    // Pips are right-aligned to the mistakes anchor; index 0 is leftmost.
    const totalW = this.maxMistakes * size + (this.maxMistakes - 1) * gap;
    const startX = this.layout.mistakes.x - totalW + size / 2;
    return { x: startX + index * (size + gap), y: this.layout.mistakes.y + 44 * s };
  }

  private drawPips(): void {
    const g = this.pips;
    const s = this.layout.uiScale;
    const half = 13 * s;
    g.clear();
    for (let i = 0; i < this.maxMistakes; i += 1) {
      const { x, y } = this.pipPosition(i);
      const alive = i < this.remaining;
      if (alive) {
        g.fillStyle(COLORS.cyan, 0.18);
        g.fillCircle(x, y, half * 1.5);
        g.fillStyle(COLORS.cyan, 1);
        diamondPath(g, x, y, half);
        g.fillPath();
        g.fillStyle(COLORS.white, 0.6);
        g.fillCircle(x, y - half * 0.3, half * 0.22);
      } else {
        g.lineStyle(2, COLORS.danger, 0.8);
        diamondPath(g, x, y, half);
        g.strokePath();
        g.lineStyle(3, COLORS.danger, 0.9);
        const k = half * 0.45;
        g.lineBetween(x - k, y - k, x + k, y + k);
        g.lineBetween(x - k, y + k, x + k, y - k);
      }
    }
  }
}

/** Horizontal progress bar with its top-left corner at (x, y). */
function drawBar(g: Phaser.GameObjects.Graphics, x: number, y: number, width: number, height: number, fraction: number, color: number, clear = true): void {
  if (clear) g.clear();
  g.fillStyle(COLORS.panelEdge, 1);
  g.fillRoundedRect(x, y, width, height, height / 2);
  const filled = width * Math.max(0, Math.min(1, fraction));
  if (filled >= height) {
    g.fillStyle(color, 1);
    g.fillRoundedRect(x, y, filled, height, height / 2);
  }
}

function diamondPath(g: Phaser.GameObjects.Graphics, x: number, y: number, half: number): void {
  g.beginPath();
  g.moveTo(x, y - half);
  g.lineTo(x + half, y);
  g.lineTo(x, y + half);
  g.lineTo(x - half, y);
  g.closePath();
}
