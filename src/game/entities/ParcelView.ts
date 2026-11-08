import Phaser from 'phaser';
import type { Parcel } from '../../types/game';
import { PARCEL_COLORS } from '../data/parcelCatalog';
import type { Point } from '../ui/layout';
import { PARCEL_TEXTURE_SIZE, TEXTURES } from '../ui/textures';
import { DEPTH, textStyle } from '../ui/theme';

/**
 * Reusable on-screen representation of a parcel (shadow, glow, body, label).
 * Instances are pooled by the scene: `present()` assigns a parcel, the sort /
 * miss animations end by calling `release()`, after which the view is free.
 */
export class ParcelView {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly glow: Phaser.GameObjects.Image;
  private readonly body: Phaser.GameObjects.Image;
  private readonly label: Phaser.GameObjects.Text;
  private readonly baseScale: number;
  private currentId: number | null = null;

  constructor(scene: Phaser.Scene, displaySize: number) {
    this.scene = scene;
    this.baseScale = displaySize / PARCEL_TEXTURE_SIZE;

    const shadow = new Phaser.GameObjects.Image(scene, 8, 12, TEXTURES.parcelShadow);
    this.glow = new Phaser.GameObjects.Image(scene, 0, 0, TEXTURES.parcelGlow)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.5);
    this.body = new Phaser.GameObjects.Image(scene, 0, 0, PARCEL_COLORS.BLUE.textureKey);
    this.label = new Phaser.GameObjects.Text(
      scene,
      0,
      -4,
      '',
      textStyle({ font: 'display', size: 20, weight: '900', color: '#0a1022', letterSpacing: 2 }),
    ).setOrigin(0.5);

    this.container = scene.add
      .container(0, 0, [shadow, this.glow, this.body, this.label])
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

  /** Show a newly spawned parcel at the given position. */
  present(parcel: Parcel, x: number, y: number): void {
    const def = PARCEL_COLORS[parcel.attributes.color];
    this.scene.tweens.killTweensOf(this.container);
    this.currentId = parcel.id;
    this.body.setTexture(def.textureKey);
    this.glow.setTint(def.fill);
    this.label.setText(def.label);
    this.container
      .setPosition(x, y)
      .setScale(this.baseScale)
      .setAngle(0)
      .setAlpha(0)
      .setVisible(true);
    this.scene.tweens.add({ targets: this.container, alpha: 1, duration: 160, ease: 'Linear' });
  }

  setY(y: number): void {
    this.container.y = y;
  }

  /** Slide into a bin, then shrink away. */
  playSorted(target: Point, correct: boolean, onComplete: () => void): void {
    this.scene.tweens.killTweensOf(this.container);
    this.container.setAlpha(1);
    const direction = target.x < this.container.x ? -1 : 1;
    this.scene.tweens.add({
      targets: this.container,
      x: target.x,
      y: target.y,
      angle: direction * (correct ? 10 : 22),
      duration: 260,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        this.scene.tweens.add({
          targets: this.container,
          scale: this.baseScale * 0.45,
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
    this.container.setAlpha(1);
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
  }

  destroy(): void {
    this.scene.tweens.killTweensOf(this.container);
    this.container.destroy();
    this.currentId = null;
  }
}
