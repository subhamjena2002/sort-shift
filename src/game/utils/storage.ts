/** The subset of the Web Storage API the game relies on. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Non-persistent fallback used when localStorage is unavailable. */
export class MemoryStorage implements KeyValueStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

/**
 * Returns window.localStorage if it is usable. Access can throw in sandboxed
 * iframes, private browsing modes or when storage is disabled, in which case
 * an in-memory store is returned so the game keeps working.
 */
export function getBrowserStorage(): KeyValueStorage {
  try {
    const storage = window.localStorage;
    const probe = '__sortshift_probe__';
    storage.setItem(probe, probe);
    storage.removeItem(probe);
    return storage;
  } catch {
    return new MemoryStorage();
  }
}
