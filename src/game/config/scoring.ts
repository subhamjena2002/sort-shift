/** Scoring and failure constants for a run. */
export const SCORING = {
  /** Points awarded for each correctly sorted parcel. */
  pointsPerCorrect: 10,
  /** Mistakes allowed; reaching this number ends the run. */
  maxMistakes: 3,
} as const;

export interface ComboTier {
  /** Consecutive correct sorts needed to reach this tier. */
  readonly streak: number;
  readonly multiplier: number;
}

export interface ComboConfig {
  /** Multiplier tiers above the implicit ×1. */
  readonly tiers: readonly ComboTier[];
  /** A streak bonus is paid every N consecutive correct sorts. */
  readonly streakBonusEvery: number;
  /** Points per milestone reached, so longer streaks pay more. */
  readonly streakBonusPerMilestone: number;
  readonly maxStreakBonus: number;
}

export const DEFAULT_COMBO: ComboConfig = {
  tiers: [
    { streak: 5, multiplier: 2 },
    { streak: 10, multiplier: 3 },
    { streak: 20, multiplier: 4 },
  ],
  streakBonusEvery: 5,
  streakBonusPerMilestone: 10,
  maxStreakBonus: 100,
};

export interface BonusConfig {
  /** Perfect-shift bonus for shift 1. */
  readonly perfectShiftBase: number;
  /** Added for every shift after the first. */
  readonly perfectShiftPerShift: number;
  readonly perfectShiftMax: number;
  /** Flat bonus for correctly sorting a golden parcel. */
  readonly goldenBonus: number;
}

export const DEFAULT_BONUSES: BonusConfig = {
  perfectShiftBase: 100,
  perfectShiftPerShift: 20,
  perfectShiftMax: 400,
  goldenBonus: 50,
};

export interface GoldenParcelConfig {
  /** First shift in which golden parcels can appear. */
  readonly unlockShift: number;
  /** Chance per eligible spawn, 0–1. */
  readonly spawnChance: number;
  /** Minimum ordinary parcels between two golden ones. */
  readonly minParcelsBetween: number;
  readonly maxPerShift: number;
}

export const DEFAULT_GOLDEN: GoldenParcelConfig = {
  unlockShift: 3,
  spawnChance: 0.15,
  minParcelsBetween: 4,
  maxPerShift: 2,
};
