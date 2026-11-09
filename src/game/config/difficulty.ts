import type { RuleMode } from '../../types/game';

/**
 * How pacing scales from shift to shift. Every value is bounded, so the
 * endless game flattens out at a hard but reactable plateau.
 */
export interface DifficultyScaling {
  /** Travel time of shift 1. */
  readonly baseTravelMs: number;
  /** Floor of the shift-driven travel time, before any per-mode allowance. */
  readonly minTravelMs: number;
  /** Multiplier applied to travel time for each shift reached. */
  readonly travelFactorPerShift: number;
  /** Extra time for rule modes that need more thought. */
  readonly modeTravelAllowance: Readonly<Record<RuleMode, number>>;
  /** The decision time never drops below this, per mode. */
  readonly minDecisionMs: Readonly<Record<RuleMode, number>>;
  /** Extra time fraction per rule mapping beyond the first two. */
  readonly extraClauseAllowance: number;
  /** Raises the decision-time floor per rule mapping beyond the first two. */
  readonly extraClauseFloorMs: number;
  /** Gap between one parcel resolving and the next spawning, in shift 1. */
  readonly baseSpawnGapMs: number;
  readonly minSpawnGapMs: number;
  readonly spawnGapFactorPerShift: number;
}

export const DEFAULT_DIFFICULTY_SCALING: DifficultyScaling = {
  baseTravelMs: 4200,
  minTravelMs: 1500,
  travelFactorPerShift: 0.94,
  modeTravelAllowance: { COLOR: 1, SHAPE: 1, REVERSE: 1.03, COMBINATION: 1.08 },
  minDecisionMs: { COLOR: 1500, SHAPE: 1500, REVERSE: 1700, COMBINATION: 2000 },
  extraClauseAllowance: 0.03,
  extraClauseFloorMs: 150,
  baseSpawnGapMs: 650,
  minSpawnGapMs: 360,
  spawnGapFactorPerShift: 0.96,
};

/**
 * Gameplay pacing. All times are in milliseconds.
 *
 * "Travel time" is how long a parcel takes to go from the spawn point to the
 * decision line — i.e. the full decision window for that parcel.
 */
export interface DifficultyConfig {
  /** Travel time of the very first parcels. */
  readonly baseTravelMs: number;
  /** Fastest the belt is ever allowed to get. */
  readonly minTravelMs: number;
  /** Speed up after every N correct sorts. */
  readonly speedUpEvery: number;
  /** Multiplier applied to travel time at each speed-up step. */
  readonly speedUpFactor: number;
  /** Delay before the first parcel of a run appears. */
  readonly firstSpawnDelayMs: number;
  /** Time reserved for the sort / miss animation once a parcel resolves. */
  readonly resolveDelayMs: number;
  /** Extra gap after the resolve animation before the next parcel spawns. */
  readonly spawnDelayMs: number;
  /**
   * Progress (0–1) at which the parcel enters the highlighted decision zone.
   * Purely informational for the player — choices are accepted earlier too.
   */
  readonly decisionZoneStart: number;
  /** Earliest progress (0–1) at which a choice is accepted. */
  readonly inputOpensAt: number;
  /** Fairness guard: never spawn more than N parcels of one colour in a row. */
  readonly maxSameColorInARow: number;
}

export const DEFAULT_DIFFICULTY: DifficultyConfig = {
  baseTravelMs: 4200,
  minTravelMs: 1600,
  speedUpEvery: 5,
  speedUpFactor: 0.93,
  firstSpawnDelayMs: 900,
  resolveDelayMs: 450,
  spawnDelayMs: 200,
  decisionZoneStart: 0.62,
  inputOpensAt: 0,
  maxSameColorInARow: 3,
};

/** Number of speed-up steps reached after `correctCount` correct sorts. */
export function speedStepFor(correctCount: number, config: DifficultyConfig = DEFAULT_DIFFICULTY): number {
  if (config.speedUpEvery <= 0) return 0;
  return Math.floor(Math.max(0, correctCount) / config.speedUpEvery);
}

/** Travel time for the next parcel given the number of correct sorts so far. */
export function travelTimeFor(correctCount: number, config: DifficultyConfig = DEFAULT_DIFFICULTY): number {
  const steps = speedStepFor(correctCount, config);
  const scaled = config.baseTravelMs * Math.pow(config.speedUpFactor, steps);
  return Math.max(config.minTravelMs, Math.round(scaled));
}
