import { SCORING } from '../config/scoring';
import type { MistakeReason } from '../../types/game';

/** Counts mistakes (wrong bin or missed parcel) against a fixed allowance. */
export class MistakeTracker {
  readonly maxMistakes: number;
  private count = 0;
  private readonly history: MistakeReason[] = [];

  constructor(maxMistakes: number = SCORING.maxMistakes) {
    if (!Number.isInteger(maxMistakes) || maxMistakes < 1) {
      throw new Error(`maxMistakes must be a positive integer, got ${maxMistakes}`);
    }
    this.maxMistakes = maxMistakes;
  }

  get mistakes(): number {
    return this.count;
  }

  get remaining(): number {
    return this.maxMistakes - this.count;
  }

  /** True once the allowance is used up and the run must end. */
  get isExhausted(): boolean {
    return this.count >= this.maxMistakes;
  }

  get reasons(): readonly MistakeReason[] {
    return this.history;
  }

  /** Record a mistake. Ignored once the allowance is exhausted. Returns true if counted. */
  record(reason: MistakeReason): boolean {
    if (this.isExhausted) return false;
    this.count += 1;
    this.history.push(reason);
    return true;
  }

  reset(): void {
    this.count = 0;
    this.history.length = 0;
  }
}
