/**
 * Core domain types shared by the pure logic systems and the Phaser scenes.
 * Nothing in this file may import Phaser.
 */

/** Colours a parcel can have. Extend this union to add new parcel colours. */
export type ParcelColor = 'BLUE' | 'RED' | 'YELLOW' | 'GREEN';

/** Shapes a parcel can have. */
export type ParcelShape = 'CIRCLE' | 'SQUARE';

/** The two destinations the sorting gate can send a parcel to. */
export type BinSide = 'LEFT' | 'RIGHT';

/** Every inspectable attribute of a parcel. Sorting rules match against these keys. */
export interface ParcelAttributes {
  readonly color: ParcelColor;
  readonly shape: ParcelShape;
}

export type ParcelAttributeKey = keyof ParcelAttributes;

/** Attributes as seen by rule matching; absent keys simply never match. */
export type ParcelTraits = Readonly<Partial<ParcelAttributes>>;

/** STANDARD parcels score normally; GOLDEN parcels award a bonus when sorted correctly. */
export type ParcelKind = 'STANDARD' | 'GOLDEN';

export interface Parcel {
  /** Unique, monotonically increasing per run. */
  readonly id: number;
  readonly attributes: ParcelAttributes;
  readonly kind: ParcelKind;
}

/** Categories of sorting rule used by the shift progression. */
export type RuleMode = 'COLOR' | 'SHAPE' | 'REVERSE' | 'COMBINATION';

/** High-level application states. */
export type GameState = 'MENU' | 'PLAYING' | 'SHIFT_ANNOUNCEMENT' | 'COUNTDOWN' | 'PAUSED' | 'GAME_OVER';

export type MistakeReason = 'WRONG_BIN' | 'MISSED';

/** Statistics produced by a finished run. */
export interface RunStats {
  readonly score: number;
  readonly correctCount: number;
  readonly mistakeCount: number;
  readonly parcelsResolved: number;
  /** The remaining fields are only present for runs played through shifts. */
  readonly shiftReached?: number;
  readonly shiftsCompleted?: number;
  readonly perfectShifts?: number;
  readonly bestStreak?: number;
}

/** Data handed to the Game Over screen. */
export interface GameOverData extends RunStats {
  readonly bestScore: number;
  readonly isNewBest: boolean;
}
