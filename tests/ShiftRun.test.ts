import { describe, expect, it } from 'vitest';
import { GameStateMachine } from '../src/game/systems/GameStateMachine';
import { destinationFor } from '../src/game/systems/RuleEvaluator';
import { RunSession, type SessionEvent } from '../src/game/systems/RunSession';
import { ShiftManager } from '../src/game/systems/ShiftManager';
import type { GoldenParcelConfig } from '../src/game/config/scoring';
import { createSeededRandom } from '../src/game/utils/random';
import { eventTypes } from './helpers';
import {
  clearShift,
  correctSide,
  makeShiftSession,
  playToShift,
  sortNextCorrectly,
  STEP_MS,
  stepUntil,
  stepUntilSpawn,
  TEST_PROGRESSION,
  wrongSide,
} from './shiftHelpers';

type EventOf<T extends SessionEvent['type']> = Extract<SessionEvent, { type: T }>;

function firstEvent<T extends SessionEvent['type']>(events: readonly SessionEvent[], type: T): EventOf<T> {
  const found = events.find((e): e is EventOf<T> => e.type === type);
  if (!found) throw new Error(`expected a ${type} event`);
  return found;
}

const EVERY_PARCEL_GOLDEN: GoldenParcelConfig = { unlockShift: 1, spawnChance: 1, minParcelsBetween: 0, maxPerShift: 1000 };

/** Elapsed time, in ms, when an event of `type` first occurs. */
function timeOf(session: RunSession, type: SessionEvent['type']): number {
  let elapsed = 0;
  stepUntil(session, (events) => {
    elapsed += STEP_MS;
    return events.some((e) => e.type === type);
  });
  return elapsed;
}

describe('rule transition timing', () => {
  const { openingMs, announceMs, learnMs, readyDelayMs, settleMs, warningMs } = TEST_PROGRESSION.transition;

  it('announces shift 1, gives the learning interval, then starts spawning', () => {
    const session = makeShiftSession();
    expect(session.phase).toBe('TRANSITION');
    expect(timeOf(session, 'SHIFT_ANNOUNCED')).toBe(openingMs);
    expect(timeOf(session, 'SHIFT_STARTED')).toBe(announceMs + learnMs);
    expect(session.phase).toBe('WAITING');
    expect(timeOf(session, 'PARCEL_SPAWNED')).toBe(readyDelayMs);
  });

  it('spawns nothing and accepts no input during a transition', () => {
    const session = makeShiftSession();
    const events = stepUntil(session, (batch) => {
      expect(session.activeParcel).toBeNull();
      expect(session.choose('LEFT')).toEqual([]);
      return batch.some((e) => e.type === 'SHIFT_STARTED');
    });
    expect(eventTypes(events)).not.toContain('PARCEL_SPAWNED');
    expect(session.score).toBe(0);
    expect(session.mistakes).toBe(0);
  });

  it('runs settle, announcement and ready delay between shifts', () => {
    const session = makeShiftSession();
    const sort = clearShift(session);
    expect(eventTypes(sort)).toContain('SHIFT_COMPLETED');
    expect(session.phase).toBe('TRANSITION');
    expect(session.transition?.stage).toBe('SETTLING');
    expect(timeOf(session, 'SHIFT_ANNOUNCED')).toBe(settleMs);
    expect(session.transition?.stage).toBe('ANNOUNCING');
    expect(timeOf(session, 'SHIFT_STARTED')).toBe(announceMs + learnMs);
    expect(timeOf(session, 'PARCEL_SPAWNED')).toBe(readyDelayMs);
  });

  it('adds the warning time before a reversal', () => {
    const session = makeShiftSession();
    playToShift(session, 3);
    expect(session.shiftStatus?.plan.mode).toBe('REVERSE');
    expect(timeOf(session, 'SHIFT_STARTED')).toBe(warningMs + announceMs + learnMs);
  });

  it('reports the opening announcement as such, and later ones as shift changes', () => {
    const session = makeShiftSession();
    const opening = stepUntil(session, (e) => e.some((x) => x.type === 'SHIFT_ANNOUNCED'));
    expect(firstEvent(opening, 'SHIFT_ANNOUNCED').opening).toBe(true);
    clearShift(session);
    const next = stepUntil(session, (e) => e.some((x) => x.type === 'SHIFT_ANNOUNCED'));
    expect(firstEvent(next, 'SHIFT_ANNOUNCED').opening).toBe(false);
  });

  it('counts down remaining announcement time', () => {
    const session = makeShiftSession();
    stepUntil(session, (e) => e.some((x) => x.type === 'SHIFT_ANNOUNCED'));
    const before = session.transition?.remainingMs ?? 0;
    session.update(100);
    expect(session.transition?.remainingMs).toBe(before - 100);
    expect(session.transition?.durationMs).toBe(announceMs + learnMs);
  });
});

describe('rule consistency for parcels in play', () => {
  it('judges a parcel by the rule it spawned under, even if the rule then changes', () => {
    const shifts = new ShiftManager(TEST_PROGRESSION);
    const session = new RunSession({ shifts, random: createSeededRandom(5) });
    stepUntilSpawn(session);
    const spawnRule = session.activeParcel?.rule;
    const expected = correctSide(session);

    shifts.advance();
    expect(session.rule.id).not.toBe(spawnRule?.id);
    expect(session.activeParcel?.rule).toBe(spawnRule);

    const [sorted] = session.choose(expected);
    expect(sorted).toMatchObject({ type: 'PARCEL_SORTED', correct: true, expected });
  });

  it('reports a missed parcel against the rule it spawned under', () => {
    const shifts = new ShiftManager(TEST_PROGRESSION);
    const session = new RunSession({ shifts, random: createSeededRandom(5) });
    stepUntilSpawn(session);
    const expected = correctSide(session);
    shifts.advance();
    const events = stepUntil(session, (e) => e.some((x) => x.type === 'PARCEL_MISSED'));
    expect(firstEvent(events, 'PARCEL_MISSED').expected).toBe(expected);
  });

  it('only ever changes the rule while the belt is empty', () => {
    const session = makeShiftSession({ maxMistakes: 10_000 });
    let previousRule = session.rule.id;
    let changes = 0;
    for (let frame = 0; frame < 60_000 && changes < 10; frame += 1) {
      session.update(STEP_MS);
      if (session.rule.id !== previousRule) {
        changes += 1;
        previousRule = session.rule.id;
        expect(session.activeParcel).toBeNull();
        expect(session.phase).toBe('TRANSITION');
      }
      if (session.activeParcel) session.choose(correctSide(session));
    }
    expect(changes).toBe(10);
  });

  it('spawns every parcel under the displayed rule, from that rule\'s domain', () => {
    const session = makeShiftSession({ maxMistakes: 10_000 });
    let spawned = 0;
    for (let frame = 0; frame < 40_000; frame += 1) {
      for (const event of session.update(STEP_MS)) {
        if (event.type !== 'PARCEL_SPAWNED') continue;
        spawned += 1;
        expect(event.rule).toBe(session.rule);
        expect(() => destinationFor(event.rule, event.parcel.attributes)).not.toThrow();
      }
      if (session.activeParcel) session.choose(correctSide(session));
    }
    expect(spawned).toBeGreaterThan(100);
  });
});

describe('scoring in a shift run', () => {
  it('applies the multiplier and streak bonus at the right sorts', () => {
    const session = makeShiftSession();
    const scores: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      sortNextCorrectly(session);
      scores.push(session.score);
    }
    // 10 ×4, then 5th sort: 20 + streak bonus 10, then 20.
    expect(scores).toEqual([10, 20, 30, 40, 70, 90]);
  });

  it('reports combo events and multiplier rises', () => {
    const session = makeShiftSession();
    let fifth: SessionEvent[] = [];
    for (let i = 0; i < 5; i += 1) fifth = sortNextCorrectly(session);
    expect(eventTypes(fifth)).toEqual(['PARCEL_SORTED', 'COMBO_CHANGED', 'BONUS_AWARDED', 'SCORE_CHANGED']);
    expect(firstEvent(fifth, 'COMBO_CHANGED').combo).toMatchObject({ streak: 5, multiplier: 2, multiplierIncreased: true });
    expect(firstEvent(fifth, 'BONUS_AWARDED')).toMatchObject({ kind: 'STREAK', points: 10 });
    expect(firstEvent(fifth, 'PARCEL_SORTED').pointsAwarded).toBe(20);
  });

  it('a wrong sort breaks the combo and costs a mistake', () => {
    const session = makeShiftSession();
    sortNextCorrectly(session);
    stepUntilSpawn(session);
    const events = session.choose(wrongSide(session));
    expect(eventTypes(events)).toEqual(['PARCEL_SORTED', 'COMBO_CHANGED', 'MISTAKES_CHANGED']);
    expect(session.comboStatus?.streak).toBe(0);
  });

  it('a missed parcel also breaks the combo', () => {
    const session = makeShiftSession();
    sortNextCorrectly(session);
    const events = stepUntil(session, (e) => e.some((x) => x.type === 'PARCEL_MISSED'));
    expect(firstEvent(events, 'COMBO_CHANGED').combo.broken).toBe(true);
    expect(session.comboStatus?.streak).toBe(0);
  });

  it('keeps the streak going from one shift into the next', () => {
    const session = makeShiftSession();
    clearShift(session);
    sortNextCorrectly(session);
    expect(session.comboStatus?.streak).toBe(11);
  });

  it('scoring does not depend on frame timing', () => {
    const play = (step: number): number => {
      const session = makeShiftSession({}, 99);
      while (session.correctCount < 12) {
        session.update(step);
        if (session.activeParcel) session.choose(correctSide(session));
      }
      return session.score;
    };
    expect(play(8)).toBe(play(33));
  });
});

describe('perfect shift bonus', () => {
  it('awards the bonus for a shift without mistakes', () => {
    const session = makeShiftSession();
    const events = clearShift(session);
    const completed = firstEvent(events, 'SHIFT_COMPLETED');
    expect(completed).toMatchObject({ shift: 1, perfect: true, bonus: 100 });
    expect(eventTypes(events).at(-1)).toBe('SCORE_CHANGED');
    // 40 + (20+10) + 80 + (30+20) = 200 from sorting, plus the bonus.
    expect(session.score).toBe(300);
    expect(session.stats.perfectShifts).toBe(1);
  });

  it('withholds the bonus after any mistake in the shift', () => {
    const session = makeShiftSession();
    stepUntilSpawn(session);
    session.choose(wrongSide(session));
    const completed = firstEvent(clearShift(session), 'SHIFT_COMPLETED');
    expect(completed).toMatchObject({ perfect: false, bonus: 0 });
    expect(session.stats.perfectShifts).toBe(0);
  });

  it('judges each shift separately', () => {
    const session = makeShiftSession();
    stepUntilSpawn(session);
    session.choose(wrongSide(session));
    expect(firstEvent(clearShift(session), 'SHIFT_COMPLETED').perfect).toBe(false);
    expect(firstEvent(clearShift(session), 'SHIFT_COMPLETED').perfect).toBe(true);
  });

  it('wrong sorts do not count towards the quota', () => {
    const session = makeShiftSession({ maxMistakes: 100 });
    for (let i = 0; i < 12; i += 1) {
      stepUntilSpawn(session);
      session.choose(wrongSide(session));
    }
    expect(session.shiftStatus?.plan.number).toBe(1);
    expect(session.shiftStatus?.correct).toBe(0);
  });
});

describe('golden parcels in play', () => {
  it('awards the bonus when sorted correctly under the active rule', () => {
    const session = makeShiftSession({ golden: EVERY_PARCEL_GOLDEN });
    stepUntilSpawn(session);
    expect(session.activeParcel?.parcel.kind).toBe('GOLDEN');
    const events = session.choose(correctSide(session));
    expect(firstEvent(events, 'BONUS_AWARDED')).toMatchObject({ kind: 'GOLDEN', points: 50 });
    expect(session.score).toBe(60);
  });

  it('awards nothing and costs a mistake when sorted wrongly', () => {
    const session = makeShiftSession({ golden: EVERY_PARCEL_GOLDEN });
    stepUntilSpawn(session);
    const events = session.choose(wrongSide(session));
    expect(eventTypes(events)).not.toContain('BONUS_AWARDED');
    expect(session.score).toBe(0);
    expect(session.mistakes).toBe(1);
  });

  it('does not appear in the early shifts by default', () => {
    const session = makeShiftSession();
    for (let i = 0; i < 20; i += 1) {
      stepUntilSpawn(session);
      expect(session.activeParcel?.parcel.kind).toBe('STANDARD');
      session.choose(correctSide(session));
    }
    // Shift 2 was just cleared; shift 3 (the unlock) only begins at its announcement.
    expect(session.stats.shiftsCompleted).toBe(1);
    expect(session.phase).toBe('TRANSITION');
  });

  it('appears once the player has progressed', () => {
    const session = makeShiftSession();
    playToShift(session, 3);
    let golden = 0;
    for (let i = 0; i < 60; i += 1) {
      stepUntilSpawn(session);
      if (session.activeParcel?.parcel.kind === 'GOLDEN') golden += 1;
      session.choose(correctSide(session));
    }
    expect(golden).toBeGreaterThan(0);
  });
});

describe('restarting a run', () => {
  it('a new run starts from a clean slate after a long one', () => {
    const shiftsA = new ShiftManager(TEST_PROGRESSION);
    const first = new RunSession({ shifts: shiftsA, random: createSeededRandom(4) });
    playToShift(first, 4);
    sortNextCorrectly(first);
    expect(first.score).toBeGreaterThan(0);

    const second = new RunSession({ shifts: new ShiftManager(TEST_PROGRESSION), random: createSeededRandom(4) });
    expect(second.score).toBe(0);
    expect(second.mistakes).toBe(0);
    expect(second.shiftStatus).toMatchObject({ correct: 0, mistakes: 0 });
    expect(second.shiftStatus?.plan.number).toBe(1);
    expect(second.comboStatus).toMatchObject({ streak: 0, multiplier: 1, bestStreak: 0 });
    expect(second.speedLevel).toBe(1);
    expect(second.activeParcel).toBeNull();
  });

  it('a restart replays identically: nothing leaks between runs', () => {
    const trace = (): string[] => {
      const session = makeShiftSession({}, 31);
      const out: string[] = [];
      while (out.length < 40) {
        for (const event of sortNextCorrectly(session)) out.push(`${event.type}:${session.score}`);
      }
      return out;
    };
    const first = trace();
    makeShiftSession({}, 8);
    expect(trace()).toEqual(first);
  });

  it('restores parcel ids and golden eligibility', () => {
    const first = makeShiftSession({ golden: EVERY_PARCEL_GOLDEN });
    sortNextCorrectly(first);
    const second = makeShiftSession({ golden: EVERY_PARCEL_GOLDEN });
    stepUntilSpawn(second);
    expect(second.activeParcel?.parcel.id).toBe(1);
    expect(second.activeParcel?.parcel.kind).toBe('GOLDEN');
  });
});

describe('pause and resume', () => {
  type Snapshot = Record<string, unknown>;
  const snapshot = (s: RunSession): Snapshot => ({
    phase: s.phase,
    score: s.score,
    mistakes: s.mistakes,
    active: s.activeParcel,
    transition: s.transition,
    shift: s.shiftStatus,
    combo: s.comboStatus,
    rule: s.rule.id,
  });

  /** A real pause stops the scene: no updates arrive, and the scene drops input. */
  const pauseFor = (machine: GameStateMachine, inspect: () => void): void => {
    expect(machine.transition('PAUSED')).toBe(true);
    inspect();
    expect(machine.is('PLAYING')).toBe(false);
    expect(machine.transition('PLAYING')).toBe(true);
  };

  it('freezes a parcel mid-belt', () => {
    const session = makeShiftSession();
    const machine = new GameStateMachine('PLAYING');
    stepUntilSpawn(session);
    session.update(500);
    const before = snapshot(session);
    pauseFor(machine, () => expect(snapshot(session)).toEqual(before));
    expect(snapshot(session)).toEqual(before);
    session.update(100);
    expect(session.activeParcel?.progress).toBeGreaterThan((before.active as { progress: number }).progress);
  });

  it('freezes the shift announcement and the learning interval', () => {
    const session = makeShiftSession();
    const machine = new GameStateMachine('PLAYING');
    stepUntil(session, (e) => e.some((x) => x.type === 'SHIFT_ANNOUNCED'));
    session.update(120);
    const before = snapshot(session);
    pauseFor(machine, () => undefined);
    expect(snapshot(session)).toEqual(before);
    expect(session.transition?.stage).toBe('ANNOUNCING');
  });

  it('a paused run plays out exactly like an uninterrupted one', () => {
    const play = (pauseEvery: number | null): string[] => {
      const session = makeShiftSession({}, 55);
      const machine = new GameStateMachine('PLAYING');
      const out: string[] = [];
      for (let frame = 0; frame < 6000; frame += 1) {
        if (pauseEvery !== null && frame % pauseEvery === 0) pauseFor(machine, () => undefined);
        for (const event of session.update(STEP_MS)) out.push(`${frame}:${event.type}:${session.score}`);
        if (session.activeParcel && session.activeParcel.progress > 0.5) {
          for (const event of session.choose(correctSide(session))) out.push(`${frame}:${event.type}:${session.score}`);
        }
      }
      return out;
    };
    expect(play(37)).toEqual(play(null));
  });
});

describe('a complete run', () => {
  it('progresses through every mode, earns rewards and reaches game over', () => {
    const session = makeShiftSession({}, 2024);
    const seen = new Set<string>();
    let golden = 0;
    let multiplierRises = 0;
    let lastScore = 0;

    const record = (events: readonly SessionEvent[]): void => {
      for (const event of events) {
        if (event.type === 'SHIFT_ANNOUNCED') seen.add(event.plan.mode);
        if (event.type === 'BONUS_AWARDED' && event.kind === 'GOLDEN') golden += 1;
        if (event.type === 'COMBO_CHANGED' && event.combo.multiplierIncreased) multiplierRises += 1;
      }
      expect(session.score).toBeGreaterThanOrEqual(lastScore);
      lastScore = session.score;
    };

    while (session.shiftStatus && session.shiftStatus.plan.number < 9) {
      const events = session.update(STEP_MS);
      if (session.activeParcel) events.push(...session.choose(correctSide(session)));
      record(events);
    }

    expect(seen).toEqual(new Set(['COLOR', 'SHAPE', 'REVERSE', 'COMBINATION']));
    expect(golden).toBeGreaterThan(0);
    expect(multiplierRises).toBeGreaterThanOrEqual(3);
    expect(session.mistakes).toBe(0);

    const ending = stepUntil(session, (events) => events.some((e) => e.type === 'RUN_ENDED'));
    expect(eventTypes(ending).filter((t) => t === 'PARCEL_MISSED')).toHaveLength(3);
    expect(session.isOver).toBe(true);
    expect(firstEvent(ending, 'RUN_ENDED').stats).toMatchObject({ shiftReached: 9, shiftsCompleted: 8, mistakeCount: 3 });
    expect(session.update(1000)).toEqual([]);
    expect(session.choose('LEFT')).toEqual([]);
  });

  it('never has more than one parcel in play and resolves each exactly once', () => {
    const session = makeShiftSession({ maxMistakes: 100_000 }, 12);
    const decide = createSeededRandom(6);
    let spawned = 0;
    let resolved = 0;
    for (let frame = 0; frame < 30_000; frame += 1) {
      const events = session.update(STEP_MS);
      if (session.activeParcel && decide() < 0.02) events.push(...session.choose(decide() < 0.8 ? correctSide(session) : wrongSide(session)));
      for (const event of events) {
        if (event.type === 'PARCEL_SPAWNED') {
          expect(spawned).toBe(resolved);
          spawned += 1;
        }
        if (event.type === 'PARCEL_SORTED' || event.type === 'PARCEL_MISSED') resolved += 1;
      }
    }
    expect(spawned).toBeGreaterThan(100);
    expect(resolved + (session.activeParcel ? 1 : 0)).toBe(spawned);
  });

  it('requires a rule or a shift manager', () => {
    expect(() => new RunSession({ random: createSeededRandom(1) })).toThrow();
  });
});
