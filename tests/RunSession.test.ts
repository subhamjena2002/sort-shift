import { describe, expect, it } from 'vitest';
import { travelTimeFor } from '../src/game/config/difficulty';
import type { SessionEvent } from '../src/game/systems/RunSession';
import type { BinSide, ParcelColor } from '../src/types/game';
import { createSeededRandom } from '../src/game/utils/random';
import { advance, advanceUntilSpawn, eventTypes, makeSession, TEST_DIFFICULTY } from './helpers';

// YELLOW and GREEN are only here to satisfy the wider ParcelColor type; these sessions never spawn them.
const CORRECT_SIDE: Readonly<Record<ParcelColor, BinSide>> = { BLUE: 'LEFT', RED: 'RIGHT', YELLOW: 'LEFT', GREEN: 'RIGHT' };

function activeColor(session: ReturnType<typeof makeSession>): ParcelColor {
  const active = session.activeParcel;
  if (!active) throw new Error('expected an active parcel');
  return active.parcel.attributes.color;
}

describe('RunSession — spawning', () => {
  it('waits for the first-spawn delay before the first parcel appears', () => {
    const session = makeSession();
    expect(session.phase).toBe('WAITING');
    expect(session.update(TEST_DIFFICULTY.firstSpawnDelayMs - 1)).toEqual([]);
    expect(session.activeParcel).toBeNull();
    const events = session.update(1);
    expect(eventTypes(events)).toEqual(['PARCEL_SPAWNED']);
    expect(session.phase).toBe('ACTIVE');
    expect(session.activeParcel?.progress).toBe(0);
  });

  it('moves the active parcel along the belt in proportion to time', () => {
    const session = makeSession();
    advanceUntilSpawn(session);
    session.update(TEST_DIFFICULTY.baseTravelMs / 4);
    expect(session.activeParcel?.progress).toBeCloseTo(0.25, 5);
    expect(session.activeParcel?.inDecisionZone).toBe(false);
    session.update(TEST_DIFFICULTY.baseTravelMs / 2);
    expect(session.activeParcel?.inDecisionZone).toBe(true);
  });

  it('never has two parcels at once: the next spawns only after resolution plus a gap', () => {
    const session = makeSession();
    advanceUntilSpawn(session);
    // Plenty of time passes — but only one parcel, which ends up missed.
    const events = advance(session, TEST_DIFFICULTY.baseTravelMs - 20);
    expect(eventTypes(events)).not.toContain('PARCEL_SPAWNED');

    session.choose(CORRECT_SIDE[activeColor(session)]);
    expect(session.activeParcel).toBeNull();
    const gap = TEST_DIFFICULTY.resolveDelayMs + TEST_DIFFICULTY.spawnDelayMs;
    expect(session.update(gap - 1)).toEqual([]);
    expect(eventTypes(session.update(1))).toEqual(['PARCEL_SPAWNED']);
  });

  it('is deterministic for a given seed', () => {
    const sequence = (seed: number): ParcelColor[] => {
      const session = makeSession({ random: createSeededRandom(seed) });
      const colors: ParcelColor[] = [];
      for (let i = 0; i < 20; i += 1) {
        advanceUntilSpawn(session);
        const color = activeColor(session);
        colors.push(color);
        session.choose(CORRECT_SIDE[color]);
      }
      return colors;
    };
    expect(sequence(42)).toEqual(sequence(42));
    expect(sequence(42)).not.toEqual(sequence(43));
  });

  it('ignores zero, negative and non-finite time steps', () => {
    const session = makeSession();
    expect(session.update(0)).toEqual([]);
    expect(session.update(-50)).toEqual([]);
    expect(session.update(Number.NaN)).toEqual([]);
    expect(session.update(Number.POSITIVE_INFINITY)).toEqual([]);
    expect(session.activeParcel).toBeNull();
  });
});

describe('RunSession — correct sorting & score updates', () => {
  it('awards 10 points for a correct sort and reports it', () => {
    const session = makeSession({ colors: ['BLUE'] });
    advanceUntilSpawn(session);
    const events = session.choose('LEFT');
    expect(eventTypes(events)).toEqual(['PARCEL_SORTED', 'SCORE_CHANGED']);
    const sorted = events[0] as Extract<SessionEvent, { type: 'PARCEL_SORTED' }>;
    expect(sorted.correct).toBe(true);
    expect(sorted.pointsAwarded).toBe(10);
    expect(events[1]).toMatchObject({ type: 'SCORE_CHANGED', score: 10, correctCount: 1 });
    expect(session.score).toBe(10);
    expect(session.mistakes).toBe(0);
    expect(session.activeParcel).toBeNull();
  });

  it('accumulates score across parcels', () => {
    const session = makeSession();
    for (let i = 0; i < 5; i += 1) {
      advanceUntilSpawn(session);
      session.choose(CORRECT_SIDE[activeColor(session)]);
    }
    expect(session.score).toBe(50);
    expect(session.correctCount).toBe(5);
    expect(session.parcelsResolved).toBe(5);
  });

  it('accepts RED → RIGHT', () => {
    const session = makeSession({ colors: ['RED'] });
    advanceUntilSpawn(session);
    const [sorted] = session.choose('RIGHT');
    expect(sorted).toMatchObject({ type: 'PARCEL_SORTED', correct: true, expected: 'RIGHT' });
  });
});

describe('RunSession — incorrect sorting & mistakes', () => {
  it('counts a wrong bin as a mistake without awarding points', () => {
    const session = makeSession({ colors: ['BLUE'] });
    advanceUntilSpawn(session);
    const events = session.choose('RIGHT');
    expect(eventTypes(events)).toEqual(['PARCEL_SORTED', 'MISTAKES_CHANGED']);
    expect(events[0]).toMatchObject({ correct: false, chosen: 'RIGHT', expected: 'LEFT', pointsAwarded: 0 });
    expect(events[1]).toMatchObject({ mistakes: 1, remaining: 2, reason: 'WRONG_BIN' });
    expect(session.score).toBe(0);
    expect(session.mistakesRemaining).toBe(2);
  });
});

describe('RunSession — missed parcels', () => {
  it('counts a parcel that reaches the decision line unsorted as missed', () => {
    const session = makeSession({ colors: ['RED'] });
    advanceUntilSpawn(session);
    const before = advance(session, TEST_DIFFICULTY.baseTravelMs - 16);
    expect(eventTypes(before)).not.toContain('PARCEL_MISSED');
    const events = advance(session, 32);
    expect(eventTypes(events)).toEqual(['PARCEL_MISSED', 'MISTAKES_CHANGED']);
    expect(events[0]).toMatchObject({ type: 'PARCEL_MISSED', expected: 'RIGHT' });
    expect(events[1]).toMatchObject({ mistakes: 1, remaining: 2, reason: 'MISSED' });
    expect(session.activeParcel).toBeNull();
  });

  it('resolves every spawned parcel exactly once (nothing silently disappears)', () => {
    const session = makeSession({ maxMistakes: 50 });
    let spawned = 0;
    let resolved = 0;
    const decide = createSeededRandom(7);
    for (let frame = 0; frame < 4000 && !session.isOver; frame += 1) {
      const events = session.update(16);
      if (session.activeParcel && decide() < 0.02) events.push(...session.choose(decide() < 0.5 ? 'LEFT' : 'RIGHT'));
      for (const event of events) {
        if (event.type === 'PARCEL_SPAWNED') spawned += 1;
        if (event.type === 'PARCEL_SORTED' || event.type === 'PARCEL_MISSED') resolved += 1;
      }
    }
    expect(spawned).toBeGreaterThan(10);
    const stillActive = session.activeParcel ? 1 : 0;
    expect(resolved + stillActive).toBe(spawned);
    expect(session.parcelsResolved).toBe(resolved);
  });
});

describe('RunSession — double input protection', () => {
  it('cannot sort the same parcel twice', () => {
    const session = makeSession({ colors: ['BLUE'] });
    advanceUntilSpawn(session);
    expect(session.choose('LEFT')).toHaveLength(2);
    expect(session.choose('LEFT')).toEqual([]);
    expect(session.choose('RIGHT')).toEqual([]);
    expect(session.score).toBe(10);
    expect(session.mistakes).toBe(0);
  });

  it('ignores input when no parcel is on the belt', () => {
    const session = makeSession();
    expect(session.choose('LEFT')).toEqual([]);
    expect(session.score).toBe(0);
    expect(session.mistakes).toBe(0);
  });

  it('respects the input-opening threshold', () => {
    const session = makeSession({ colors: ['BLUE'], difficulty: { ...TEST_DIFFICULTY, inputOpensAt: 0.5 } });
    advanceUntilSpawn(session);
    expect(session.choose('LEFT')).toEqual([]);
    advance(session, TEST_DIFFICULTY.baseTravelMs * 0.5);
    expect(eventTypes(session.choose('LEFT'))).toContain('PARCEL_SORTED');
  });
});

describe('RunSession — game over', () => {
  it('ends the run on the third mistake and freezes afterwards', () => {
    const session = makeSession({ colors: ['BLUE'] });

    advanceUntilSpawn(session);
    session.choose('LEFT'); // +10

    advanceUntilSpawn(session);
    session.choose('RIGHT'); // mistake 1

    advanceUntilSpawn(session);
    advance(session, TEST_DIFFICULTY.baseTravelMs + 16); // missed: mistake 2
    expect(session.isOver).toBe(false);
    expect(session.mistakesRemaining).toBe(1);

    advanceUntilSpawn(session);
    const events = session.choose('RIGHT'); // mistake 3
    expect(eventTypes(events)).toEqual(['PARCEL_SORTED', 'MISTAKES_CHANGED', 'RUN_ENDED']);
    expect(events[2]).toEqual({
      type: 'RUN_ENDED',
      stats: { score: 10, correctCount: 1, mistakeCount: 3, parcelsResolved: 4 },
    });
    expect(session.isOver).toBe(true);
    expect(session.phase).toBe('ENDED');

    // Nothing moves or scores after the end.
    expect(advance(session, 5000)).toEqual([]);
    expect(session.choose('LEFT')).toEqual([]);
    expect(session.activeParcel).toBeNull();
    expect(session.score).toBe(10);
  });

  it('can end through misses alone', () => {
    const session = makeSession();
    const all = advance(session, 20_000);
    expect(eventTypes(all).filter((t) => t === 'PARCEL_MISSED')).toHaveLength(3);
    expect(eventTypes(all).at(-1)).toBe('RUN_ENDED');
  });
});

describe('difficulty curve', () => {
  it('speeds up every N correct sorts and never drops below the minimum', () => {
    expect(travelTimeFor(0, TEST_DIFFICULTY)).toBe(1000);
    expect(travelTimeFor(4, TEST_DIFFICULTY)).toBe(1000);
    expect(travelTimeFor(5, TEST_DIFFICULTY)).toBe(500);
    expect(travelTimeFor(10, TEST_DIFFICULTY)).toBe(400);
    expect(travelTimeFor(500, TEST_DIFFICULTY)).toBe(400);
  });

  it('applies the new speed to parcels spawned after a speed-up', () => {
    const session = makeSession();
    for (let i = 0; i < 5; i += 1) {
      advanceUntilSpawn(session);
      expect(session.activeParcel?.travelTimeMs).toBe(1000);
      session.choose(CORRECT_SIDE[activeColor(session)]);
    }
    expect(session.speedLevel).toBe(2);
    advanceUntilSpawn(session);
    expect(session.activeParcel?.travelTimeMs).toBe(500);
  });
});
