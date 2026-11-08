import Phaser from 'phaser';
import { PARCEL_COLORS } from '../data/parcelCatalog';
import { bindMenuKeys } from '../systems/InputController';
import { watchLayout } from '../systems/ResponsiveScaler';
import { Backdrop } from '../ui/Backdrop';
import { NeonButton } from '../ui/NeonButton';
import { drawPanel } from '../ui/Panel';
import { PARCEL_TEXTURE_SIZE, TEXTURES } from '../ui/textures';
import { COLORS, CSS, DEPTH, textStyle } from '../ui/theme';
import { fadeIn, SceneDirector } from './SceneDirector';
import { SceneKeys } from './SceneKeys';

interface MenuLayout {
  readonly titleY: number;
  readonly titleSize: number;
  readonly subtitleY: number;
  readonly playY: number;
  readonly playW: number;
  readonly playH: number;
  readonly bestY: number;
  readonly controlsY: number;
  readonly controlsW: number;
  readonly controlsH: number;
  readonly stackedControls: boolean;
  readonly parcelOffsetX: number;
  readonly parcelY: number;
  readonly uiScale: number;
}

function menuLayout(width: number, height: number): MenuLayout {
  if (height > width) {
    return {
      titleY: 330, titleSize: 76, subtitleY: 410, playY: 620, playW: 460, playH: 140, bestY: 730,
      controlsY: 950, controlsW: 640, controlsH: 270, stackedControls: true,
      parcelOffsetX: 170, parcelY: 190, uiScale: 1.15,
    };
  }
  return {
    titleY: 190, titleSize: 96, subtitleY: 270, playY: 400, playW: 380, playH: 112, bestY: 492,
    controlsY: 606, controlsW: 820, controlsH: 150, stackedControls: false,
    parcelOffsetX: 470, parcelY: 210, uiScale: 1,
  };
}

/** MENU state: title, play, best score and controls. */
export class MenuScene extends Phaser.Scene {
  private backdrop: Backdrop | null = null;

  constructor() {
    super(SceneKeys.MENU);
  }

  create(): void {
    const director = SceneDirector.from(this);
    const { width, height } = this.scale;
    const L = menuLayout(width, height);
    const cx = width / 2;
    const play = (): void => {
      director.startRun(this);
    };

    this.backdrop = new Backdrop(this, width, height);

    // Decorative parcels either side of the title.
    const parcelScale = (L.uiScale * 120) / PARCEL_TEXTURE_SIZE;
    [
      { x: cx - L.parcelOffsetX, key: PARCEL_COLORS.BLUE.textureKey, tint: PARCEL_COLORS.BLUE.fill, angle: -12, delay: 0 },
      { x: cx + L.parcelOffsetX, key: PARCEL_COLORS.RED.textureKey, tint: PARCEL_COLORS.RED.fill, angle: 10, delay: 600 },
    ].forEach((p) => {
      const glow = this.add.image(p.x, L.parcelY, TEXTURES.parcelGlow).setBlendMode(Phaser.BlendModes.ADD).setTint(p.tint).setAlpha(0.6).setScale(parcelScale * 1.2).setDepth(DEPTH.machinery);
      const parcel = this.add.image(p.x, L.parcelY, p.key).setScale(parcelScale).setAngle(p.angle).setDepth(DEPTH.machinery);
      this.tweens.add({ targets: [parcel, glow], y: L.parcelY - 16, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: p.delay });
      this.tweens.add({ targets: parcel, angle: p.angle * -0.4, duration: 2400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: p.delay });
    });

    this.add
      .text(cx, L.titleY, 'SORT SHIFT', textStyle({ font: 'display', size: L.titleSize, weight: '900', color: CSS.white, glow: CSS.cyan, glowBlur: 26, letterSpacing: 6 }))
      .setOrigin(0.5)
      .setDepth(DEPTH.hud);
    this.add
      .text(cx, L.subtitleY, 'NEON PARCEL DEPOT', textStyle({ font: 'display', size: 28 * L.uiScale, weight: '700', color: CSS.magenta, glow: CSS.magenta, glowBlur: 12, letterSpacing: 10 }))
      .setOrigin(0.5)
      .setDepth(DEPTH.hud);

    const playButton = new NeonButton(this, {
      x: cx, y: L.playY, width: L.playW, height: L.playH,
      label: 'PLAY', sublabel: 'PRESS ENTER', accent: COLORS.cyan,
      fontSize: Math.round(44 * L.uiScale), fireOn: 'up', onActivate: play,
    }).setDepth(DEPTH.controls);
    this.tweens.add({ targets: playButton, scale: 1.035, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    const best = director.highScores.getBest();
    this.add
      .text(cx, L.bestY, best > 0 ? `BEST SHIFT   ${best}` : 'NO SHIFT RECORDED YET', textStyle({ size: 26 * L.uiScale, color: CSS.amber, letterSpacing: 4 }))
      .setOrigin(0.5)
      .setDepth(DEPTH.hud);

    this.buildControls(cx, L);

    bindMenuKeys(this, { ENTER: play, SPACE: play });
    watchLayout(this, () => this.scene.restart());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.backdrop?.destroy();
      this.backdrop = null;
    });
    fadeIn(this);
  }

  private buildControls(cx: number, L: MenuLayout): void {
    const g = this.add.graphics().setDepth(DEPTH.hud);
    drawPanel(g, cx, L.controlsY, L.controlsW, L.controlsH, { accent: COLORS.panelEdge, radius: 16, glow: false });

    const top = L.controlsY - L.controlsH / 2;
    this.add
      .text(cx, top + 14, 'HOW TO PLAY', textStyle({ size: 17 * L.uiScale, color: CSS.cyan, letterSpacing: 6 }))
      .setOrigin(0.5, 0)
      .setDepth(DEPTH.hud);

    const entries: ReadonlyArray<readonly [string, string]> = [
      ['←  /  A', 'LEFT BIN'],
      ['→  /  D', 'RIGHT BIN'],
      ['ESC  /  P', 'PAUSE'],
    ];
    const keyStyle = textStyle({ font: 'display', size: 20 * L.uiScale, weight: '700', color: CSS.white });
    const actStyle = textStyle({ size: 20 * L.uiScale, color: CSS.textDim, letterSpacing: 3 });

    if (L.stackedControls) {
      entries.forEach(([key, action], i) => {
        const y = top + 72 + i * 50;
        this.add.text(cx - 20, y, key, keyStyle).setOrigin(1, 0.5).setDepth(DEPTH.hud);
        this.add.text(cx + 20, y, action, actStyle).setOrigin(0, 0.5).setDepth(DEPTH.hud);
      });
    } else {
      const colW = L.controlsW / entries.length;
      entries.forEach(([key, action], i) => {
        const x = cx - L.controlsW / 2 + colW * (i + 0.5);
        this.add.text(x, top + 56, key, keyStyle).setOrigin(0.5).setDepth(DEPTH.hud);
        this.add.text(x, top + 84, action, actStyle).setOrigin(0.5).setDepth(DEPTH.hud);
      });
    }

    this.add
      .text(cx, top + L.controlsH - 14, 'The sorting rule changes every shift. Follow the rule card and sort before the magenta line.', textStyle({ size: 16 * L.uiScale, color: CSS.textDim, align: 'center', letterSpacing: 1 }))
      .setOrigin(0.5, 1)
      .setWordWrapWidth(L.controlsW - 40)
      .setDepth(DEPTH.hud);
  }
}
