import Phaser from 'phaser';
import { TEXTURES } from './textures';
import { COLORS, DEPTH } from './theme';

/**
 * Static factory-floor background: gradient wall, floor grid, wall panels,
 * pipes, ceiling light strips, hazard edge and a few blinking status lamps.
 * Drawn once; only the lamps animate.
 */
export class Backdrop {
  private readonly scene: Phaser.Scene;
  private readonly objects: Phaser.GameObjects.GameObject[] = [];
  private readonly lamps: Phaser.GameObjects.Image[] = [];

  constructor(scene: Phaser.Scene, width: number, height: number) {
    this.scene = scene;

    const g = scene.add.graphics().setDepth(DEPTH.backdrop);
    this.objects.push(g);

    // Wall gradient.
    g.fillGradientStyle(COLORS.bgNavyLight, COLORS.bgNavyLight, COLORS.bgDeep, COLORS.bgDeep, 1);
    g.fillRect(0, 0, width, height);

    // Floor grid.
    const grid = 64;
    g.lineStyle(1, COLORS.cyan, 0.045);
    for (let x = (width / 2) % grid; x < width; x += grid) g.lineBetween(x, 0, x, height);
    for (let y = 0; y < height; y += grid) g.lineBetween(0, y, width, y);

    // Wall panels along the upper area.
    const panelW = 150;
    const panelTop = height * 0.12;
    const panelH = height * 0.3;
    for (let x = -20; x < width; x += panelW + 14) {
      g.fillStyle(COLORS.steelDark, 0.55);
      g.fillRect(x, panelTop, panelW, panelH);
      g.lineStyle(1, COLORS.steelLight, 0.25);
      g.strokeRect(x, panelTop, panelW, panelH);
      g.lineStyle(1, COLORS.steelLight, 0.12);
      g.lineBetween(x + 12, panelTop + panelH * 0.5, x + panelW - 12, panelTop + panelH * 0.5);
    }

    // Horizontal pipes.
    const pipeY = panelTop + panelH + 18;
    g.fillStyle(COLORS.steel, 0.8);
    g.fillRect(0, pipeY, width, 10);
    g.fillStyle(COLORS.steelHighlight, 0.35);
    g.fillRect(0, pipeY + 2, width, 2);
    g.fillStyle(COLORS.steel, 0.6);
    g.fillRect(0, pipeY + 18, width, 6);
    for (let x = 40; x < width; x += 180) {
      g.fillStyle(COLORS.steelLight, 0.7);
      g.fillRect(x, pipeY - 3, 12, 30);
    }

    // Ceiling light strips.
    g.fillStyle(COLORS.cyan, 0.12);
    g.fillRect(0, 0, width, 4);
    g.lineStyle(2, COLORS.cyan, 0.35);
    g.lineBetween(width * 0.08, 8, width * 0.3, 8);
    g.lineBetween(width * 0.7, 8, width * 0.92, 8);

    // Hazard stripes along the bottom edge.
    const stripeH = 12;
    g.fillStyle(COLORS.amber, 0.14);
    for (let x = -stripeH; x < width + stripeH; x += 28) {
      g.fillTriangle(x, height, x + 14, height, x + 14 + stripeH, height - stripeH);
      g.fillTriangle(x, height, x + stripeH, height - stripeH, x + 14 + stripeH, height - stripeH);
    }

    // Vignette: darken the top and bottom bands.
    g.fillGradientStyle(COLORS.bgDeep, COLORS.bgDeep, COLORS.bgDeep, COLORS.bgDeep, 0.7, 0.7, 0, 0);
    g.fillRect(0, 0, width, height * 0.12);
    g.fillGradientStyle(COLORS.bgDeep, COLORS.bgDeep, COLORS.bgDeep, COLORS.bgDeep, 0, 0, 0.8, 0.8);
    g.fillRect(0, height * 0.8, width, height * 0.2);

    // Ambient neon glows (additive).
    const glowA = scene.add.image(width * 0.15, height * 0.25, TEXTURES.glowDot)
      .setDepth(DEPTH.backdrop).setBlendMode(Phaser.BlendModes.ADD).setTint(COLORS.cyan).setAlpha(0.35).setScale(9, 5);
    const glowB = scene.add.image(width * 0.85, height * 0.25, TEXTURES.glowDot)
      .setDepth(DEPTH.backdrop).setBlendMode(Phaser.BlendModes.ADD).setTint(COLORS.magenta).setAlpha(0.28).setScale(9, 5);
    this.objects.push(glowA, glowB);

    // Blinking status lamps on the wall panels.
    const lampColors = [COLORS.cyan, COLORS.magenta, COLORS.success, COLORS.amber];
    for (let i = 0; i < 6; i += 1) {
      const x = ((i + 0.5) / 6) * width;
      const lamp = scene.add.image(x, panelTop + 16, TEXTURES.glowDot)
        .setDepth(DEPTH.backdrop).setBlendMode(Phaser.BlendModes.ADD)
        .setTint(lampColors[i % lampColors.length] ?? COLORS.cyan).setScale(0.28).setAlpha(0.2);
      this.lamps.push(lamp);
      this.objects.push(lamp);
      scene.tweens.add({
        targets: lamp,
        alpha: { from: 0.15, to: 0.9 },
        duration: 700 + i * 130,
        yoyo: true,
        repeat: -1,
        delay: i * 180,
        ease: 'Sine.easeInOut',
      });
    }
  }

  destroy(): void {
    this.scene.tweens.killTweensOf(this.lamps);
    for (const obj of this.objects) obj.destroy();
    this.objects.length = 0;
    this.lamps.length = 0;
  }
}
