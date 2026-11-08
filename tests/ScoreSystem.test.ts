import { describe, expect, it } from 'vitest';
import { SCORING } from '../src/game/config/scoring';
import { ScoreSystem } from '../src/game/systems/ScoreSystem';

describe('ScoreSystem', () => {
  it('starts at zero', () => {
    const score = new ScoreSystem();
    expect(score.score).toBe(0);
    expect(score.correctCount).toBe(0);
  });

  it('adds 10 points for every correct parcel', () => {
    expect(SCORING.pointsPerCorrect).toBe(10);
    const score = new ScoreSystem();
    expect(score.awardCorrect()).toBe(10);
    expect(score.score).toBe(10);
    score.awardCorrect();
    score.awardCorrect();
    expect(score.score).toBe(30);
    expect(score.correctCount).toBe(3);
  });

  it('supports a custom points value', () => {
    const score = new ScoreSystem(25);
    score.awardCorrect();
    expect(score.score).toBe(25);
  });

  it('resets', () => {
    const score = new ScoreSystem();
    score.awardCorrect();
    score.reset();
    expect(score.score).toBe(0);
    expect(score.correctCount).toBe(0);
  });
});
