import type { BinSide } from '../../types/game';

/**
 * Pure layout calculation for both supported design orientations.
 * All boxes are centre-anchored. No Phaser imports so it can be unit-tested.
 */
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface BeltLayout {
  /** Centre x of the belt. */
  readonly x: number;
  readonly width: number;
  /** Top edge of the belt (under the inbound hatch). */
  readonly topY: number;
  /** Y of the end roller; the reject chute starts just below. */
  readonly endY: number;
  /** Where a missed parcel falls to. */
  readonly rejectY: number;
  /** Parcel centre at progress 0. */
  readonly spawnY: number;
  /** Parcel centre at progress 1 — the decision line. */
  readonly decisionY: number;
  /** Top of the highlighted decision zone. */
  readonly zoneTopY: number;
  /** Parcel edge length in design pixels. */
  readonly parcelSize: number;
}

export type Orientation = 'landscape' | 'portrait';

export interface GameLayout {
  readonly width: number;
  readonly height: number;
  readonly orientation: Orientation;
  /** Multiplier for font sizes. */
  readonly uiScale: number;
  /** Top-left anchor of the score block. */
  readonly score: Point;
  readonly scorePanel: Box;
  /** Top-right anchor of the mistakes block. */
  readonly mistakes: Point;
  readonly mistakesPanel: Box;
  readonly pauseButton: Box;
  readonly muteButton: Box;
  readonly rulePanel: Box;
  /** Streak and multiplier readout. */
  readonly comboPanel: Box;
  /** Shift number, mode, quota progress and speed readout. */
  readonly shiftPanel: Box;
  /** Full rule card shown while a new shift is announced. */
  readonly announcement: Box;
  /** Centre of the 3-2-1 countdown. */
  readonly countdown: Point;
  readonly belt: BeltLayout;
  readonly bins: Readonly<Record<BinSide, Box>>;
  readonly buttons: Readonly<Record<BinSide, Box>>;
  /** Centre of the transient message banner. */
  readonly banner: Point;
}

/** Minimum on-screen button height in design pixels (~44pt+ on phones). */
export const MIN_SORT_BUTTON_HEIGHT = 100;

function belt(
  x: number,
  width: number,
  topY: number,
  decisionY: number,
  endY: number,
  rejectY: number,
  parcelSize: number,
  zoneStart: number,
): BeltLayout {
  const spawnY = topY + parcelSize / 2 + 26;
  return {
    x,
    width,
    topY,
    endY,
    rejectY,
    spawnY,
    decisionY,
    zoneTopY: spawnY + (decisionY - spawnY) * zoneStart,
    parcelSize,
  };
}

function landscape(width: number, height: number, zoneStart: number): GameLayout {
  const cx = width / 2;
  const binOffset = 310;
  return {
    width,
    height,
    orientation: 'landscape',
    uiScale: 1,
    score: { x: 36, y: 16 },
    scorePanel: { x: 160, y: 72, width: 280, height: 124 },
    mistakes: { x: width - 122, y: 20 },
    mistakesPanel: { x: width - 208, y: 72, width: 196, height: 124 },
    pauseButton: { x: width - 62, y: 58, width: 72, height: 72 },
    muteButton: { x: width - 62, y: 144, width: 64, height: 64 },
    rulePanel: { x: cx, y: 54, width: 620, height: 88 },
    comboPanel: { x: cx - binOffset, y: 232, width: 210, height: 130 },
    shiftPanel: { x: cx + binOffset, y: 232, width: 210, height: 130 },
    announcement: { x: cx, y: 360, width: 1060, height: 696 },
    countdown: { x: cx, y: 372 },
    belt: belt(cx, 196, 144, 560, 646, 700, 104, zoneStart),
    bins: {
      LEFT: { x: cx - binOffset, y: 440, width: 250, height: 212 },
      RIGHT: { x: cx + binOffset, y: 440, width: 250, height: 212 },
    },
    buttons: {
      LEFT: { x: cx - binOffset, y: 634, width: 300, height: 112 },
      RIGHT: { x: cx + binOffset, y: 634, width: 300, height: 112 },
    },
    banner: { x: cx, y: 300 },
  };
}

function portrait(width: number, height: number, zoneStart: number): GameLayout {
  const cx = width / 2;
  return {
    width,
    height,
    orientation: 'portrait',
    uiScale: 1.15,
    score: { x: 36, y: 14 },
    scorePanel: { x: 174, y: 74, width: 308, height: 132 },
    mistakes: { x: 518, y: 18 },
    mistakesPanel: { x: 430, y: 74, width: 200, height: 132 },
    pauseButton: { x: width - 62, y: 72, width: 80, height: 80 },
    muteButton: { x: width - 146, y: 72, width: 72, height: 72 },
    rulePanel: { x: cx, y: 224, width: 648, height: 112 },
    comboPanel: { x: 122, y: 460, width: 196, height: 150 },
    shiftPanel: { x: width - 122, y: 460, width: 196, height: 150 },
    announcement: { x: cx, y: 696, width: 688, height: 1152 },
    countdown: { x: cx, y: 600 },
    belt: belt(cx, 200, 322, 880, 962, 1016, 108, zoneStart),
    bins: {
      LEFT: { x: 126, y: 740, width: 204, height: 236 },
      RIGHT: { x: width - 126, y: 740, width: 204, height: 236 },
    },
    buttons: {
      LEFT: { x: 182, y: 1148, width: 328, height: 180 },
      RIGHT: { x: width - 182, y: 1148, width: 328, height: 180 },
    },
    banner: { x: cx, y: 520 },
  };
}

/** Compute the layout for a design size. Portrait is used when taller than wide. */
export function computeLayout(width: number, height: number, decisionZoneStart = 0.62): GameLayout {
  return height > width
    ? portrait(width, height, decisionZoneStart)
    : landscape(width, height, decisionZoneStart);
}

/** Map belt progress (0–1) to the parcel's y position. */
export function beltProgressToY(beltLayout: BeltLayout, progress: number): number {
  return beltLayout.spawnY + (beltLayout.decisionY - beltLayout.spawnY) * progress;
}

/** True when the box lies fully within a width × height area. */
export function boxFits(box: Box, width: number, height: number): boolean {
  return (
    box.x - box.width / 2 >= 0 &&
    box.x + box.width / 2 <= width &&
    box.y - box.height / 2 >= 0 &&
    box.y + box.height / 2 <= height
  );
}

/** Vertical clearance between the rule panel and the top of the inbound hatch. */
export const HATCH_HEIGHT_ABOVE_BELT = 34;
