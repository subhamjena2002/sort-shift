/** A function returning a float in [0, 1), like Math.random. */
export type RandomSource = () => number;

/**
 * Small, fast, deterministic PRNG (mulberry32). The same seed always yields
 * the same sequence, which keeps tests repeatable.
 */
export function createSeededRandom(seed: number): RandomSource {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A non-deterministic seed for real play sessions. */
export function randomSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}

/** Pick an element from a non-empty list. */
export function pick<T>(items: readonly T[], random: RandomSource): T {
  if (items.length === 0) throw new Error('pick() requires a non-empty list');
  const index = Math.min(items.length - 1, Math.floor(random() * items.length));
  return items[index] as T;
}
