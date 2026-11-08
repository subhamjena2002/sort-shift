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
