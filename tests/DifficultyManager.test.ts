import { describe, expect, it } from 'vitest';
import { DEFAULT_DIFFICULTY_SCALING as SCALING } from '../src/game/config/difficulty';
import { computeShiftDifficulty } from '../src/game/systems/DifficultyManager';
import { generateShiftPlan } from '../src/game/systems/ShiftManager';
import type { RuleMode } from '../src/types/game';

const MODES: readonly RuleMode[] = ['COLOR', 'SHAPE', 'REVERSE', 'COMBINATION'];

describe('difficulty scaling', () => {
  it('starts at the base pacing', () => {
    const first = computeShiftDifficulty(1, 'COLOR');
    expect(first.travelMs).toBe(SCALING.baseTravelMs);
    expect(first.spawnGapMs).toBe(SCALING.baseSpawnGapMs);
    expect(first.speedLevel).toBe(1);
    expect(first.pressure).toBe(0);
  });

  it.each(MODES)('%s only ever gets faster as shifts rise', (mode) => {
    let previous = Number.POSITIVE_INFINITY;
    for (let shift = 1; shift <= 300; shift += 1) {
      const { travelMs } = computeShiftDifficulty(shift, mode);
      expect(travelMs).toBeLessThanOrEqual(previous);
      previous = travelMs;
    }
  });

  it('shortens the gap between parcels as shifts rise', () => {
    expect(computeShiftDifficulty(10, 'COLOR').spawnGapMs).toBeLessThan(computeShiftDifficulty(2, 'COLOR').spawnGapMs);
  });

  it('raises pressure and speed level steadily', () => {
    let previous = -1;
    for (let shift = 1; shift <= 60; shift += 1) {
      const { pressure } = computeShiftDifficulty(shift, 'COLOR');
      expect(pressure).toBeGreaterThanOrEqual(previous);
      previous = pressure;
    }
    expect(computeShiftDifficulty(5, 'COLOR').speedLevel).toBe(5);
  });

  it('gives harder rule modes at least as much time as a simple rule on the same shift', () => {
    for (let shift = 1; shift <= 100; shift += 1) {
      const color = computeShiftDifficulty(shift, 'COLOR').travelMs;
      expect(computeShiftDifficulty(shift, 'REVERSE').travelMs).toBeGreaterThanOrEqual(color);
      expect(computeShiftDifficulty(shift, 'COMBINATION').travelMs).toBeGreaterThanOrEqual(color);
    }
  });

  it('is a pure function of its inputs', () => {
    expect(computeShiftDifficulty(9, 'SHAPE')).toEqual(computeShiftDifficulty(9, 'SHAPE'));
  });

  it('clamps shift numbers below 1', () => {
    expect(computeShiftDifficulty(-4, 'COLOR')).toEqual(computeShiftDifficulty(1, 'COLOR'));
  });
});

describe('difficulty limits', () => {
  it.each(MODES)('%s never goes below its fair minimum', (mode) => {
    for (const shift of [50, 500, 5000, 1_000_000]) {
      const { travelMs, spawnGapMs, pressure } = computeShiftDifficulty(shift, mode);
      expect(travelMs).toBeGreaterThanOrEqual(SCALING.minDecisionMs[mode]);
      expect(spawnGapMs).toBeGreaterThanOrEqual(SCALING.minSpawnGapMs);
      expect(pressure).toBeLessThanOrEqual(1);
    }
  });

  it('plateaus: very late shifts are identical', () => {
    expect(computeShiftDifficulty(1000, 'COLOR')).toEqual(computeShiftDifficulty(100_000, 'COLOR'));
  });

  it('caps the speed level once the belt reaches top speed', () => {
    expect(computeShiftDifficulty(100, 'COLOR').speedLevel).toBe(computeShiftDifficulty(10_000, 'COLOR').speedLevel);
    expect(computeShiftDifficulty(100, 'COLOR').pressure).toBe(1);
  });

  it('never exceeds the base decision time, even with a mode allowance', () => {
    for (const mode of MODES) expect(computeShiftDifficulty(1, mode).travelMs).toBeLessThanOrEqual(SCALING.baseTravelMs);
  });

  it('has no excessive jumps between consecutive shifts', () => {
    for (let n = 1; n <= 300; n += 1) {
      const ratio = generateShiftPlan(n + 1).difficulty.travelMs / generateShiftPlan(n).difficulty.travelMs;
      expect(ratio).toBeGreaterThanOrEqual(0.74);
      expect(ratio).toBeLessThanOrEqual(1.35);
    }
  });
});
