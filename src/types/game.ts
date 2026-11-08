/**
 * Core domain types shared by the pure logic systems and the Phaser scenes.
 * Nothing in this file may import Phaser.
 */

/** Colours a parcel can have. Extend this union to add new parcel colours. */
export type ParcelColor = 'BLUE' | 'RED';

/** The two destinations the sorting gate can send a parcel to. */
export type BinSide = 'LEFT' | 'RIGHT';

/**
 * Every inspectable attribute of a parcel. Sorting rules match against these
 * keys, so adding e.g. `shape` here makes it immediately usable by rules.
 */
export interface ParcelAttributes {
  readonly color: ParcelColor;
}

export type ParcelAttributeKey = keyof ParcelAttributes;

export interface Parcel {
  /** Unique, monotonically increasing per run. */
  readonly id: number;
  readonly attributes: ParcelAttributes;
}

/** High-level application states. */
export type GameState = 'MENU' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';

export type MistakeReason = 'WRONG_BIN' | 'MISSED';

/** Statistics produced by a finished run. */
export interface RunStats {
  readonly score: number;
  readonly correctCount: number;
  readonly mistakeCount: number;
  readonly parcelsResolved: number;
}

/** Data handed to the Game Over screen. */
export interface GameOverData extends RunStats {
  readonly bestScore: number;
  readonly isNewBest: boolean;
}
