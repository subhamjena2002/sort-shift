import type { Parcel, ParcelColor } from '../../types/game';
import { pick, type RandomSource } from '../utils/random';

/** Creates parcels with deterministic ids and seeded random attributes. */
export class ParcelFactory {
  private readonly random: RandomSource;
  private readonly colors: readonly ParcelColor[];
  private readonly maxSameInARow: number;
  private nextId = 1;
  private lastColor: ParcelColor | null = null;
  private streak = 0;

  constructor(random: RandomSource, colors: readonly ParcelColor[], maxSameInARow = 0) {
    if (colors.length === 0) throw new Error('ParcelFactory needs at least one colour');
    this.random = random;
    this.colors = colors;
    this.maxSameInARow = maxSameInARow;
  }

  create(): Parcel {
    let pool = this.colors;
    if (this.maxSameInARow > 0 && this.streak >= this.maxSameInARow && this.lastColor !== null) {
      const last = this.lastColor;
      const others = this.colors.filter((color) => color !== last);
      if (others.length > 0) pool = others;
    }

    const color = pick(pool, this.random);
    this.streak = color === this.lastColor ? this.streak + 1 : 1;
    this.lastColor = color;

    const parcel: Parcel = { id: this.nextId, attributes: { color } };
    this.nextId += 1;
    return parcel;
  }
}
