import Phaser from 'phaser';
import { bindMenuKeys } from '../systems/InputController';
import { watchLayout } from '../systems/ResponsiveScaler';
import { animateOverlayIn, buttonStackHeight, createButtonStack, createOverlayFrame, OVERLAY_FOOTER } from '../ui/Overlay';
import { COLORS, CSS, DEPTH, textStyle } from '../ui/theme';
import { SceneDirector } from './SceneDirector';
import { SceneKeys } from './SceneKeys';

/** PAUSED overlay drawn above the frozen Game scene. */
export class PauseScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.PAUSE);
  }

  create(): void {
    const director = SceneDirector.from(this);
    const STACK_TOP = 150;
    const frame = createOverlayFrame(this, COLORS.cyan, STACK_TOP + buttonStackHeight(3) + OVERLAY_FOOTER);
    const top = frame.panelY - frame.panelHeight / 2;
    const s = frame.uiScale;

    this.add
      .text(frame.panelX, top + 64 * s, 'PAUSED', textStyle({ font: 'display', size: 54 * s, weight: '900', color: CSS.white, glow: CSS.cyan, glowBlur: 18, letterSpacing: 6 }))
      .setOrigin(0.5)
      .setDepth(DEPTH.overlay);
    this.add
      .text(frame.panelX, top + 112 * s, 'THE BELT IS HOLDING', textStyle({ size: 18 * s, color: CSS.textDim, letterSpacing: 5 }))
      .setOrigin(0.5)
      .setDepth(DEPTH.overlay);

    const resume = (): void => {
      director.resumeRun(this);
    };
    const restart = (): void => {
      director.startRun(this);
    };
    const menu = (): void => {
      director.goToMenu(this);
    };

    createButtonStack(this, frame, top + STACK_TOP * s, [
      { label: 'RESUME', accent: COLORS.cyan, onActivate: resume },
      { label: 'RESTART', accent: COLORS.amber, onActivate: restart },
      { label: 'MAIN MENU', accent: COLORS.magenta, onActivate: menu },
    ]);

    this.add
      .text(frame.panelX, top + frame.panelHeight - 22 * s, 'ESC / P  RESUME   ·   R  RESTART   ·   M  MENU', textStyle({ size: 15 * s, color: CSS.textDim, letterSpacing: 2 }))
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.overlay);

    bindMenuKeys(this, { ESC: resume, P: resume, R: restart, M: menu });
    watchLayout(this, () => this.scene.restart());
    animateOverlayIn(this);
  }
}
