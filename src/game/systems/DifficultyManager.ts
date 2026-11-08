import type { RuleMode } from '../../types/game';
import { DEFAULT_DIFFICULTY_SCALING, type DifficultyScaling } from '../config/difficulty';

/** Pacing for one shift. Fixed for the whole shift, so it can never spike mid-shift. */
export interface ShiftDifficulty {
  /** 1-based level shown to the player; stops rising at the speed floor. */
  readonly speedLevel: number;
  /** 0 at shift 1, 1 once the belt has reached its fastest speed. */
  readonly pressure: number;
  /** Time for a parcel to reach the decision line; also its decision window. */
  readonly travelMs: number;
  /** Gap between a parcel resolving and the next one spawning. */
  readonly spawnGapMs: number;
}

/** Number of shifts it takes the belt to reach its floor. */
function stepsToFloor(scaling: DifficultyScaling): number {
  return Math.ceil(Math.log(scaling.minTravelMs / scaling.baseTravelMs) / Math.log(scaling.travelFactorPerShift));
}

/**
 * Pure mapping from progression to pacing. The same shift and mode always
 * give the same result: difficulty depends on progress, never on chance.
 */
export function computeShiftDifficulty(
  shiftNumber: number,
  mode: RuleMode,
  scaling: DifficultyScaling = DEFAULT_DIFFICULTY_SCALING,
): ShiftDifficulty {
  const step = Math.max(0, Math.floor(shiftNumber) - 1);
  const rawTravel = Math.max(scaling.minTravelMs, scaling.baseTravelMs * scaling.travelFactorPerShift ** step);
  const withAllowance = rawTravel * scaling.modeTravelAllowance[mode];
  const travelMs = Math.round(Math.min(scaling.baseTravelMs, Math.max(scaling.minDecisionMs[mode], withAllowance)));
  const spawnGapMs = Math.round(Math.max(scaling.minSpawnGapMs, scaling.baseSpawnGapMs * scaling.spawnGapFactorPerShift ** step));
  const range = scaling.baseTravelMs - scaling.minTravelMs;

  return {
    speedLevel: Math.min(step, stepsToFloor(scaling)) + 1,
    pressure: range > 0 ? (scaling.baseTravelMs - rawTravel) / range : 1,
    travelMs,
    spawnGapMs,
  };
}
