import Phaser from 'phaser';
import type { GameOverData } from '../../types/game';
import { bindMenuKeys } from '../systems/InputController';
import { watchLayout } from '../systems/ResponsiveScaler';
import { animateOverlayIn, buttonStackHeight, createButtonStack, createOverlayFrame, OVERLAY_FOOTER } from '../ui/Overlay';
import { COLORS, CSS, DEPTH, textStyle } from '../ui/theme';
import { SceneDirector } from './SceneDirector';
import { SceneKeys } from './SceneKeys';

const EMPTY_RESULT: GameOverData = {
  score: 0,
  correctCount: 0,
  mistakeCount: 0,
  parcelsResolved: 0,
  bestScore: 0,
  isNewBest: false,
};

/** GAME_OVER overlay: final score, best score, restart / menu. */
export class GameOverScene extends Phaser.Scene {
  private result: GameOverData = EMPTY_RESULT;

  constructor() {
    super(SceneKeys.GAME_OVER);
  }

  init(data: Partial<GameOverData>): void {
    this.result = { ...EMPTY_RESULT, ...data };
  }

  create(): void {
    const director = SceneDirector.from(this);
    const result = this.result;
    const STACK_TOP = 346;
    const frame = createOverlayFrame(this, COLORS.danger, STACK_TOP + buttonStackHeight(2) + OVERLAY_FOOTER);
    const top = frame.panelY - frame.panelHeight / 2;
    const s = frame.uiScale;
    const cx = frame.panelX;

    this.add
      .text(cx, top + 58 * s, 'SHIFT OVER', textStyle({ font: 'display', size: 50 * s, weight: '900', color: CSS.white, glow: CSS.danger, glowBlur: 18, letterSpacing: 6 }))
      .setOrigin(0.5)
      .setDepth(DEPTH.overlay);

    this.add
      .text(cx, top + 112 * s, 'FINAL SCORE', textStyle({ size: 18 * s, color: CSS.textDim, letterSpacing: 6 }))
      .setOrigin(0.5)
      .setDepth(DEPTH.overlay);
    const scoreText = this.add
      .text(cx, top + 168 * s, String(result.score), textStyle({ font: 'display', size: 76 * s, weight: '900', color: CSS.white, glow: CSS.cyan, glowBlur: 20 }))
      .setOrigin(0.5)
      .setDepth(DEPTH.overlay);

    if (result.isNewBest && result.score > 0) {
      const badge = this.add
        .text(cx, top + 232 * s, '★  NEW BEST  ★', textStyle({ font: 'display', size: 24 * s, weight: '900', color: CSS.amber, glow: CSS.amber, glowBlur: 12, letterSpacing: 4 }))
        .setOrigin(0.5)
        .setDepth(DEPTH.overlay);
      this.tweens.add({ targets: badge, scale: 1.08, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    } else {
      this.add
        .text(cx, top + 232 * s, `BEST   ${result.bestScore}`, textStyle({ font: 'display', size: 24 * s, weight: '700', color: CSS.amber, letterSpacing: 4 }))
        .setOrigin(0.5)
        .setDepth(DEPTH.overlay);
    }

    this.add
      .text(cx, top + 276 * s, `PARCELS SORTED ${result.correctCount}   ·   HANDLED ${result.parcelsResolved}`, textStyle({ size: 18 * s, color: CSS.textDim, letterSpacing: 2 }))
      .setOrigin(0.5)
      .setDepth(DEPTH.overlay);

    this.add
      .text(cx, top + 306 * s, `SHIFT ${result.shiftReached ?? 1}   ·   BEST STREAK ${result.bestStreak ?? 0}   ·   PERFECT ${result.perfectShifts ?? 0}`, textStyle({ size: 18 * s, color: CSS.cyan, letterSpacing: 2 }))
      .setOrigin(0.5)
      .setDepth(DEPTH.overlay);

    const restart = (): void => {
      director.startRun(this);
    };
    const menu = (): void => {
      director.goToMenu(this);
    };
    createButtonStack(this, frame, top + STACK_TOP * s, [
      { label: 'RESTART', accent: COLORS.cyan, onActivate: restart },
      { label: 'MAIN MENU', accent: COLORS.magenta, onActivate: menu },
    ]);

    this.add
      .text(cx, top + frame.panelHeight - 22 * s, 'ENTER  RESTART   ·   M  MENU', textStyle({ size: 15 * s, color: CSS.textDim, letterSpacing: 2 }))
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.overlay);

    bindMenuKeys(this, { ENTER: restart, SPACE: restart, R: restart, M: menu, ESC: menu });
    watchLayout(this, () => this.scene.restart(this.result));
    animateOverlayIn(this);

    // Count the score up for a bit of punch.
    const counter = { value: 0 };
    scoreText.setText('0');
    this.tweens.add({
      targets: counter,
      value: result.score,
      duration: Math.min(900, 200 + result.score * 4),
      ease: 'Cubic.easeOut',
      onUpdate: () => scoreText.setText(String(Math.round(counter.value))),
    });
  }
}
