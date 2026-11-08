import { describe, expect, it } from 'vitest';
import { SCORING } from '../src/game/config/scoring';
import { MistakeTracker } from '../src/game/systems/MistakeTracker';

describe('MistakeTracker', () => {
  it('starts with three allowed mistakes', () => {
    expect(SCORING.maxMistakes).toBe(3);
    const tracker = new MistakeTracker();
    expect(tracker.mistakes).toBe(0);
    expect(tracker.remaining).toBe(3);
    expect(tracker.isExhausted).toBe(false);
  });

  it('counts wrong-bin and missed mistakes alike', () => {
    const tracker = new MistakeTracker();
    expect(tracker.record('WRONG_BIN')).toBe(true);
    expect(tracker.record('MISSED')).toBe(true);
    expect(tracker.mistakes).toBe(2);
    expect(tracker.remaining).toBe(1);
    expect(tracker.reasons).toEqual(['WRONG_BIN', 'MISSED']);
    expect(tracker.isExhausted).toBe(false);
  });

  it('is exhausted on the third mistake and ignores further ones', () => {
    const tracker = new MistakeTracker();
    tracker.record('MISSED');
    tracker.record('MISSED');
    tracker.record('WRONG_BIN');
    expect(tracker.isExhausted).toBe(true);
    expect(tracker.remaining).toBe(0);
    expect(tracker.record('MISSED')).toBe(false);
    expect(tracker.mistakes).toBe(3);
  });

  it('rejects invalid allowances', () => {
    expect(() => new MistakeTracker(0)).toThrow();
    expect(() => new MistakeTracker(1.5)).toThrow();
  });

  it('resets', () => {
    const tracker = new MistakeTracker();
    tracker.record('MISSED');
    tracker.reset();
    expect(tracker.mistakes).toBe(0);
    expect(tracker.reasons).toEqual([]);
  });
});
