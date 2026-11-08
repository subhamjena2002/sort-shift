import Phaser from 'phaser';
import type { BinSide } from '../../types/game';
import { PARCEL_COLORS } from '../data/parcelCatalog';
import type { RuleClause, SortingRule } from '../data/sortingRules';
import type { GameLayout } from './layout';
import { NeonButton } from './NeonButton';
import { drawArrow, drawPanel } from './Panel';
import { TEXTURES } from './textures';
import { COLORS, CSS, DEPTH, textStyle } from './theme';

export interface HudOptions {
  readonly rule: SortingRule;
  readonly bestScore: number;
  readonly maxMistakes: number;
  readonly onPause: () => void;
}

const SIDE_LABEL: Readonly<Record<BinSide, string>> = { LEFT: 'LEFT', RIGHT: 'RIGHT' };

/** Score, best, speed, mistakes-remaining pips, the active rule and pause button. */
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
  private bestScore: number;
  private speedLevel = 1;
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

    this.buildRulePanel(options.rule);

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

  setSpeedLevel(level: number): void {
    if (level === this.speedLevel) return;
    this.speedLevel = level;
    this.refreshMeta();
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

  setPauseEnabled(enabled: boolean): void {
    this.pauseButton.setEnabled(enabled);
  }

  flashPause(): void {
    this.pauseButton.flash();
  }

  destroy(): void {
    this.scene.tweens.killTweensOf([this.scoreText, this.pipFlash]);
    for (const obj of this.objects) obj.destroy();
    this.objects.length = 0;
  }

  // ------------------------------------------------------------- internals

  private refreshMeta(): void {
    this.metaText.setText(`BEST ${this.bestScore}   ·   SPEED ${this.speedLevel}`);
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

  private buildRulePanel(rule: SortingRule): void {
    const box = this.layout.rulePanel;
    const s = this.layout.uiScale;
    const g = this.scene.add.graphics().setDepth(DEPTH.hud);
    drawPanel(g, box.x, box.y, box.width, box.height, { accent: COLORS.magenta, radius: 14 });
    this.objects.push(g);

    const title = this.scene.add
      .text(box.x, box.y - box.height / 2 + 8 * s, rule.title, textStyle({ size: 16 * s, color: CSS.magenta, letterSpacing: 5 }))
      .setOrigin(0.5, 0)
      .setDepth(DEPTH.hud);
    this.objects.push(title);

    // Build each clause as [chip][COLOUR] ➜ [SIDE] inside a container (local
    // coordinates, row centred on y=0), then centre and shrink-to-fit it.
    const row = this.scene.add.container(box.x, box.y + 12 * s).setDepth(DEPTH.hud);
    this.objects.push(row);
    const rowY = 0;
    const fontSize = 28 * s;
    const chipSize = 24 * s;
    const arrowSize = 30 * s;
    const pad = 10 * s;
    const clauseGap = 46 * s;

    interface Part {
      readonly width: number;
      readonly place: (x: number) => void;
    }
    const parts: Part[] = [];
    const icons = new Phaser.GameObjects.Graphics(this.scene);
    row.add(icons);

    rule.clauses.forEach((clause, index) => {
      if (index > 0) {
        parts.push({
          width: clauseGap,
          place: (x) => {
            icons.lineStyle(2, COLORS.panelEdge, 1);
            icons.lineBetween(x + clauseGap / 2, rowY - 18 * s, x + clauseGap / 2, rowY + 18 * s);
          },
        });
      }
      const { label, css, color } = describeClause(clause);
      if (color !== null) {
        parts.push({
          width: chipSize + pad,
          place: (x) => {
            icons.fillStyle(color, 1);
            icons.fillRoundedRect(x, rowY - chipSize / 2, chipSize, chipSize, 5);
            icons.lineStyle(2, COLORS.white, 0.5);
            icons.strokeRoundedRect(x, rowY - chipSize / 2, chipSize, chipSize, 5);
          },
        });
      }
      const colorText = new Phaser.GameObjects.Text(this.scene, 0, rowY, label, textStyle({ font: 'display', size: fontSize, weight: '900', color: css, letterSpacing: 1 }))
        .setOrigin(0, 0.5);
      row.add(colorText);
      parts.push({ width: colorText.width + pad, place: (x) => colorText.setX(x) });
      parts.push({
        width: arrowSize + pad,
        place: (x) => drawArrow(icons, x + arrowSize / 2, rowY, arrowSize, 'right', COLORS.white, 0.85),
      });
      const sideText = new Phaser.GameObjects.Text(this.scene, 0, rowY, SIDE_LABEL[clause.destination], textStyle({ font: 'display', size: fontSize, weight: '900', color: CSS.white, letterSpacing: 1 }))
        .setOrigin(0, 0.5);
      row.add(sideText);
      parts.push({ width: sideText.width, place: (x) => sideText.setX(x) });
    });

    const total = parts.reduce((sum, part) => sum + part.width, 0);
    let x = -total / 2;
    for (const part of parts) {
      part.place(x);
      x += part.width;
    }
    const maxWidth = box.width - 48 * s;
    if (total > maxWidth) row.setScale(maxWidth / total);
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

interface ClauseDescription {
  readonly label: string;
  readonly css: string;
  readonly color: number | null;
}

function describeClause(clause: RuleClause): ClauseDescription {
  const colorId = clause.when.color;
  if (colorId !== undefined) {
    const def = PARCEL_COLORS[colorId];
    return { label: def.label, css: def.css, color: def.fill };
  }
  return { label: 'ANY', css: CSS.white, color: null };
}
