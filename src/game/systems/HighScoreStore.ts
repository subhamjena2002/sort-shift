import type { KeyValueStorage } from '../utils/storage';

export const HIGH_SCORE_STORAGE_KEY = 'sortshift.neonParcelDepot.bestScore.v1';

export interface HighScoreResult {
  readonly bestScore: number;
  readonly isNewBest: boolean;
}

/** Parse a stored value, rejecting anything that isn't a sane non-negative integer. */
export function parseStoredScore(raw: string | null): number {
  if (raw === null) return 0;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}

/** Reads and writes the local best score. Never throws on storage failures. */
export class HighScoreStore {
  private readonly storage: KeyValueStorage;
  private readonly key: string;
  private cached: number | null = null;

  constructor(storage: KeyValueStorage, key: string = HIGH_SCORE_STORAGE_KEY) {
    this.storage = storage;
    this.key = key;
  }

  getBest(): number {
    if (this.cached !== null) return this.cached;
    let raw: string | null = null;
    try {
      raw = this.storage.getItem(this.key);
    } catch {
      raw = null;
    }
    this.cached = parseStoredScore(raw);
    return this.cached;
  }

  /** Submit a finished run's score; persists it if it beats the best. */
  submit(score: number): HighScoreResult {
    const safeScore = Number.isFinite(score) ? Math.max(0, Math.floor(score)) : 0;
    const best = this.getBest();
    if (safeScore <= best) return { bestScore: best, isNewBest: false };

    this.cached = safeScore;
    try {
      this.storage.setItem(this.key, String(safeScore));
    } catch {
      // Storage full or blocked: keep the in-memory best for this session.
    }
    return { bestScore: safeScore, isNewBest: true };
  }
}
