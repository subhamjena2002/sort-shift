import Phaser from 'phaser';
import type { Parcel } from '../../types/game';
import { PARCEL_COLORS, parcelTextureKey } from '../data/parcelCatalog';
import type { Point } from '../ui/layout';
import { applyParcelLabel, createParcelLabel } from '../ui/ParcelPreview';
import { PARCEL_TEXTURE_SIZE, TEXTURES } from '../ui/textures';
import { COLORS, DEPTH } from '../ui/theme';

const IDLE_GLOW = 0.5;
const ZONE_GLOW = 0.95;
const GOLDEN_GLOW = 1;

/**
 * Reusable on-screen representation of a parcel (shadow, glow, body, label).
 * Instances are pooled by the scene: `present()` assigns a parcel, the sort /
 * miss animations end by calling `release()`, after which the view is free.
 * All attributes come from the Parcel, so the logic never knows about visuals.
 */
export class ParcelView {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly shadow: Phaser.GameObjects.Image;
  private readonly trail: Phaser.GameObjects.Image;
  private readonly glow: Phaser.GameObjects.Image;
  private readonly rays: Phaser.GameObjects.Image;
  private readonly body: Phaser.GameObjects.Image;
  private readonly goldRim: Phaser.GameObjects.Image;
  private readonly label: Phaser.GameObjects.Text;
  private readonly baseScale: number;
  private currentId: number | null = null;
  private laneX = 0;

  constructor(scene: Phaser.Scene, displaySize: number) {
    this.scene = scene;
    this.baseScale = displaySize / PARCEL_TEXTURE_SIZE;

    this.shadow = new Phaser.GameObjects.Image(scene, 8, 12, TEXTURES.parcelShadow);
    // Soft streak behind the parcel, showing which way and how fast it travels.
    this.trail = new Phaser.GameObjects.Image(scene, 0, -PARCEL_TEXTURE_SIZE * 0.72, TEXTURES.parcelGlow)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(0.5, 0.95)
      .setAlpha(0.22);
    this.glow = new Phaser.GameObjects.Image(scene, 0, 0, TEXTURES.parcelGlow)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(IDLE_GLOW);
    this.rays = new Phaser.GameObjects.Image(scene, 0, 0, TEXTURES.goldRays)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setVisible(false);
    this.body = new Phaser.GameObjects.Image(scene, 0, 0, PARCEL_COLORS.BLUE.textureKey);
    this.goldRim = new Phaser.GameObjects.Image(scene, 0, 0, TEXTURES.goldRimSquare).setVisible(false);
    this.label = createParcelLabel(scene);

    this.container = scene.add
      .container(0, 0, [this.shadow, this.trail, this.glow, this.rays, this.body, this.goldRim, this.label])
      .setDepth(DEPTH.parcel)
      .setVisible(false);
  }

  get isFree(): boolean {
    return this.currentId === null;
  }

  get parcelId(): number | null {
    return this.currentId;
  }

  get x(): number {
    return this.container.x;
  }

  get y(): number {
    return this.container.y;
  }

  /** Show a parcel at the given position. `dropIn` plays the arrival from the hatch. */
  present(parcel: Parcel, x: number, y: number, dropIn = true): void {
    const { color, shape } = parcel.attributes;
    const def = PARCEL_COLORS[color];
    const golden = parcel.kind === 'GOLDEN';
    this.scene.tweens.killTweensOf(this.container);
    this.currentId = parcel.id;
    this.laneX = x;

    this.body.setTexture(parcelTextureKey(color, shape)).clearTint();
    this.shadow.setTexture(shape === 'CIRCLE' ? TEXTURES.parcelShadowCircle : TEXTURES.parcelShadow);
    this.trail.setTint(golden ? COLORS.gold : def.fill);
    this.glow.setTint(golden ? COLORS.gold : def.fill).setAlpha(golden ? GOLDEN_GLOW : IDLE_GLOW);
    this.rays.setVisible(golden).setAngle(0);
    this.goldRim.setVisible(golden).setTexture(shape === 'CIRCLE' ? TEXTURES.goldRimCircle : TEXTURES.goldRimSquare);
    applyParcelLabel(this.label, parcel.attributes);

    this.container
      .setPosition(x, y)
      .setScale(dropIn ? this.baseScale * 1.25 : this.baseScale)
      .setAngle(0)
      .setAlpha(dropIn ? 0 : 1)
      .setVisible(true);
    if (dropIn) {
      this.scene.tweens.add({ targets: this.container, alpha: 1, scale: this.baseScale, duration: 200, ease: 'Back.easeOut' });
    }
  }

  /** Place the parcel along the belt, with a slight sway so it feels carried. */
  setBeltPosition(y: number, progress: number): void {
    this.container.y = y;
    this.container.x = this.laneX + Math.sin(progress * 9) * 2;
    this.container.angle = Math.sin(progress * 13) * 1.4;
    if (this.rays.visible) this.rays.angle = progress * 240;
  }

  /** One-shot highlight when the parcel reaches the sort zone. */
  enterZone(): void {
    this.glow.setAlpha(ZONE_GLOW);
    this.scene.tweens.add({ targets: this.container, scale: this.baseScale * 1.09, duration: 110, yoyo: true, ease: 'Quad.easeOut' });
  }

  /** Slide into a bin, then shrink away. */
  playSorted(target: Point, correct: boolean, onComplete: () => void): void {
    this.scene.tweens.killTweensOf(this.container);
    this.container.setAlpha(1).setScale(this.baseScale);
    this.trail.setAlpha(0);
    if (!correct) this.body.setTint(0xff8a7a);
    const direction = target.x < this.container.x ? -1 : 1;
    this.scene.tweens.add({
      targets: this.container,
      x: target.x,
      y: target.y,
      angle: direction * (correct ? 10 : 22),
      duration: 260,
      ease: correct ? 'Cubic.easeOut' : 'Bounce.easeOut',
      onComplete: () => {
        this.scene.tweens.add({
          targets: this.container,
          scale: this.baseScale * (correct ? 0.45 : 0.75),
          alpha: 0,
          duration: 170,
          ease: 'Quad.easeIn',
          onComplete: () => {
            this.release();
            onComplete();
          },
        });
      },
    });
  }

  /** Slide off the end of the belt into the reject chute. */
  playMissed(targetY: number, onComplete: () => void): void {
    this.scene.tweens.killTweensOf(this.container);
    this.container.setAlpha(1).setScale(this.baseScale);
    this.scene.tweens.add({
      targets: this.container,
      y: targetY,
      scale: this.baseScale * 0.7,
      alpha: 0,
      angle: 8,
      duration: 420,
      ease: 'Quad.easeIn',
      onComplete: () => {
        this.release();
        onComplete();
      },
    });
  }

  /** Hide immediately and return to the pool. */
  release(): void {
    this.scene.tweens.killTweensOf(this.container);
    this.currentId = null;
    this.container.setVisible(false);
    this.trail.setAlpha(0.22);
  }

  destroy(): void {
    this.scene.tweens.killTweensOf(this.container);
    this.container.destroy();
    this.currentId = null;
  }
}
