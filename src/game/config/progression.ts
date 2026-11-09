import type { RuleMode } from '../../types/game';
import { COLOR_RULE_LIBRARY, COMBINATION_RULE_LIBRARY, SHAPE_RULE_LIBRARY, type SortingRule } from '../data/sortingRules';
import { DEFAULT_DIFFICULTY_SCALING, type DifficultyScaling } from './difficulty';

/**
 * Timing of the sequence between shifts, in milliseconds. The announcement has
 * no entry here on purpose: it stays up until the player confirms they are ready.
 */
export interface TransitionTiming {
  /** Empty belt before the very first announcement of a run. */
  readonly openingMs: number;
  /** Lets the last parcel and the shift-clear feedback finish. */
  readonly settleMs: number;
  /** Beat between confirming and the first number, so the two don't collide. */
  readonly countdownLeadMs: number;
  /** How long each countdown number stays up. */
  readonly countdownStepMs: number;
  /** The number the countdown starts from. */
  readonly countdownFrom: number;
  /** Gap between the countdown ending and the first parcel. */
  readonly readyDelayMs: number;
}

export type ReversibleMode = Extract<RuleMode, 'COLOR' | 'SHAPE'>;
type LibraryMode = Exclude<RuleMode, 'REVERSE'>;

export interface RuleLibrary {
  readonly rules: readonly SortingRule[];
  /** After the last entry, the walk loops from this index. */
  readonly loopFrom: number;
}

export interface ProgressionConfig {
  /** Rule modes in the order they repeat. */
  readonly cycle: readonly RuleMode[];
  /** Which mode a REVERSE shift flips, chosen by cycle number. */
  readonly reverseTargets: readonly ReversibleMode[];
  readonly libraries: Readonly<Record<LibraryMode, RuleLibrary>>;
  /** Correct sorts needed to clear a shift in the first cycle. */
  readonly baseQuota: number;
  readonly quotaGrowthPerCycle: number;
  readonly maxQuota: number;
  readonly transition: TransitionTiming;
  readonly difficulty: DifficultyScaling;
}

export const DEFAULT_PROGRESSION: ProgressionConfig = {
  cycle: ['COLOR', 'SHAPE', 'REVERSE', 'COMBINATION'],
  reverseTargets: ['COLOR', 'SHAPE'],
  libraries: {
    COLOR: { rules: COLOR_RULE_LIBRARY, loopFrom: 2 },
    SHAPE: { rules: SHAPE_RULE_LIBRARY, loopFrom: 0 },
    COMBINATION: { rules: COMBINATION_RULE_LIBRARY, loopFrom: 0 },
  },
  baseQuota: 10,
  quotaGrowthPerCycle: 1,
  maxQuota: 15,
  transition: {
    openingMs: 300,
    settleMs: 750,
    countdownLeadMs: 250,
    countdownStepMs: 1000,
    countdownFrom: 3,
    readyDelayMs: 300,
  },
  difficulty: DEFAULT_DIFFICULTY_SCALING,
};
