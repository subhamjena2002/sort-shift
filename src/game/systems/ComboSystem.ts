import { DEFAULT_COMBO, type ComboConfig } from '../config/scoring';

/** Score multiplier earned by a streak of consecutive correct sorts. */
export function multiplierForStreak(streak: number, config: ComboConfig = DEFAULT_COMBO): number {
  return config.tiers.reduce((best, tier) => (streak >= tier.streak ? Math.max(best, tier.multiplier) : best), 1);
}

/** Bonus paid on reaching `streak`, or 0 if it is not a milestone. */
export function streakBonusFor(streak: number, config: ComboConfig = DEFAULT_COMBO): number {
  if (config.streakBonusEvery <= 0 || streak <= 0 || streak % config.streakBonusEvery !== 0) return 0;
  const milestone = streak / config.streakBonusEvery;
  return Math.min(config.maxStreakBonus, milestone * config.streakBonusPerMilestone);
}

/** Streak at which the next multiplier tier starts, or null at the top tier. */
export function nextTierStreak(streak: number, config: ComboConfig = DEFAULT_COMBO): number | null {
  const upcoming = config.tiers.map((tier) => tier.streak).filter((needed) => needed > streak);
  return upcoming.length > 0 ? Math.min(...upcoming) : null;
}

export interface ComboUpdate {
  readonly streak: number;
  readonly multiplier: number;
  /** True when this sort moved the streak into a higher tier. */
  readonly multiplierIncreased: boolean;
  /** True when a running streak was just lost. */
  readonly broken: boolean;
  /** The streak before this update. */
  readonly previousStreak: number;
  readonly streakBonus: number;
}

/** Counts consecutive correct sorts. Holds no timing or rendering state. */
export class ComboSystem {
  private readonly config: ComboConfig;
  private current = 0;
  private best = 0;

  constructor(config: ComboConfig = DEFAULT_COMBO) {
    this.config = config;
  }

  get streak(): number {
    return this.current;
  }

  get bestStreak(): number {
    return this.best;
  }

  get multiplier(): number {
    return multiplierForStreak(this.current, this.config);
  }

  get nextTierAt(): number | null {
    return nextTierStreak(this.current, this.config);
  }

  registerCorrect(): ComboUpdate {
    const previousStreak = this.current;
    const previousMultiplier = this.multiplier;
    this.current += 1;
    this.best = Math.max(this.best, this.current);
    return {
      streak: this.current,
      multiplier: this.multiplier,
      multiplierIncreased: this.multiplier > previousMultiplier,
      broken: false,
      previousStreak,
      streakBonus: streakBonusFor(this.current, this.config),
    };
  }

  registerMistake(): ComboUpdate {
    const previousStreak = this.current;
    this.current = 0;
    return {
      streak: 0,
      multiplier: 1,
      multiplierIncreased: false,
      broken: previousStreak > 0,
      previousStreak,
      streakBonus: 0,
    };
  }

  reset(): void {
    this.current = 0;
    this.best = 0;
  }
}
