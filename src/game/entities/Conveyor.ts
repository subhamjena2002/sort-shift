import Phaser from 'phaser';
import { HATCH_HEIGHT_ABOVE_BELT, type BeltLayout } from '../ui/layout';
import { drawArrow } from '../ui/Panel';
import { ensureBeltTile, TEXTURES } from '../ui/textures';
import { COLORS, CSS, DEPTH, textStyle } from '../ui/theme';

const RAIL_WIDTH = 24;
const GEAR_SPACING = 62;
const GEAR_RADIUS = 14;

/**
 * The vertical conveyor: housing and rails, a scrolling belt surface, side
 * roller gears and end rollers that turn with the belt, the inbound hatch,
 * the highlighted decision zone and the reject chute.
 *
 * Purely visual — it is driven by `update()` from the scene with the current
 * belt speed, so it stops automatically whenever the scene stops updating.
 */
export class Conveyor {
  private readonly scene: Phaser.Scene;
  private readonly objects: Phaser.GameObjects.GameObject[] = [];
  private readonly surface: Phaser.GameObjects.TileSprite;
  private readonly endRollers: Phaser.GameObjects.TileSprite[] = [];
  private readonly gears: Phaser.GameObjects.Image[] = [];
  private readonly zoneGlow: Phaser.GameObjects.Graphics;
  private readonly gateLine: Phaser.GameObjects.Graphics;
  private readonly rejectFlash: Phaser.GameObjects.Graphics;
  private zoneHeat = 0;
  private clock = 0;

  constructor(scene: Phaser.Scene, belt: BeltLayout, showTransferLanes: { leftX: number; rightX: number; y: number } | null) {
    this.scene = scene;
    const { x, width } = belt;
    const left = x - width / 2;
    const right = x + width / 2;
    const beltH = belt.endY - belt.topY;

    // -------------------------------------------------- housing (static)
    const housing = scene.add.graphics().setDepth(DEPTH.machinery);
    this.objects.push(housing);

    if (showTransferLanes) {
      this.drawTransferLane(housing, showTransferLanes.leftX, left - RAIL_WIDTH, showTransferLanes.y, 'left');
      this.drawTransferLane(housing, right + RAIL_WIDTH, showTransferLanes.rightX, showTransferLanes.y, 'right');
    }

    // Drop shadow under the whole machine.
    housing.fillStyle(0x000000, 0.35);
    housing.fillRoundedRect(left - RAIL_WIDTH - 6, belt.topY - 30, width + RAIL_WIDTH * 2 + 12, beltH + 76, 18);

    // Reject chute below the end roller.
    const chuteTop = belt.endY + 6;
    const chuteBottom = belt.rejectY + 26;
    housing.fillStyle(COLORS.steelDark, 1);
    housing.fillRect(left + 10, chuteTop, width - 20, chuteBottom - chuteTop);
    housing.fillStyle(COLORS.amber, 0.22);
    for (let sx = left + 10; sx < right - 10; sx += 26) {
      housing.fillTriangle(sx, chuteTop, sx + 13, chuteTop, sx, chuteTop + 13);
    }
    housing.lineStyle(2, COLORS.amber, 0.55);
    housing.strokeRect(left + 10, chuteTop, width - 20, chuteBottom - chuteTop);

    // Rails.
    for (const railX of [left - RAIL_WIDTH, right]) {
      housing.fillStyle(COLORS.steel, 1);
      housing.fillRect(railX, belt.topY - 10, RAIL_WIDTH, beltH + 20);
      housing.fillStyle(COLORS.steelHighlight, 0.35);
      housing.fillRect(railX + 2, belt.topY - 10, 3, beltH + 20);
      housing.fillStyle(COLORS.steelDark, 1);
      housing.fillRect(railX + RAIL_WIDTH - 5, belt.topY - 10, 5, beltH + 20);
    }

    // ------------------------------------------- belt surface (scrolls)
    const tileKey = ensureBeltTile(scene, width);
    this.surface = scene.add
      .tileSprite(x, belt.topY + beltH / 2, width, beltH, tileKey)
      .setDepth(DEPTH.belt);
    this.objects.push(this.surface);

    // Inner edge shading so the belt reads as recessed.
    const shade = scene.add.graphics().setDepth(DEPTH.belt);
    shade.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.45, 0, 0.45, 0);
    shade.fillRect(left, belt.topY, 18, beltH);
    shade.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0.45, 0, 0.45);
    shade.fillRect(right - 18, belt.topY, 18, beltH);
    this.objects.push(shade);

    // ------------------------------------------------- decision zone
    this.zoneGlow = scene.add.graphics().setDepth(DEPTH.belt);
    // The zone starts where a parcel's leading edge enters it and ends at the
    // decision line, which a parcel's centre must not cross unsorted.
    const zoneTop = belt.zoneTopY - belt.parcelSize / 2;
    this.zoneGlow.fillStyle(COLORS.magenta, 0.16);
    this.zoneGlow.fillRect(left, zoneTop, width, belt.decisionY - zoneTop);
    this.zoneGlow.lineStyle(2, COLORS.magenta, 0.7);
    const dash = 12;
    for (let dx = left; dx < right; dx += dash * 2) {
      this.zoneGlow.lineBetween(dx, zoneTop, Math.min(right, dx + dash), zoneTop);
    }
    this.zoneGlow.setAlpha(0.35);
    this.objects.push(this.zoneGlow);

    const zoneLabel = scene.add
      .text(x, zoneTop - 4, 'SORT ZONE', textStyle({ size: 15, color: CSS.magenta, letterSpacing: 4 }))
      .setOrigin(0.5, 1)
      .setAlpha(0.85)
      .setDepth(DEPTH.belt);
    this.objects.push(zoneLabel);

    // Decision line ("gate") with outward chevrons, extending over the rails.
    this.gateLine = scene.add.graphics().setDepth(DEPTH.beltOverlay);
    const gateY = belt.decisionY;
    this.gateLine.lineStyle(10, COLORS.magenta, 0.18);
    this.gateLine.lineBetween(left - RAIL_WIDTH - 8, gateY, right + RAIL_WIDTH + 8, gateY);
    this.gateLine.lineStyle(4, COLORS.magenta, 1);
    this.gateLine.lineBetween(left - RAIL_WIDTH - 8, gateY, right + RAIL_WIDTH + 8, gateY);
    drawArrow(this.gateLine, left - RAIL_WIDTH - 22, gateY, 20, 'left', COLORS.magenta, 1);
    drawArrow(this.gateLine, right + RAIL_WIDTH + 22, gateY, 20, 'right', COLORS.magenta, 1);
    this.objects.push(this.gateLine);

    // ------------------------------------------------- rollers (animate)
    for (let gy = belt.topY + 22; gy < belt.endY - 10; gy += GEAR_SPACING) {
      for (const gx of [left - RAIL_WIDTH / 2, right + RAIL_WIDTH / 2]) {
        const gear = scene.add.image(gx, gy, TEXTURES.roller).setDepth(DEPTH.beltOverlay).setScale(0.78);
        this.gears.push(gear);
        this.objects.push(gear);
      }
    }
    for (const ry of [belt.topY, belt.endY]) {
      const roller = scene.add.tileSprite(x, ry, width + 8, 16, TEXTURES.rollerBar).setDepth(DEPTH.beltOverlay);
      this.endRollers.push(roller);
      this.objects.push(roller);
    }

    // Cyan neon strips along the outer rail edges.
    const neon = scene.add.graphics().setDepth(DEPTH.beltOverlay).setBlendMode(Phaser.BlendModes.ADD);
    for (const nx of [left - RAIL_WIDTH - 2, right + RAIL_WIDTH + 2]) {
      neon.lineStyle(9, COLORS.cyan, 0.12);
      neon.lineBetween(nx, belt.topY - 8, nx, belt.endY + 8);
      neon.lineStyle(3, COLORS.cyan, 0.9);
      neon.lineBetween(nx, belt.topY - 8, nx, belt.endY + 8);
    }
    this.objects.push(neon);

    // -------------------------------------------------- inbound hatch
    const hatch = scene.add.graphics().setDepth(DEPTH.beltOverlay);
    const hatchTop = belt.topY - HATCH_HEIGHT_ABOVE_BELT;
    const hatchH = 60;
    hatch.fillStyle(COLORS.steelDark, 1);
    hatch.fillRoundedRect(left - RAIL_WIDTH - 10, hatchTop, width + RAIL_WIDTH * 2 + 20, hatchH, { tl: 12, tr: 12, bl: 4, br: 4 });
    hatch.fillStyle(COLORS.steel, 1);
    hatch.fillRect(left - RAIL_WIDTH - 10, hatchTop + hatchH - 14, width + RAIL_WIDTH * 2 + 20, 14);
    hatch.fillStyle(0x02050c, 1);
    hatch.fillRect(left + 6, hatchTop + hatchH - 10, width - 12, 10);
    hatch.lineStyle(2, COLORS.cyan, 0.8);
    hatch.strokeRoundedRect(left - RAIL_WIDTH - 10, hatchTop, width + RAIL_WIDTH * 2 + 20, hatchH, { tl: 12, tr: 12, bl: 4, br: 4 });
    // Hazard stripes on the hatch lip.
    hatch.fillStyle(COLORS.amber, 0.6);
    for (let hx = left - RAIL_WIDTH; hx < right + RAIL_WIDTH; hx += 22) {
      hatch.fillTriangle(hx, hatchTop + hatchH - 14, hx + 11, hatchTop + hatchH - 14, hx, hatchTop + hatchH);
    }
    this.objects.push(hatch);

    const inbound = scene.add
      .text(x, hatchTop + 18, 'INBOUND', textStyle({ size: 16, color: CSS.cyan, letterSpacing: 6 }))
      .setOrigin(0.5)
      .setDepth(DEPTH.beltOverlay);
    this.objects.push(inbound);

    const reject = scene.add
      .text(x, belt.rejectY + 4, 'REJECT', textStyle({ size: 15, color: CSS.amber, letterSpacing: 6 }))
      .setOrigin(0.5)
      .setAlpha(0.8)
      .setDepth(DEPTH.machinery);
    this.objects.push(reject);

    this.rejectFlash = scene.add.graphics().setDepth(DEPTH.beltOverlay).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
    this.rejectFlash.fillStyle(COLORS.danger, 0.6);
    this.rejectFlash.fillRect(left + 10, chuteTop, width - 20, chuteBottom - chuteTop);
    this.objects.push(this.rejectFlash);
  }

  /**
   * Advance belt animation.
   * @param deltaMs frame time
   * @param pixelsPerMs belt surface speed
   * @param zoneActive whether a parcel is inside the decision zone
   */
  update(deltaMs: number, pixelsPerMs: number, zoneActive: boolean): void {
    const distance = pixelsPerMs * deltaMs;
    this.surface.tilePositionY -= distance;
    for (const roller of this.endRollers) roller.tilePositionY -= distance;
    const spin = distance / GEAR_RADIUS;
    for (const gear of this.gears) gear.rotation += spin;

    this.clock += deltaMs;
    const target = zoneActive ? 1 : 0;
    this.zoneHeat += (target - this.zoneHeat) * Math.min(1, deltaMs / 120);
    const pulse = 0.75 + 0.25 * Math.sin(this.clock / 90);
    this.zoneGlow.setAlpha(0.35 + 0.65 * this.zoneHeat * pulse);
    this.gateLine.setAlpha(0.7 + 0.3 * (zoneActive ? pulse : 1));
  }

  flashReject(): void {
    this.scene.tweens.killTweensOf(this.rejectFlash);
    this.rejectFlash.setAlpha(1);
    this.scene.tweens.add({ targets: this.rejectFlash, alpha: 0, duration: 500, ease: 'Cubic.easeOut' });
  }

  destroy(): void {
    this.scene.tweens.killTweensOf(this.rejectFlash);
    for (const obj of this.objects) obj.destroy();
    this.objects.length = 0;
    this.gears.length = 0;
    this.endRollers.length = 0;
  }

  private drawTransferLane(g: Phaser.GameObjects.Graphics, x1: number, x2: number, y: number, direction: 'left' | 'right'): void {
    const h = 64;
    g.fillStyle(COLORS.steelDark, 0.9);
    g.fillRect(x1, y - h / 2, x2 - x1, h);
    g.lineStyle(2, COLORS.steelLight, 0.6);
    g.lineBetween(x1, y - h / 2, x2, y - h / 2);
    g.lineBetween(x1, y + h / 2, x2, y + h / 2);
    const steps = Math.max(1, Math.floor((x2 - x1) / 34));
    for (let i = 0; i < steps; i += 1) {
      const cx = x1 + ((i + 0.5) * (x2 - x1)) / steps;
      drawArrow(g, cx, y, 18, direction, COLORS.cyan, 0.25);
    }
  }
}
