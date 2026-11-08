import type { BinSide, MistakeReason, Parcel, ParcelColor, RunStats } from '../../types/game';
import { DEFAULT_DIFFICULTY, speedStepFor, travelTimeFor, type DifficultyConfig } from '../config/difficulty';
import { SCORING } from '../config/scoring';
import type { SortingRule } from '../data/sortingRules';
import { SPAWNABLE_COLORS } from '../data/parcelCatalog';
import type { RandomSource } from '../utils/random';
import { MistakeTracker } from './MistakeTracker';
import { ParcelFactory } from './ParcelFactory';
import { judgeSort, resolveDestination } from './RuleEvaluator';
import { ScoreSystem } from './ScoreSystem';

/**
 * WAITING – counting down to the next spawn (also covers resolve animations).
 * ACTIVE  – one parcel is travelling towards the decision line.
 * ENDED   – the mistake allowance is used up; the run is over.
 */
export type SessionPhase = 'WAITING' | 'ACTIVE' | 'ENDED';

export interface ActiveParcelState {
  readonly parcel: Parcel;
  /** 0 at the spawn point, 1 at the decision line. */
  readonly progress: number;
  readonly travelTimeMs: number;
  readonly inDecisionZone: boolean;
}

export type SessionEvent =
  | { readonly type: 'PARCEL_SPAWNED'; readonly parcel: Parcel; readonly travelTimeMs: number }
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
  | { readonly type: 'RUN_ENDED'; readonly stats: RunStats };

export interface RunSessionOptions {
  readonly rule: SortingRule;
  readonly random: RandomSource;
  readonly difficulty?: DifficultyConfig;
  readonly pointsPerCorrect?: number;
  readonly maxMistakes?: number;
  readonly colors?: readonly ParcelColor[];
}

interface MutableActiveParcel {
  readonly parcel: Parcel;
  progress: number;
  readonly travelTimeMs: number;
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
 */
export class RunSession {
  readonly rule: SortingRule;
  private readonly difficulty: DifficultyConfig;
  private readonly factory: ParcelFactory;
  private readonly scoreSystem: ScoreSystem;
  private readonly mistakeTracker: MistakeTracker;

  private currentPhase: SessionPhase = 'WAITING';
  private waitRemainingMs: number;
  private active: MutableActiveParcel | null = null;
  private resolved = 0;

  constructor(options: RunSessionOptions) {
    this.rule = options.rule;
    this.difficulty = options.difficulty ?? DEFAULT_DIFFICULTY;
    this.factory = new ParcelFactory(
      options.random,
      options.colors ?? SPAWNABLE_COLORS,
      this.difficulty.maxSameColorInARow,
    );
    this.scoreSystem = new ScoreSystem(options.pointsPerCorrect ?? SCORING.pointsPerCorrect);
    this.mistakeTracker = new MistakeTracker(options.maxMistakes ?? SCORING.maxMistakes);
    this.waitRemainingMs = this.difficulty.firstSpawnDelayMs;
  }

  // ---------------------------------------------------------------- queries

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
    return speedStepFor(this.scoreSystem.correctCount, this.difficulty) + 1;
  }

  /** Travel time of the active parcel, or of the next one if none is active. */
  get currentTravelTimeMs(): number {
    return this.active?.travelTimeMs ?? travelTimeFor(this.scoreSystem.correctCount, this.difficulty);
  }

  get activeParcel(): ActiveParcelState | null {
    if (this.active === null) return null;
    return {
      parcel: this.active.parcel,
      progress: this.active.progress,
      travelTimeMs: this.active.travelTimeMs,
      inDecisionZone: this.active.progress >= this.difficulty.decisionZoneStart,
    };
  }

  get stats(): RunStats {
    return {
      score: this.scoreSystem.score,
      correctCount: this.scoreSystem.correctCount,
      mistakeCount: this.mistakeTracker.mistakes,
      parcelsResolved: this.resolved,
    };
  }

  // --------------------------------------------------------------- commands

  /** Advance the simulation. Non-positive or non-finite deltas are ignored. */
  update(deltaMs: number): SessionEvent[] {
    if (this.currentPhase === 'ENDED' || !Number.isFinite(deltaMs) || deltaMs <= 0) return [];

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
        expected: resolveDestination(this.rule, active.parcel.attributes),
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

    const judgement = judgeSort(this.rule, active.parcel.attributes, side);
    const pointsAwarded = judgement.correct ? this.scoreSystem.awardCorrect() : 0;

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
      events.push({
        type: 'SCORE_CHANGED',
        score: this.scoreSystem.score,
        correctCount: this.scoreSystem.correctCount,
      });
    } else {
      this.recordMistake('WRONG_BIN', events);
    }

    this.finishResolution(events);
    return events;
  }

  // ---------------------------------------------------------------- helpers

  private spawn(): SessionEvent {
    const parcel = this.factory.create();
    const travelTimeMs = travelTimeFor(this.scoreSystem.correctCount, this.difficulty);
    this.active = { parcel, progress: 0, travelTimeMs };
    this.currentPhase = 'ACTIVE';
    return { type: 'PARCEL_SPAWNED', parcel, travelTimeMs };
  }

  private recordMistake(reason: MistakeReason, events: SessionEvent[]): void {
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

    this.currentPhase = 'WAITING';
    this.waitRemainingMs = this.difficulty.resolveDelayMs + this.difficulty.spawnDelayMs;
  }
}
