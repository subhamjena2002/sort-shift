import { describe, expect, it } from 'vitest';
import { ParcelFactory } from '../src/game/systems/ParcelFactory';
import { createSeededRandom } from '../src/game/utils/random';

describe('ParcelFactory', () => {
  it('assigns unique increasing ids', () => {
    const factory = new ParcelFactory(createSeededRandom(1), ['BLUE', 'RED']);
    expect([factory.create().id, factory.create().id, factory.create().id]).toEqual([1, 2, 3]);
  });

  it('never exceeds the same-colour streak limit', () => {
    const factory = new ParcelFactory(createSeededRandom(99), ['BLUE', 'RED'], 3);
    let streak = 0;
    let last: string | null = null;
    for (let i = 0; i < 2000; i += 1) {
      const color = factory.create().attributes.color;
      streak = color === last ? streak + 1 : 1;
      last = color;
      expect(streak).toBeLessThanOrEqual(3);
    }
  });

  it('produces both colours with a fair distribution', () => {
    const factory = new ParcelFactory(createSeededRandom(5), ['BLUE', 'RED'], 3);
    let blue = 0;
    for (let i = 0; i < 2000; i += 1) if (factory.create().attributes.color === 'BLUE') blue += 1;
    expect(blue).toBeGreaterThan(850);
    expect(blue).toBeLessThan(1150);
  });

  it('still works with a single colour even when a streak limit is set', () => {
    const factory = new ParcelFactory(createSeededRandom(5), ['RED'], 2);
    for (let i = 0; i < 10; i += 1) expect(factory.create().attributes.color).toBe('RED');
  });

  it('requires at least one colour', () => {
    expect(() => new ParcelFactory(createSeededRandom(1), [])).toThrow();
  });
});
