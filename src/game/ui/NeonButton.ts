import Phaser from 'phaser';
import { drawArrow } from './Panel';
import { COLORS, CSS, textStyle } from './theme';

export type ButtonIcon = 'none' | 'left' | 'right' | 'pause' | 'sound' | 'muted';
type VisualState = 'idle' | 'hover' | 'down';

export interface NeonButtonConfig {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly label: string;
  readonly sublabel?: string;
  readonly accent: number;
  readonly icon?: ButtonIcon;
  readonly fontSize?: number;
  /**
   * 'down' fires on press (lowest latency, used for gameplay buttons);
   * 'up' fires on release over the button (standard for menus).
   */
  readonly fireOn?: 'down' | 'up';
  readonly onActivate: () => void;
}

/**
 * Large neon button usable with mouse and touch. The hit area is an invisible
 * Zone (alpha-0 objects are not hit-tested in Phaser), covering the full
 * button rectangle.
 */
export class NeonButton extends Phaser.GameObjects.Container {
  private readonly config: NeonButtonConfig;
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly hit: Phaser.GameObjects.Zone;
  private readonly labelText: Phaser.GameObjects.Text | null;
  private readonly sublabelText: Phaser.GameObjects.Text | null;
  private visual: VisualState = 'idle';
  private pressed = false;
  private enabled = true;
  private flashTimer: Phaser.Time.TimerEvent | null = null;
  private currentIcon: ButtonIcon;

  constructor(scene: Phaser.Scene, config: NeonButtonConfig) {
    super(scene, config.x, config.y);
    this.config = config;
    this.currentIcon = config.icon ?? 'none';

    this.bg = new Phaser.GameObjects.Graphics(scene);
    this.add(this.bg);

    const fontSize = config.fontSize ?? Math.round(Math.min(34, config.height * 0.34));
    const hasSub = config.sublabel !== undefined && config.sublabel.length > 0;
    const labelY = hasSub ? -config.height * 0.1 : 0;

    this.labelText =
      config.label.length > 0
        ? new Phaser.GameObjects.Text(
            scene,
            0,
            labelY,
            config.label,
            textStyle({ font: 'display', size: fontSize, weight: '900', color: CSS.white, letterSpacing: 2 }),
          ).setOrigin(0.5)
        : null;
    if (this.labelText) this.add(this.labelText);

    this.sublabelText = hasSub
      ? new Phaser.GameObjects.Text(
          scene,
          0,
          config.height * 0.26,
          config.sublabel ?? '',
          textStyle({ font: 'ui', size: Math.round(fontSize * 0.62), weight: '700', color: CSS.textDim, letterSpacing: 2 }),
        ).setOrigin(0.5)
      : null;
    if (this.sublabelText) this.add(this.sublabelText);

    this.layoutLabel();

    this.hit = new Phaser.GameObjects.Zone(scene, 0, 0, config.width, config.height);
    this.hit.setInteractive({ useHandCursor: true });
    this.add(this.hit);

    this.hit.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, this.onOver, this);
    this.hit.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, this.onOut, this);
    this.hit.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, this.onDown, this);
    this.hit.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, this.onUp, this);

    this.redraw();
    scene.add.existing(this);
  }

  setEnabled(enabled: boolean): this {
    this.enabled = enabled;
    this.pressed = false;
    this.visual = 'idle';
    if (enabled) this.hit.setInteractive({ useHandCursor: true });
    else this.hit.disableInteractive();
    this.setAlpha(enabled ? 1 : 0.45);
    this.redraw();
    return this;
  }

  setIcon(icon: ButtonIcon): this {
    this.currentIcon = icon;
    this.redraw();
    return this;
  }

  /** Briefly show the pressed state (e.g. when triggered from the keyboard). */
  flash(): void {
    if (!this.enabled) return;
    this.flashTimer?.remove(false);
    this.setVisual('down');
    this.flashTimer = this.scene.time.delayedCall(110, () => {
      this.flashTimer = null;
      this.setVisual(this.pressed ? 'down' : 'idle');
    });
  }

  override destroy(fromScene?: boolean): void {
    this.flashTimer?.remove(false);
    this.flashTimer = null;
    if (this.hit.scene) this.hit.removeAllListeners();
    super.destroy(fromScene);
  }

  // ------------------------------------------------------------- internals

  private onOver(): void {
    if (this.enabled && !this.pressed) this.setVisual('hover');
  }

  private onOut(): void {
    this.pressed = false;
    if (this.enabled) this.setVisual('idle');
  }

  private onDown(pointer: Phaser.Input.Pointer): void {
    if (!this.enabled || pointer.button !== 0) return;
    this.pressed = true;
    this.setVisual('down');
    if ((this.config.fireOn ?? 'up') === 'down') this.config.onActivate();
  }

  private onUp(): void {
    if (!this.enabled) return;
    const wasPressed = this.pressed;
    this.pressed = false;
    this.setVisual('hover');
    if (wasPressed && (this.config.fireOn ?? 'up') === 'up') this.config.onActivate();
  }

  private setVisual(state: VisualState): void {
    if (this.visual === state) return;
    this.visual = state;
    this.setScale(state === 'down' ? 0.96 : 1);
    this.redraw();
  }

  private iconSize(): number {
    return Math.min(this.config.height * 0.42, 44);
  }

  private layoutLabel(): void {
    const icon = this.config.icon ?? 'none';
    if (!this.labelText || (icon !== 'left' && icon !== 'right')) return;
    const gap = 14;
    const total = this.iconSize() + gap + this.labelText.width;
    const labelCenter = icon === 'left' ? -total / 2 + this.iconSize() + gap + this.labelText.width / 2 : total / 2 - this.iconSize() - gap - this.labelText.width / 2;
    this.labelText.setX(labelCenter);
  }

  private redraw(): void {
    const g = this.bg;
    const { width: w, height: h } = this.config;
    const r = Math.min(18, h * 0.24);
    const accent = this.enabled ? this.config.accent : COLORS.steelLight;
    const intensity = this.visual === 'down' ? 0.45 : this.visual === 'hover' ? 0.28 : 0.16;

    g.clear();
    g.lineStyle(16, accent, this.visual === 'idle' ? 0.05 : 0.1);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, r);
    g.lineStyle(8, accent, this.visual === 'idle' ? 0.1 : 0.18);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, r);

    g.fillStyle(COLORS.panel, 0.94);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, r);
    g.fillStyle(accent, intensity);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, r);
    g.fillStyle(COLORS.white, 0.07);
    g.fillRoundedRect(-w / 2 + 4, -h / 2 + 4, w - 8, h * 0.38, { tl: r - 3, tr: r - 3, bl: 0, br: 0 });

    g.lineStyle(3, accent, 1);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, r);

    const icon = this.currentIcon;
    const size = this.iconSize();
    const labelY = this.labelText?.y ?? 0;
    if (icon === 'pause') {
      const barW = size * 0.24;
      const barH = size * 0.78;
      g.fillStyle(COLORS.white, 1);
      g.fillRoundedRect(-barW * 1.4, -barH / 2, barW, barH, 3);
      g.fillRoundedRect(barW * 0.4, -barH / 2, barW, barH, 3);
    } else if (icon === 'sound' || icon === 'muted') {
      const k = size / 2;
      g.fillStyle(COLORS.white, 1);
      g.fillRect(-k * 0.95, -k * 0.34, k * 0.5, k * 0.68);
      g.fillTriangle(-k * 0.6, 0, k * 0.1, -k * 0.85, k * 0.1, k * 0.85);
      if (icon === 'sound') {
        g.lineStyle(3, COLORS.white, 1);
        g.lineBetween(k * 0.42, -k * 0.34, k * 0.42, k * 0.34);
        g.lineBetween(k * 0.8, -k * 0.62, k * 0.8, k * 0.62);
      } else {
        g.lineStyle(4, COLORS.danger, 1);
        g.lineBetween(k * 0.3, -k * 0.42, k, k * 0.42);
        g.lineBetween(k, -k * 0.42, k * 0.3, k * 0.42);
      }
    } else if ((icon === 'left' || icon === 'right') && this.labelText) {
      const half = this.labelText.width / 2;
      const gap = 14;
      const x = icon === 'left' ? this.labelText.x - half - gap - size / 2 : this.labelText.x + half + gap + size / 2;
      drawArrow(g, x, labelY, size, icon, accent, 1);
    }
  }
}
