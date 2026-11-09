import Phaser from 'phaser';
import { TEXTURES } from './textures';
import { COLORS, CSS, DEPTH, textStyle } from './theme';

/**
 * Transient feedback: floating "+10"/"MISS" popups (pooled), a centre banner
 * and particle bursts. Everything is reused, nothing is created per event
 * except tweens.
 */
export class FeedbackLayer {
  private readonly scene: Phaser.Scene;
  private readonly popups: Phaser.GameObjects.Text[] = [];
  private readonly banner: Phaser.GameObjects.Text;
  private readonly successBurst: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly failBurst: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly goldenBurst: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly stampImage: Phaser.GameObjects.Image;
  private nextPopup = 0;

  constructor(scene: Phaser.Scene, bannerX: number, bannerY: number, uiScale: number) {
    this.scene = scene;
    for (let i = 0; i < 8; i += 1) {
      const text = scene.add
        .text(0, 0, '', textStyle({ font: 'display', size: 34 * uiScale, weight: '900', color: CSS.success, glow: CSS.success, glowBlur: 10 }))
        .setOrigin(0.5)
        .setDepth(DEPTH.feedback)
        .setVisible(false);
      this.popups.push(text);
    }
    this.banner = scene.add
      .text(bannerX, bannerY, '', textStyle({ font: 'display', size: 46 * uiScale, weight: '900', color: CSS.white, glow: CSS.cyan, glowBlur: 18, align: 'center', letterSpacing: 4 }))
      .setOrigin(0.5)
      .setDepth(DEPTH.feedback)
      .setVisible(false);

    const burstConfig = (tint: number): Phaser.Types.GameObjects.Particles.ParticleEmitterConfig => ({
      speed: { min: 120, max: 360 },
      angle: { min: 0, max: 360 },
      lifespan: { min: 380, max: 680 },
      scale: { start: 1.1, end: 0 },
      alpha: { start: 1, end: 0 },
      rotate: { min: 0, max: 360 },
      blendMode: Phaser.BlendModes.ADD,
      tint,
      emitting: false,
    });
    this.successBurst = scene.add.particles(0, 0, TEXTURES.spark, burstConfig(COLORS.success)).setDepth(DEPTH.feedback);
    this.failBurst = scene.add.particles(0, 0, TEXTURES.spark, burstConfig(COLORS.danger)).setDepth(DEPTH.feedback);
    this.goldenBurst = scene.add.particles(0, 0, TEXTURES.spark, burstConfig(COLORS.gold)).setDepth(DEPTH.feedback);
    this.stampImage = scene.add.image(0, 0, TEXTURES.stampCorrect).setDepth(DEPTH.feedback).setVisible(false);
  }

  /** Check mark or cross over the bin, so the result never depends on colour alone. */
  stamp(x: number, y: number, success: boolean): void {
    const image = this.stampImage;
    this.scene.tweens.killTweensOf(image);
    image
      .setTexture(success ? TEXTURES.stampCorrect : TEXTURES.stampWrong)
      .setPosition(x, y)
      .setScale(1.5)
      .setAlpha(1)
      .setAngle(success ? -8 : 8)
      .setVisible(true);
    this.scene.tweens.add({ targets: image, scale: 1, duration: 130, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: image, alpha: 0, delay: 340, duration: 200, onComplete: () => image.setVisible(false) });
  }

  popup(x: number, y: number, message: string, color: string): void {
    const text = this.popups[this.nextPopup];
    this.nextPopup = (this.nextPopup + 1) % this.popups.length;
    if (!text) return;
    this.scene.tweens.killTweensOf(text);
    text
      .setText(message)
      .setColor(color)
      .setShadow(0, 0, color, 10, true, true)
      .setPosition(x, y)
      .setAlpha(1)
      .setScale(0.6)
      .setVisible(true);
    this.scene.tweens.add({ targets: text, scale: 1, duration: 160, ease: 'Back.easeOut' });
    this.scene.tweens.add({
      targets: text,
      y: y - 70,
      alpha: 0,
      delay: 260,
      duration: 520,
      ease: 'Cubic.easeIn',
      onComplete: () => text.setVisible(false),
    });
  }

  showBanner(message: string, color: string, holdMs = 700): void {
    this.scene.tweens.killTweensOf(this.banner);
    this.banner
      .setText(message)
      .setColor(color)
      .setShadow(0, 0, color, 18, true, true)
      .setAlpha(0)
      .setScale(0.8)
      .setVisible(true);
    this.scene.tweens.add({ targets: this.banner, alpha: 1, scale: 1, duration: 220, ease: 'Back.easeOut' });
    this.scene.tweens.add({
      targets: this.banner,
      alpha: 0,
      delay: 220 + holdMs,
      duration: 260,
      onComplete: () => this.banner.setVisible(false),
    });
  }

  burst(x: number, y: number, success: boolean): void {
    (success ? this.successBurst : this.failBurst).explode(success ? 18 : 24, x, y);
  }

  /** The golden parcel's own celebration. */
  goldBurst(x: number, y: number): void {
    this.goldenBurst.explode(36, x, y);
  }

  destroy(): void {
    this.scene.tweens.killTweensOf([...this.popups, this.banner, this.stampImage]);
    this.stampImage.destroy();
    for (const text of this.popups) text.destroy();
    this.popups.length = 0;
    this.banner.destroy();
    this.successBurst.destroy();
    this.failBurst.destroy();
    this.goldenBurst.destroy();
  }
}
