import type { BinSide, MistakeReason, Parcel, ParcelColor, ParcelKind, RunStats } from '../../types/game';
import { DEFAULT_DIFFICULTY, speedStepFor, travelTimeFor, type DifficultyConfig } from '../config/difficulty';
import {
  DEFAULT_BONUSES,
  DEFAULT_COMBO,
  DEFAULT_GOLDEN,
  SCORING,
  type BonusConfig,
  type ComboConfig,
  type GoldenParcelConfig,
} from '../config/scoring';
import type { SortingRule } from '../data/sortingRules';
import { SPAWNABLE_COLORS } from '../data/parcelCatalog';
import type { RandomSource } from '../utils/random';
import { BonusParcelSystem } from './BonusParcelSystem';
import { ComboSystem, type ComboUpdate } from './ComboSystem';
import { MistakeTracker } from './MistakeTracker';
import { ParcelFactory } from './ParcelFactory';
import { judgeSort, resolveDestination } from './RuleEvaluator';
import { perfectShiftBonus, ScoreSystem } from './ScoreSystem';
import type { ShiftManager, ShiftPlan } from './ShiftManager';

/**
 * WAITING    – counting down to the next spawn (also covers resolve animations).
 * ACTIVE     – one parcel is travelling towards the decision line.
 * TRANSITION – the belt is empty while a new shift is announced.
 * ENDED      – the mistake allowance is used up; the run is over.
 */
export type SessionPhase = 'WAITING' | 'ACTIVE' | 'TRANSITION' | 'ENDED';

export interface ActiveParcelState {
  readonly parcel: Parcel;
  /** 0 at the spawn point, 1 at the decision line. */
  readonly progress: number;
  readonly travelTimeMs: number;
  readonly inDecisionZone: boolean;
  /** The rule this parcel will be judged by, fixed when it spawned. */
  readonly rule: SortingRule;
}

export type BonusKind = 'STREAK' | 'GOLDEN' | 'PERFECT_SHIFT';

export type SessionEvent =
  | { readonly type: 'PARCEL_SPAWNED'; readonly parcel: Parcel; readonly travelTimeMs: number; readonly rule: SortingRule }
  | {
      readonly type: 'PARCEL_SORTED';
      readonly parcel: Parcel;
      readonly chosen: BinSide;
      readonly expected: BinSide | null;
      readonly correct: boolean;
      readonly pointsAwarded: number;
      readonly progress: number;
    }
  | { readonly type: 'PARCEL_MISSED'; readonly parcel: Parcel; readonly expected: BinSide | null }
  | { readonly type: 'SCORE_CHANGED'; readonly score: number; readonly correctCount: number }
  | {
      readonly type: 'MISTAKES_CHANGED';
      readonly mistakes: number;
      readonly remaining: number;
      readonly reason: MistakeReason;
    }
  | { readonly type: 'COMBO_CHANGED'; readonly combo: ComboUpdate }
  | { readonly type: 'BONUS_AWARDED'; readonly kind: BonusKind; readonly points: number }
  | { readonly type: 'SHIFT_COMPLETED'; readonly shift: number; readonly perfect: boolean; readonly bonus: number }
  | { readonly type: 'SHIFT_ANNOUNCED'; readonly plan: ShiftPlan; readonly durationMs: number; readonly opening: boolean }
  | { readonly type: 'SHIFT_STARTED'; readonly plan: ShiftPlan }
  | { readonly type: 'RUN_ENDED'; readonly stats: RunStats };

export interface RunSessionOptions {
  /** Plays one rule forever, with flat scoring. Ignored when `shifts` is given. */
  readonly rule?: SortingRule;
  /** Plays the endless shift progression, with combos and bonuses. */
  readonly shifts?: ShiftManager;
  readonly random: RandomSource;
  readonly difficulty?: DifficultyConfig;
  readonly pointsPerCorrect?: number;
  readonly maxMistakes?: number;
  readonly colors?: readonly ParcelColor[];
  readonly combo?: ComboConfig;
  readonly bonuses?: BonusConfig;
  readonly golden?: GoldenParcelConfig;
}

export interface ShiftStatus {
  readonly plan: ShiftPlan;
  readonly correct: number;
  readonly mistakes: number;
}

export interface ComboStatus {
  readonly streak: number;
  readonly multiplier: number;
  readonly bestStreak: number;
  readonly nextTierAt: number | null;
}

export type TransitionStage = 'SETTLING' | 'ANNOUNCING';

export interface TransitionStatus {
  readonly stage: TransitionStage;
  readonly plan: ShiftPlan;
  readonly opening: boolean;
  readonly remainingMs: number;
  readonly durationMs: number;
}

interface MutableActiveParcel {
  readonly parcel: Parcel;
  readonly rule: SortingRule;
  progress: number;
  readonly travelTimeMs: number;
}

interface MutableTransition {
  stage: TransitionStage;
  remainingMs: number;
  durationMs: number;
  readonly opening: boolean;
}

/** The systems only a shift-based run needs. */
interface ShiftRun {
  readonly shifts: ShiftManager;
  readonly combo: ComboSystem;
  readonly golden: BonusParcelSystem;
  readonly bonuses: BonusConfig;
  perfectShifts: number;
}

/**
 * The complete rules of one run, with no rendering or Phaser dependency.
 *
 * Scenes drive it with `update(deltaMs)` every frame and `choose(side)` on
 * player input, then react to the returned events. Because time only moves
 * through `update`, the session is fully deterministic for a given seed and
 * sequence of calls, and naturally freezes when the game is paused.
 *
 * Invariants:
 * - At most one parcel is active, and a new one only spawns after the
 *   previous one has been resolved (sorted or missed).
 * - Every spawned parcel is resolved exactly once: it is either sorted
 *   (correctly or not) or counted as missed when it passes the decision line.
 * - A parcel is judged by the rule in force when it spawned, and the rule only
 *   changes during a TRANSITION, when the belt is empty.
 */
export class RunSession {
  private readonly fixedRule: SortingRule;
  private readonly difficulty: DifficultyConfig;
  private readonly factory: ParcelFactory;
  private readonly scoreSystem: ScoreSystem;
  private readonly mistakeTracker: MistakeTracker;
  private readonly shiftRun: ShiftRun | null;

  private currentPhase: SessionPhase = 'WAITING';
  private waitRemainingMs: number;
  private active: MutableActiveParcel | null = null;
  private transitionState: MutableTransition | null = null;
  private resolved = 0;

  constructor(options: RunSessionOptions) {
    const rule = options.shifts?.plan.rule ?? options.rule;
    if (!rule) throw new Error('RunSession needs either a rule or a ShiftManager');
    this.fixedRule = rule;
    this.difficulty = options.difficulty ?? DEFAULT_DIFFICULTY;
    this.factory = new ParcelFactory(
      options.random,
      options.colors ?? SPAWNABLE_COLORS,
      this.difficulty.maxSameColorInARow,
    );
    this.scoreSystem = new ScoreSystem(options.pointsPerCorrect ?? SCORING.pointsPerCorrect);
    this.mistakeTracker = new MistakeTracker(options.maxMistakes ?? SCORING.maxMistakes);
    this.waitRemainingMs = this.difficulty.firstSpawnDelayMs;

    this.shiftRun = options.shifts
      ? {
          shifts: options.shifts,
          combo: new ComboSystem(options.combo ?? DEFAULT_COMBO),
          golden: new BonusParcelSystem(options.random, options.golden ?? DEFAULT_GOLDEN),
          bonuses: options.bonuses ?? DEFAULT_BONUSES,
          perfectShifts: 0,
        }
      : null;

    if (this.shiftRun) {
      const openingMs = this.shiftRun.shifts.timing.openingMs;
      this.currentPhase = 'TRANSITION';
      this.transitionState = { stage: 'SETTLING', remainingMs: openingMs, durationMs: openingMs, opening: true };
    }
  }

  // ---------------------------------------------------------------- queries

  /** The rule currently in force; always the one on display. */
  get rule(): SortingRule {
    return this.shiftRun?.shifts.plan.rule ?? this.fixedRule;
  }

  get phase(): SessionPhase {
    return this.currentPhase;
  }

  get isOver(): boolean {
    return this.currentPhase === 'ENDED';
  }

  get score(): number {
    return this.scoreSystem.score;
  }

  get correctCount(): number {
    return this.scoreSystem.correctCount;
  }

  get mistakes(): number {
    return this.mistakeTracker.mistakes;
  }

  get mistakesRemaining(): number {
    return this.mistakeTracker.remaining;
  }

  get maxMistakes(): number {
    return this.mistakeTracker.maxMistakes;
  }

  get parcelsResolved(): number {
    return this.resolved;
  }

  /** 1-based speed level for display. */
  get speedLevel(): number {
    if (this.shiftRun) return this.shiftRun.shifts.plan.difficulty.speedLevel;
    return speedStepFor(this.scoreSystem.correctCount, this.difficulty) + 1;
  }

  /** Travel time of the active parcel, or of the next one if none is active. */
  get currentTravelTimeMs(): number {
    return this.active?.travelTimeMs ?? this.nextTravelTimeMs();
  }

  get activeParcel(): ActiveParcelState | null {
    if (this.active === null) return null;
    return {
      parcel: this.active.parcel,
      progress: this.active.progress,
      travelTimeMs: this.active.travelTimeMs,
      inDecisionZone: this.active.progress >= this.difficulty.decisionZoneStart,
      rule: this.active.rule,
    };
  }

  /** Progress through the current shift; null for a fixed-rule session. */
  get shiftStatus(): ShiftStatus | null {
    if (!this.shiftRun) return null;
    const { shifts } = this.shiftRun;
    return { plan: shifts.plan, correct: shifts.correctInShift, mistakes: shifts.mistakesInShift };
  }

  get comboStatus(): ComboStatus | null {
    if (!this.shiftRun) return null;
    const { combo } = this.shiftRun;
    return { streak: combo.streak, multiplier: combo.multiplier, bestStreak: combo.bestStreak, nextTierAt: combo.nextTierAt };
  }

  /** The running shift change, or null outside of one. */
  get transition(): TransitionStatus | null {
    if (!this.shiftRun || !this.transitionState) return null;
    const { stage, remainingMs, durationMs, opening } = this.transitionState;
    return { stage, remainingMs, durationMs, opening, plan: this.shiftRun.shifts.plan };
  }

  get stats(): RunStats {
    const base: RunStats = {
      score: this.scoreSystem.score,
      correctCount: this.scoreSystem.correctCount,
      mistakeCount: this.mistakeTracker.mistakes,
      parcelsResolved: this.resolved,
    };
    if (!this.shiftRun) return base;
    const { shifts, combo, perfectShifts } = this.shiftRun;
    return { ...base, shiftReached: shifts.plan.number, shiftsCompleted: shifts.shiftsCompleted, perfectShifts, bestStreak: combo.bestStreak };
  }

  // --------------------------------------------------------------- commands

  /** Advance the simulation. Non-positive or non-finite deltas are ignored. */
  update(deltaMs: number): SessionEvent[] {
    if (this.currentPhase === 'ENDED' || !Number.isFinite(deltaMs) || deltaMs <= 0) return [];
    if (this.currentPhase === 'TRANSITION') return this.advanceTransition(deltaMs);

    if (this.currentPhase === 'WAITING') {
      this.waitRemainingMs -= deltaMs;
      if (this.waitRemainingMs > 0) return [];
      return [this.spawn()];
    }

    const active = this.active;
    if (active === null) return [];

    active.progress = Math.min(1, active.progress + deltaMs / active.travelTimeMs);
    if (active.progress < 1) return [];

    // The parcel crossed the decision line without a choice: it's a miss.
    const events: SessionEvent[] = [
      {
        type: 'PARCEL_MISSED',
        parcel: active.parcel,
        expected: resolveDestination(active.rule, active.parcel.attributes),
      },
    ];
    this.recordMistake('MISSED', events);
    this.finishResolution(events);
    return events;
  }

  /**
   * Player picks a bin for the active parcel. Returns no events (and changes
   * nothing) when there is no parcel to sort, so repeated or late input can
   * never sort the same parcel twice.
   */
  choose(side: BinSide): SessionEvent[] {
    const active = this.active;
    if (this.currentPhase !== 'ACTIVE' || active === null) return [];
    if (active.progress < this.difficulty.inputOpensAt) return [];

    const judgement = judgeSort(active.rule, active.parcel.attributes, side);
    const combo = judgement.correct ? (this.shiftRun?.combo.registerCorrect() ?? null) : null;
    const pointsAwarded = judgement.correct ? this.scoreSystem.awardCorrect(combo?.multiplier ?? 1) : 0;

    const events: SessionEvent[] = [
      {
        type: 'PARCEL_SORTED',
        parcel: active.parcel,
        chosen: side,
        expected: judgement.expected,
        correct: judgement.correct,
        pointsAwarded,
        progress: active.progress,
      },
    ];

    if (judgement.correct) {
      if (combo) this.applyComboRewards(combo, active.parcel.kind, events);
      this.shiftRun?.shifts.recordCorrect();
      this.pushScoreChanged(events);
    } else {
      this.recordMistake('WRONG_BIN', events);
    }

    this.finishResolution(events);
    return events;
  }

  // ---------------------------------------------------------------- helpers

  private nextTravelTimeMs(): number {
    if (this.shiftRun) return this.shiftRun.shifts.plan.difficulty.travelMs;
    return travelTimeFor(this.scoreSystem.correctCount, this.difficulty);
  }

  private spawn(): SessionEvent {
    const rule = this.rule;
    const parcel = this.createParcel();
    const travelTimeMs = this.nextTravelTimeMs();
    this.active = { parcel, rule, progress: 0, travelTimeMs };
    this.currentPhase = 'ACTIVE';
    return { type: 'PARCEL_SPAWNED', parcel, travelTimeMs, rule };
  }

  private createParcel(): Parcel {
    if (!this.shiftRun) return this.factory.create();
    const { shifts, golden } = this.shiftRun;
    const { domain } = shifts.plan.rule;
    const kind: ParcelKind = golden.rollForSpawn(shifts.plan.number) ? 'GOLDEN' : 'STANDARD';
    return this.factory.create({ colors: domain.colors, shapes: domain.shapes, kind });
  }

  private pushScoreChanged(events: SessionEvent[]): void {
    events.push({ type: 'SCORE_CHANGED', score: this.scoreSystem.score, correctCount: this.scoreSystem.correctCount });
  }

  private pushBonus(kind: BonusKind, points: number, events: SessionEvent[]): number {
    const awarded = this.scoreSystem.awardBonus(points);
    if (awarded > 0) events.push({ type: 'BONUS_AWARDED', kind, points: awarded });
    return awarded;
  }

  private applyComboRewards(combo: ComboUpdate, kind: ParcelKind, events: SessionEvent[]): void {
    events.push({ type: 'COMBO_CHANGED', combo });
    this.pushBonus('STREAK', combo.streakBonus, events);
    if (kind === 'GOLDEN' && this.shiftRun) this.pushBonus('GOLDEN', this.shiftRun.bonuses.goldenBonus, events);
  }

  private recordMistake(reason: MistakeReason, events: SessionEvent[]): void {
    if (this.shiftRun) {
      this.shiftRun.shifts.recordMistake();
      const combo = this.shiftRun.combo.registerMistake();
      if (combo.broken) events.push({ type: 'COMBO_CHANGED', combo });
    }
    if (!this.mistakeTracker.record(reason)) return;
    events.push({
      type: 'MISTAKES_CHANGED',
      mistakes: this.mistakeTracker.mistakes,
      remaining: this.mistakeTracker.remaining,
      reason,
    });
  }

  private finishResolution(events: SessionEvent[]): void {
    this.active = null;
    this.resolved += 1;

    if (this.mistakeTracker.isExhausted) {
      this.currentPhase = 'ENDED';
      events.push({ type: 'RUN_ENDED', stats: this.stats });
      return;
    }

    if (this.shiftRun?.shifts.isQuotaMet) {
      this.completeShift(this.shiftRun, events);
      return;
    }

    this.currentPhase = 'WAITING';
    this.waitRemainingMs = this.shiftRun
      ? this.shiftRun.shifts.plan.difficulty.spawnGapMs
      : this.difficulty.resolveDelayMs + this.difficulty.spawnDelayMs;
  }

  private completeShift(run: ShiftRun, events: SessionEvent[]): void {
    const { plan, isPerfect } = run.shifts;
    if (isPerfect) run.perfectShifts += 1;
    const bonus = isPerfect ? this.scoreSystem.awardBonus(perfectShiftBonus(plan.number, run.bonuses)) : 0;
    events.push({ type: 'SHIFT_COMPLETED', shift: plan.number, perfect: isPerfect, bonus });
    if (bonus > 0) {
      events.push({ type: 'BONUS_AWARDED', kind: 'PERFECT_SHIFT', points: bonus });
      this.pushScoreChanged(events);
    }
    const { settleMs } = run.shifts.timing;
    this.currentPhase = 'TRANSITION';
    this.transitionState = { stage: 'SETTLING', remainingMs: settleMs, durationMs: settleMs, opening: false };
  }

  private advanceTransition(deltaMs: number): SessionEvent[] {
    const run = this.shiftRun;
    const transition = this.transitionState;
    if (!run || !transition) return [];

    transition.remainingMs -= deltaMs;
    if (transition.remainingMs > 0) return [];

    if (transition.stage === 'SETTLING') {
      if (!transition.opening) {
        run.shifts.advance();
        run.golden.onShiftStart();
      }
      const { plan } = run.shifts;
      transition.stage = 'ANNOUNCING';
      transition.remainingMs = plan.announcementMs;
      transition.durationMs = plan.announcementMs;
      return [{ type: 'SHIFT_ANNOUNCED', plan, durationMs: plan.announcementMs, opening: transition.opening }];
    }

    this.transitionState = null;
    this.currentPhase = 'WAITING';
    this.waitRemainingMs = run.shifts.timing.readyDelayMs;
    return [{ type: 'SHIFT_STARTED', plan: run.shifts.plan }];
  }
}
