import { DEFAULT_GOLDEN, type GoldenParcelConfig } from '../config/scoring';
import type { RandomSource } from '../utils/random';

/**
 * Decides which spawns become golden parcels. Decisions come only from the
 * seeded random source and the spawn history, so a seed replays exactly.
 */
export class BonusParcelSystem {
  private readonly random: RandomSource;
  private readonly config: GoldenParcelConfig;
  private parcelsSinceGolden: number;
  private goldenThisShift = 0;

  constructor(random: RandomSource, config: GoldenParcelConfig = DEFAULT_GOLDEN) {
    this.random = random;
    this.config = config;
    this.parcelsSinceGolden = config.minParcelsBetween;
  }

  /** Call once per spawn. Returns true when this spawn should be golden. */
  rollForSpawn(shiftNumber: number): boolean {
    const eligible =
      shiftNumber >= this.config.unlockShift &&
      this.goldenThisShift < this.config.maxPerShift &&
      this.parcelsSinceGolden >= this.config.minParcelsBetween;

    if (eligible && this.random() < this.config.spawnChance) {
      this.parcelsSinceGolden = 0;
      this.goldenThisShift += 1;
      return true;
    }
    this.parcelsSinceGolden += 1;
    return false;
  }

  onShiftStart(): void {
    this.goldenThisShift = 0;
  }
}
