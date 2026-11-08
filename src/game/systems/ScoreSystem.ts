import { DEFAULT_BONUSES, SCORING, type BonusConfig } from '../config/scoring';

/** Bonus for finishing a shift without a mistake. Grows with the shift, up to a cap. */
export function perfectShiftBonus(shiftNumber: number, config: BonusConfig = DEFAULT_BONUSES): number {
  const extraShifts = Math.max(0, Math.floor(shiftNumber) - 1);
  return Math.min(config.perfectShiftMax, config.perfectShiftBase + config.perfectShiftPerShift * extraShifts);
}

/** Tracks the score and the number of correct sorts in a run. */
export class ScoreSystem {
  private readonly pointsPerCorrect: number;
  private currentScore = 0;
  private correct = 0;

  constructor(pointsPerCorrect: number = SCORING.pointsPerCorrect) {
    this.pointsPerCorrect = pointsPerCorrect;
  }

  get score(): number {
    return this.currentScore;
  }

  get correctCount(): number {
    return this.correct;
  }

  /** Register a correct sort; returns the points awarded. */
  awardCorrect(multiplier = 1): number {
    const factor = Number.isFinite(multiplier) && multiplier >= 1 ? Math.floor(multiplier) : 1;
    const points = this.pointsPerCorrect * factor;
    this.correct += 1;
    this.currentScore += points;
    return points;
  }

  /** Add bonus points that are not tied to a sort; returns the points added. */
  awardBonus(points: number): number {
    if (!Number.isFinite(points) || points <= 0) return 0;
    const whole = Math.round(points);
    this.currentScore += whole;
    return whole;
  }

  reset(): void {
    this.currentScore = 0;
    this.correct = 0;
  }
}
