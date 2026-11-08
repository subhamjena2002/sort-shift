import type { Parcel, ParcelColor, ParcelKind, ParcelShape } from '../../types/game';
import { pick, type RandomSource } from '../utils/random';

/** Per-spawn overrides; anything omitted falls back to the factory defaults. */
export interface ParcelSpawnSpec {
  readonly colors?: readonly ParcelColor[];
  readonly shapes?: readonly ParcelShape[];
  readonly kind?: ParcelKind;
}

/** Picks values while refusing to repeat one more than `limit` times in a row. */
class StreakGuardedPicker<T> {
  private last: T | null = null;
  private streak = 0;

  next(pool: readonly T[], random: RandomSource, limit: number): T {
    let candidates = pool;
    if (limit > 0 && this.streak >= limit && this.last !== null) {
      const others = pool.filter((value) => value !== this.last);
      if (others.length > 0) candidates = others;
    }
    const value = pick(candidates, random);
    this.streak = value === this.last ? this.streak + 1 : 1;
    this.last = value;
    return value;
  }
}

/** Creates parcels with deterministic ids and seeded random attributes. */
export class ParcelFactory {
  private readonly random: RandomSource;
  private readonly colors: readonly ParcelColor[];
  private readonly shapes: readonly ParcelShape[];
  private readonly maxSameInARow: number;
  private readonly colorPicker = new StreakGuardedPicker<ParcelColor>();
  private readonly shapePicker = new StreakGuardedPicker<ParcelShape>();
  private nextId = 1;

  constructor(
    random: RandomSource,
    colors: readonly ParcelColor[],
    maxSameInARow = 0,
    shapes: readonly ParcelShape[] = ['SQUARE'],
  ) {
    if (colors.length === 0) throw new Error('ParcelFactory needs at least one colour');
    if (shapes.length === 0) throw new Error('ParcelFactory needs at least one shape');
    this.random = random;
    this.colors = colors;
    this.shapes = shapes;
    this.maxSameInARow = maxSameInARow;
  }

  create(spec: ParcelSpawnSpec = {}): Parcel {
    const color = this.colorPicker.next(spec.colors ?? this.colors, this.random, this.maxSameInARow);
    const shape = this.shapePicker.next(spec.shapes ?? this.shapes, this.random, this.maxSameInARow);
    const parcel: Parcel = { id: this.nextId, attributes: { color, shape }, kind: spec.kind ?? 'STANDARD' };
    this.nextId += 1;
    return parcel;
  }
}
