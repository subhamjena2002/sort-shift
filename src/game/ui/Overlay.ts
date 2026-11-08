import Phaser from 'phaser';
import { NeonButton } from './NeonButton';
import { drawPanel } from './Panel';
import { COLORS, DEPTH } from './theme';

export interface OverlayButtonSpec {
  readonly label: string;
  readonly sublabel?: string;
  readonly accent: number;
  readonly onActivate: () => void;
}

export interface OverlayFrame {
  readonly panelX: number;
  readonly panelY: number;
  readonly panelWidth: number;
  readonly panelHeight: number;
  readonly uiScale: number;
}

/** Dims the frozen game underneath and draws a centred panel. */
/** Unscaled height of a button stack, matching createButtonStack. */
export function buttonStackHeight(count: number): number {
  return count * BUTTON_H + Math.max(0, count - 1) * BUTTON_GAP;
}

const BUTTON_H = 84;
const BUTTON_GAP = 20;
/** Unscaled space reserved under the button stack for the key-hint footer. */
export const OVERLAY_FOOTER = 66;

/**
 * Dims the frozen game underneath and draws a centred panel.
 * `contentHeight` is in unscaled design pixels; it is multiplied by uiScale.
 */
export function createOverlayFrame(scene: Phaser.Scene, accent: number, contentHeight: number): OverlayFrame {
  const { width, height } = scene.scale;
  const portrait = height > width;
  const uiScale = portrait ? 1.15 : 1;

  // Full-screen dim layer. Interactive so clicks never fall through.
  scene.add.rectangle(width / 2, height / 2, width, height, COLORS.bgDeep, 0.78).setDepth(DEPTH.overlay).setInteractive();

  const panelWidth = Math.min(portrait ? width - 64 : 560, width - 40);
  const panelH = Math.min(height - 24, Math.round(contentHeight * uiScale));
  const panelX = width / 2;
  const panelY = height / 2;
  const g = scene.add.graphics().setDepth(DEPTH.overlay);
  drawPanel(g, panelX, panelY, panelWidth, panelH, { accent, radius: 22 });
  return { panelX, panelY, panelWidth, panelHeight: panelH, uiScale };
}

/** Stack of full-width buttons, top edge at `startY`. */
export function createButtonStack(
  scene: Phaser.Scene,
  frame: OverlayFrame,
  startY: number,
  specs: readonly OverlayButtonSpec[],
): NeonButton[] {
  const buttonW = Math.min(380, frame.panelWidth - 80);
  const buttonH = Math.round(BUTTON_H * frame.uiScale);
  const gap = Math.round(BUTTON_GAP * frame.uiScale);
  return specs.map((spec, index) =>
    new NeonButton(scene, {
      x: frame.panelX,
      y: startY + buttonH / 2 + index * (buttonH + gap),
      width: buttonW,
      height: buttonH,
      label: spec.label,
      ...(spec.sublabel !== undefined ? { sublabel: spec.sublabel } : {}),
      accent: spec.accent,
      fontSize: Math.round(28 * frame.uiScale),
      fireOn: 'up',
      onActivate: spec.onActivate,
    }).setDepth(DEPTH.overlay),
  );
}

/** Pop-in animation for overlay content. */
export function animateOverlayIn(scene: Phaser.Scene): void {
  const targets = scene.children.list.filter((obj) => obj instanceof Phaser.GameObjects.Graphics || obj instanceof NeonButton || obj instanceof Phaser.GameObjects.Text);
  for (const obj of targets) {
    if ('setAlpha' in obj && typeof obj.setAlpha === 'function') obj.setAlpha(0);
  }
  scene.tweens.add({ targets, alpha: 1, duration: 200, ease: 'Quad.easeOut' });
}
