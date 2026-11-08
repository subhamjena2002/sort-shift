import type { RuleMode } from '../../types/game';
import { COLOR_RULE_LIBRARY, COMBINATION_RULE_LIBRARY, SHAPE_RULE_LIBRARY, type SortingRule } from '../data/sortingRules';
import { DEFAULT_DIFFICULTY_SCALING, type DifficultyScaling } from './difficulty';

/** Timing of the sequence between shifts, in milliseconds. */
export interface TransitionTiming {
  /** Empty belt before the very first announcement of a run. */
  readonly openingMs: number;
  /** Lets the last parcel and the shift-clear feedback finish. */
  readonly settleMs: number;
  /** Time the SHIFT CHANGE announcement holds attention. */
  readonly announceMs: number;
  /** Learning interval with the new rule card on screen. */
  readonly learnMs: number;
  /** Extra learning time per rule clause beyond the first two. */
  readonly learnPerExtraClauseMs: number;
  /** Extra warning time for a reversal. */
  readonly warningMs: number;
  /** Gap between the announcement ending and the first parcel. */
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
    announceMs: 900,
    learnMs: 1500,
    learnPerExtraClauseMs: 250,
    warningMs: 700,
    readyDelayMs: 450,
  },
  difficulty: DEFAULT_DIFFICULTY_SCALING,
};
