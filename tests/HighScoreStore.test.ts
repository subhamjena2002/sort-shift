import { describe, expect, it } from 'vitest';
import { HIGH_SCORE_STORAGE_KEY, HighScoreStore, parseStoredScore } from '../src/game/systems/HighScoreStore';
import { MemoryStorage, getBrowserStorage, type KeyValueStorage } from '../src/game/utils/storage';

class ThrowingStorage implements KeyValueStorage {
  getItem(): string | null {
    throw new Error('SecurityError: storage disabled');
  }
  setItem(): void {
    throw new Error('QuotaExceededError');
  }
}

describe('HighScoreStore', () => {
  it('defaults to 0 when nothing is stored', () => {
    expect(new HighScoreStore(new MemoryStorage()).getBest()).toBe(0);
  });

  it('persists a new best score to storage', () => {
    const storage = new MemoryStorage();
    const store = new HighScoreStore(storage);
    expect(store.submit(120)).toEqual({ bestScore: 120, isNewBest: true });
    expect(storage.getItem(HIGH_SCORE_STORAGE_KEY)).toBe('120');
  });

  it('survives a reload (a new store instance reads the saved value)', () => {
    const storage = new MemoryStorage();
    new HighScoreStore(storage).submit(90);
    expect(new HighScoreStore(storage).getBest()).toBe(90);
  });

  it('does not overwrite a better score with a worse one', () => {
    const storage = new MemoryStorage();
    const store = new HighScoreStore(storage);
    store.submit(200);
    expect(store.submit(150)).toEqual({ bestScore: 200, isNewBest: false });
    expect(store.submit(200)).toEqual({ bestScore: 200, isNewBest: false });
    expect(storage.getItem(HIGH_SCORE_STORAGE_KEY)).toBe('200');
  });

  it('ignores corrupted or hostile stored values', () => {
    for (const raw of ['banana', '-50', 'NaN', 'Infinity', '']) {
      const storage = new MemoryStorage();
      storage.setItem(HIGH_SCORE_STORAGE_KEY, raw);
      expect(new HighScoreStore(storage).getBest()).toBe(0);
    }
    expect(parseStoredScore('42.9')).toBe(42);
    expect(parseStoredScore(null)).toBe(0);
  });

  it('sanitises submitted scores', () => {
    const store = new HighScoreStore(new MemoryStorage());
    expect(store.submit(Number.NaN)).toEqual({ bestScore: 0, isNewBest: false });
    expect(store.submit(-10)).toEqual({ bestScore: 0, isNewBest: false });
    expect(store.submit(33.7)).toEqual({ bestScore: 33, isNewBest: true });
  });

  it('keeps working when storage throws (private mode / blocked iframe)', () => {
    const store = new HighScoreStore(new ThrowingStorage());
    expect(store.getBest()).toBe(0);
    expect(store.submit(70)).toEqual({ bestScore: 70, isNewBest: true });
    expect(store.getBest()).toBe(70);
  });

  it('falls back to memory storage when localStorage is unavailable', () => {
    // The Node test environment has no window/localStorage at all.
    const storage = getBrowserStorage();
    expect(storage).toBeInstanceOf(MemoryStorage);
  });
});
