import type { DifficultyConfig } from '../src/game/config/difficulty';
import { DEFAULT_DIFFICULTY } from '../src/game/config/difficulty';
import { DEFAULT_RULE } from '../src/game/data/sortingRules';
import { RunSession, type RunSessionOptions, type SessionEvent } from '../src/game/systems/RunSession';
import type { ParcelColor } from '../src/types/game';
import { createSeededRandom } from '../src/game/utils/random';

/** Fixed, easy-to-reason-about pacing for tests. */
export const TEST_DIFFICULTY: DifficultyConfig = {
  ...DEFAULT_DIFFICULTY,
  baseTravelMs: 1000,
  minTravelMs: 400,
  speedUpEvery: 5,
  speedUpFactor: 0.5,
  firstSpawnDelayMs: 100,
  resolveDelayMs: 50,
  spawnDelayMs: 50,
  inputOpensAt: 0,
};

export function makeSession(overrides: Partial<RunSessionOptions> & { colors?: readonly ParcelColor[] } = {}): RunSession {
  return new RunSession({
    rule: DEFAULT_RULE,
    random: createSeededRandom(1234),
    difficulty: TEST_DIFFICULTY,
    ...overrides,
  });
}

/** Advance in small frames until a parcel spawns; returns all events seen. */
export function advanceUntilSpawn(session: RunSession, stepMs = 16, maxMs = 10_000): SessionEvent[] {
  const events: SessionEvent[] = [];
  for (let t = 0; t < maxMs; t += stepMs) {
    const batch = session.update(stepMs);
    events.push(...batch);
    if (batch.some((e) => e.type === 'PARCEL_SPAWNED')) return events;
  }
  throw new Error('No parcel spawned within the time limit');
}

/** Advance in small frames for `durationMs`, collecting events. */
export function advance(session: RunSession, durationMs: number, stepMs = 16): SessionEvent[] {
  const events: SessionEvent[] = [];
  let elapsed = 0;
  while (elapsed < durationMs) {
    const step = Math.min(stepMs, durationMs - elapsed);
    events.push(...session.update(step));
    elapsed += step;
  }
  return events;
}

export function eventTypes(events: readonly SessionEvent[]): string[] {
  return events.map((e) => e.type);
}
