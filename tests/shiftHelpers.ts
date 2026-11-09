import { DEFAULT_DIFFICULTY } from '../src/game/config/difficulty';
import { DEFAULT_PROGRESSION, type ProgressionConfig } from '../src/game/config/progression';
import { destinationFor } from '../src/game/systems/RuleEvaluator';
import { RunSession, type RunSessionOptions, type SessionEvent } from '../src/game/systems/RunSession';
import { ShiftManager } from '../src/game/systems/ShiftManager';
import { createSeededRandom } from '../src/game/utils/random';
import type { BinSide } from '../src/types/game';

/** Short, round transition timings so timing assertions are easy to read. */
export const TEST_PROGRESSION: ProgressionConfig = {
  ...DEFAULT_PROGRESSION,
  transition: {
    openingMs: 100,
    settleMs: 200,
    countdownLeadMs: 50,
    countdownStepMs: 100,
    countdownFrom: 3,
    readyDelayMs: 100,
  },
};

export const STEP_MS = 10;

export function makeShiftSession(overrides: Partial<RunSessionOptions> = {}, seed = 1234): RunSession {
  return new RunSession({
    shifts: new ShiftManager(TEST_PROGRESSION),
    random: createSeededRandom(seed),
    difficulty: DEFAULT_DIFFICULTY,
    ...overrides,
  });
}

/** Step time until `done` holds; returns every event seen on the way. */
export function stepUntil(session: RunSession, done: (events: readonly SessionEvent[]) => boolean, maxMs = 60_000): SessionEvent[] {
  const seen: SessionEvent[] = [];
  for (let t = 0; t < maxMs; t += STEP_MS) {
    const batch = session.update(STEP_MS);
    seen.push(...batch);
    if (done(batch)) return seen;
  }
  throw new Error('Condition not reached within the time limit');
}

/** One frame of a player who confirms every announcement straight away. */
export function tick(session: RunSession, stepMs = STEP_MS): SessionEvent[] {
  const events = session.update(stepMs);
  if (session.transition?.stage === 'ANNOUNCING') events.push(...session.confirmReady());
  return events;
}

export function stepUntilSpawn(session: RunSession): SessionEvent[] {
  const seen: SessionEvent[] = [];
  for (let t = 0; t < 60_000; t += STEP_MS) {
    const batch = tick(session);
    seen.push(...batch);
    if (batch.some((e) => e.type === 'PARCEL_SPAWNED')) return seen;
  }
  throw new Error('No parcel spawned within the time limit');
}

export function correctSide(session: RunSession): BinSide {
  const active = session.activeParcel;
  if (!active) throw new Error('expected an active parcel');
  return destinationFor(active.rule, active.parcel.attributes);
}

export function wrongSide(session: RunSession): BinSide {
  return correctSide(session) === 'LEFT' ? 'RIGHT' : 'LEFT';
}

/** Wait for the next parcel and sort it correctly. Returns the events of the sort itself. */
export function sortNextCorrectly(session: RunSession): SessionEvent[] {
  stepUntilSpawn(session);
  return session.choose(correctSide(session));
}

/** Sort parcels correctly until the current shift is cleared. Returns all sort events. */
export function clearShift(session: RunSession): SessionEvent[] {
  const events: SessionEvent[] = [];
  while (!events.some((e) => e.type === 'SHIFT_COMPLETED')) events.push(...sortNextCorrectly(session));
  return events;
}

/** Clear shifts until the given shift number is being announced. */
export function playToShift(session: RunSession, shiftNumber: number): void {
  while (true) {
    const status = session.shiftStatus;
    if (!status) throw new Error('expected a shift-based session');
    if (status.plan.number >= shiftNumber) break;
    clearShift(session);
    stepUntil(session, (events) => events.some((e) => e.type === 'SHIFT_ANNOUNCED'));
  }
}
