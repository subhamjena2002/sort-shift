import { describe, expect, it } from 'vitest';
import { DEFAULT_BONUSES, DEFAULT_COMBO, DEFAULT_GOLDEN, type GoldenParcelConfig } from '../src/game/config/scoring';
import { BonusParcelSystem } from '../src/game/systems/BonusParcelSystem';
import { ComboSystem, multiplierForStreak, nextTierStreak, streakBonusFor } from '../src/game/systems/ComboSystem';
import { ParcelFactory } from '../src/game/systems/ParcelFactory';
import { perfectShiftBonus, ScoreSystem } from '../src/game/systems/ScoreSystem';
import { createSeededRandom } from '../src/game/utils/random';

describe('combo calculation', () => {
  it('maps streaks onto multiplier tiers', () => {
    expect(multiplierForStreak(0)).toBe(1);
    expect(multiplierForStreak(4)).toBe(1);
    expect(multiplierForStreak(5)).toBe(2);
    expect(multiplierForStreak(9)).toBe(2);
    expect(multiplierForStreak(10)).toBe(3);
    expect(multiplierForStreak(20)).toBe(4);
    expect(multiplierForStreak(10_000)).toBe(4);
  });

  it('reports the next tier and null at the top', () => {
    expect(nextTierStreak(0)).toBe(5);
    expect(nextTierStreak(5)).toBe(10);
    expect(nextTierStreak(20)).toBeNull();
  });

  it('pays a growing, capped streak bonus only on milestones', () => {
    expect(streakBonusFor(4)).toBe(0);
    expect(streakBonusFor(5)).toBe(10);
    expect(streakBonusFor(10)).toBe(20);
    expect(streakBonusFor(11)).toBe(0);
    expect(streakBonusFor(5000)).toBe(DEFAULT_COMBO.maxStreakBonus);
  });

  it('flags the sort that raises the multiplier, and only that one', () => {
    const combo = new ComboSystem();
    const updates = Array.from({ length: 6 }, () => combo.registerCorrect());
    expect(updates.map((u) => u.multiplierIncreased)).toEqual([false, false, false, false, true, false]);
    expect(combo.multiplier).toBe(2);
  });

  it('a mistake clears the streak but keeps the best', () => {
    const combo = new ComboSystem();
    for (let i = 0; i < 7; i += 1) combo.registerCorrect();
    const update = combo.registerMistake();
    expect(update).toMatchObject({ streak: 0, multiplier: 1, broken: true, previousStreak: 7 });
    expect(combo.streak).toBe(0);
    expect(combo.bestStreak).toBe(7);
  });

  it('does not report a broken streak when there was none', () => {
    expect(new ComboSystem().registerMistake().broken).toBe(false);
  });

  it('resets completely', () => {
    const combo = new ComboSystem();
    combo.registerCorrect();
    combo.reset();
    expect(combo.streak).toBe(0);
    expect(combo.bestStreak).toBe(0);
  });
});

describe('ScoreSystem bonuses', () => {
  it('applies a multiplier to a correct sort', () => {
    const score = new ScoreSystem();
    expect(score.awardCorrect(3)).toBe(30);
    expect(score.score).toBe(30);
    expect(score.correctCount).toBe(1);
  });

  it('treats an invalid multiplier as ×1', () => {
    const score = new ScoreSystem();
    expect(score.awardCorrect(0)).toBe(10);
    expect(score.awardCorrect(Number.NaN)).toBe(10);
  });

  it('adds bonus points without counting a sort', () => {
    const score = new ScoreSystem();
    expect(score.awardBonus(50)).toBe(50);
    expect(score.score).toBe(50);
    expect(score.correctCount).toBe(0);
  });

  it('ignores zero, negative and non-finite bonuses', () => {
    const score = new ScoreSystem();
    expect(score.awardBonus(0)).toBe(0);
    expect(score.awardBonus(-20)).toBe(0);
    expect(score.awardBonus(Number.POSITIVE_INFINITY)).toBe(0);
    expect(score.score).toBe(0);
  });
});

describe('perfect shift bonus', () => {
  it('grows with the shift number', () => {
    expect(perfectShiftBonus(1)).toBe(DEFAULT_BONUSES.perfectShiftBase);
    expect(perfectShiftBonus(2)).toBe(DEFAULT_BONUSES.perfectShiftBase + DEFAULT_BONUSES.perfectShiftPerShift);
  });

  it('is capped', () => {
    expect(perfectShiftBonus(100_000)).toBe(DEFAULT_BONUSES.perfectShiftMax);
  });
});

describe('golden parcel system', () => {
  const always: GoldenParcelConfig = { unlockShift: 3, spawnChance: 1, minParcelsBetween: 2, maxPerShift: 2 };

  it('never appears before the unlock shift', () => {
    const system = new BonusParcelSystem(() => 0, always);
    for (let i = 0; i < 50; i += 1) expect(system.rollForSpawn(2)).toBe(false);
  });

  it('respects the spawn chance', () => {
    expect(new BonusParcelSystem(() => 0.99, always).rollForSpawn(3)).toBe(true);
    expect(new BonusParcelSystem(() => 0.5, { ...always, spawnChance: 0.2 }).rollForSpawn(3)).toBe(false);
  });

  it('keeps a gap between golden parcels', () => {
    const system = new BonusParcelSystem(() => 0, always);
    const rolls = Array.from({ length: 4 }, () => system.rollForSpawn(3));
    expect(rolls).toEqual([true, false, false, true]);
  });

  it('limits golden parcels per shift until the next shift starts', () => {
    const system = new BonusParcelSystem(() => 0, { ...always, minParcelsBetween: 0 });
    expect([system.rollForSpawn(3), system.rollForSpawn(3), system.rollForSpawn(3)]).toEqual([true, true, false]);
    system.onShiftStart();
    expect(system.rollForSpawn(4)).toBe(true);
  });

  it('is deterministic for a seed', () => {
    const run = (): boolean[] => {
      const system = new BonusParcelSystem(createSeededRandom(77), DEFAULT_GOLDEN);
      return Array.from({ length: 200 }, () => system.rollForSpawn(5));
    };
    expect(run()).toEqual(run());
    expect(run()).toContain(true);
  });

  it('stays occasional with the default settings', () => {
    const system = new BonusParcelSystem(createSeededRandom(3));
    let golden = 0;
    for (let i = 0; i < 1000; i += 1) {
      if (i % 10 === 0) system.onShiftStart();
      if (system.rollForSpawn(5)) golden += 1;
    }
    expect(golden).toBeGreaterThan(30);
    expect(golden).toBeLessThan(250);
  });
});

describe('ParcelFactory attributes', () => {
  it('gives every parcel a colour, a shape and a unique id', () => {
    const factory = new ParcelFactory(createSeededRandom(8), ['BLUE', 'RED', 'YELLOW', 'GREEN'], 3, ['CIRCLE', 'SQUARE']);
    const parcels = Array.from({ length: 500 }, () => factory.create());
    expect(new Set(parcels.map((p) => p.id)).size).toBe(500);
    expect(new Set(parcels.map((p) => p.attributes.color))).toEqual(new Set(['BLUE', 'RED', 'YELLOW', 'GREEN']));
    expect(new Set(parcels.map((p) => p.attributes.shape))).toEqual(new Set(['CIRCLE', 'SQUARE']));
  });

  it('never exceeds the same-shape streak limit', () => {
    const factory = new ParcelFactory(createSeededRandom(21), ['BLUE'], 3, ['CIRCLE', 'SQUARE']);
    let streak = 0;
    let last: string | null = null;
    for (let i = 0; i < 2000; i += 1) {
      const { shape } = factory.create().attributes;
      streak = shape === last ? streak + 1 : 1;
      last = shape;
      expect(streak).toBeLessThanOrEqual(3);
    }
  });

  it('honours per-spawn pools and kind', () => {
    const factory = new ParcelFactory(createSeededRandom(1), ['BLUE']);
    const parcel = factory.create({ colors: ['GREEN'], shapes: ['CIRCLE'], kind: 'GOLDEN' });
    expect(parcel).toMatchObject({ attributes: { color: 'GREEN', shape: 'CIRCLE' }, kind: 'GOLDEN' });
  });

  it('defaults to a standard parcel', () => {
    expect(new ParcelFactory(createSeededRandom(1), ['BLUE']).create().kind).toBe('STANDARD');
  });

  it('requires at least one shape', () => {
    expect(() => new ParcelFactory(createSeededRandom(1), ['BLUE'], 0, [])).toThrow();
  });
});
