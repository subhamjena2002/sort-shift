import { SCORING } from '../config/scoring';

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
  awardCorrect(): number {
    this.correct += 1;
    this.currentScore += this.pointsPerCorrect;
    return this.pointsPerCorrect;
  }

  reset(): void {
    this.currentScore = 0;
    this.correct = 0;
  }
}
