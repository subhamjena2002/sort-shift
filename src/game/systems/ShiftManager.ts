import type { ParcelColor, ParcelShape, RuleMode } from '../../types/game';
import { DEFAULT_PROGRESSION, type ProgressionConfig, type ReversibleMode, type RuleLibrary, type TransitionTiming } from '../config/progression';
import { ALL_COLORS, ALL_SHAPES } from '../data/parcelCatalog';
import type { SortingRule } from '../data/sortingRules';
import { computeShiftDifficulty, type ShiftDifficulty } from './DifficultyManager';
import { colorsInRule, createRuleSet, reverseRuleSet, shapesInRule, type RuleSet } from './RuleSet';
import { createShiftBriefing, type ShiftBriefing } from './ShiftBriefing';

/** Everything that defines one shift. Derived purely from its number and the config. */
export interface ShiftPlan {
  /** 1-based. */
  readonly number: number;
  /** 0-based count of completed trips through the mode cycle. */
  readonly cycle: number;
  readonly mode: RuleMode;
  readonly rule: RuleSet;
  /** Correct sorts needed to clear the shift. */
  readonly quota: number;
  readonly difficulty: ShiftDifficulty;
  /** True when the shift starts with a reversal warning. */
  readonly warning: boolean;
  /** True the first time this mode appears in a run. */
  readonly firstOfMode: boolean;
}

const INSTRUCTIONS: Readonly<Record<RuleMode, string>> = {
  COLOR: 'Read the parcel color. Ignore its shape.',
  SHAPE: 'Read the parcel shape. Ignore its color.',
  REVERSE: 'Every destination has swapped sides.',
  COMBINATION: 'Check color and shape together.',
};

const OPENING_COLORS: readonly ParcelColor[] = ['BLUE', 'RED'];
const OPENING_SHAPES: readonly ParcelShape[] = ['SQUARE'];

/** Walks a library one entry per cycle, looping over its hardest entries once exhausted. */
function libraryEntry(library: RuleLibrary, cycle: number): SortingRule {
  const { rules } = library;
  const loopFrom = Math.min(library.loopFrom, rules.length - 1);
  const index = cycle < rules.length ? cycle : loopFrom + ((cycle - loopFrom) % (rules.length - loopFrom));
  const rule = rules[index];
  if (!rule) throw new Error('Rule library is empty');
  return rule;
}

function colorRuleSet(cycle: number, shapes: readonly ParcelShape[], config: ProgressionConfig): RuleSet {
  const rule = libraryEntry(config.libraries.COLOR, cycle);
  return createRuleSet({ ...rule, mode: 'COLOR', instruction: INSTRUCTIONS.COLOR, domain: { colors: colorsInRule(rule), shapes } });
}

function shapeRuleSet(cycle: number, config: ProgressionConfig): RuleSet {
  const rule = libraryEntry(config.libraries.SHAPE, cycle);
  const colors = cycle === 0 ? OPENING_COLORS : ALL_COLORS;
  return createRuleSet({ ...rule, mode: 'SHAPE', instruction: INSTRUCTIONS.SHAPE, domain: { colors, shapes: shapesInRule(rule) } });
}

function reverseTarget(cycle: number, config: ProgressionConfig): ReversibleMode {
  return config.reverseTargets[cycle % config.reverseTargets.length] ?? 'COLOR';
}

function ruleForShift(number: number, cycle: number, mode: RuleMode, config: ProgressionConfig): RuleSet {
  switch (mode) {
    case 'COLOR':
      // The very first shift teaches colour alone, so shape is not yet a distraction.
      return colorRuleSet(cycle, number === 1 ? OPENING_SHAPES : ALL_SHAPES, config);
    case 'SHAPE':
      return shapeRuleSet(cycle, config);
    case 'REVERSE': {
      const base = reverseTarget(cycle, config) === 'COLOR' ? colorRuleSet(cycle, ALL_SHAPES, config) : shapeRuleSet(cycle, config);
      return reverseRuleSet(base, INSTRUCTIONS.REVERSE);
    }
    case 'COMBINATION': {
      const rule = libraryEntry(config.libraries.COMBINATION, cycle);
      return createRuleSet({
        ...rule,
        mode: 'COMBINATION',
        instruction: INSTRUCTIONS.COMBINATION,
        domain: { colors: colorsInRule(rule), shapes: shapesInRule(rule) },
      });
    }
  }
}

/**
 * The deterministic, endless shift generator. The result depends only on the
 * shift number and config, so no fixed list of shifts is needed and every
 * rule is validated before a player can ever see it.
 */
export function generateShiftPlan(shiftNumber: number, config: ProgressionConfig = DEFAULT_PROGRESSION): ShiftPlan {
  if (!Number.isInteger(shiftNumber) || shiftNumber < 1) throw new Error(`Invalid shift number: ${shiftNumber}`);
  const length = config.cycle.length;
  if (length === 0) throw new Error('Progression cycle is empty');

  const position = (shiftNumber - 1) % length;
  const cycle = Math.floor((shiftNumber - 1) / length);
  const mode = config.cycle[position];
  if (!mode) throw new Error('Progression cycle has a gap');

  const rule = ruleForShift(shiftNumber, cycle, mode, config);
  return {
    number: shiftNumber,
    cycle,
    mode,
    rule,
    quota: Math.min(config.maxQuota, config.baseQuota + cycle * config.quotaGrowthPerCycle),
    difficulty: computeShiftDifficulty(shiftNumber, mode, config.difficulty, rule.clauses.length),
    warning: mode === 'REVERSE',
    firstOfMode: cycle === 0 && config.cycle.indexOf(mode) === position,
  };
}

/** Tracks progress through the shifts of a single run. */
export class ShiftManager {
  readonly timing: TransitionTiming;
  private readonly config: ProgressionConfig;
  private currentPlan: ShiftPlan;
  private currentBriefing: ShiftBriefing;
  private correct = 0;
  private mistakes = 0;
  private completed = 0;
  private readonly seenColors = new Set<ParcelColor>();

  constructor(config: ProgressionConfig = DEFAULT_PROGRESSION, startShift = 1) {
    this.config = config;
    this.timing = config.transition;
    for (let shift = 1; shift < startShift; shift += 1) this.rememberColors(generateShiftPlan(shift, config));
    this.currentPlan = generateShiftPlan(startShift, config);
    this.currentBriefing = createShiftBriefing(this.currentPlan, startShift > 1 ? generateShiftPlan(startShift - 1, config) : null, [...this.seenColors]);
  }

  get plan(): ShiftPlan {
    return this.currentPlan;
  }

  get briefing(): ShiftBriefing {
    return this.currentBriefing;
  }

  get correctInShift(): number {
    return this.correct;
  }

  get mistakesInShift(): number {
    return this.mistakes;
  }

  get shiftsCompleted(): number {
    return this.completed;
  }

  get isQuotaMet(): boolean {
    return this.correct >= this.currentPlan.quota;
  }

  get isPerfect(): boolean {
    return this.mistakes === 0;
  }

  recordCorrect(): void {
    this.correct += 1;
  }

  recordMistake(): void {
    this.mistakes += 1;
  }

  /** Move to the next shift and clear per-shift counters. */
  advance(): ShiftPlan {
    this.completed += 1;
    this.correct = 0;
    this.mistakes = 0;
    const previous = this.currentPlan;
    this.rememberColors(previous);
    this.currentPlan = generateShiftPlan(previous.number + 1, this.config);
    this.currentBriefing = createShiftBriefing(this.currentPlan, previous, [...this.seenColors]);
    return this.currentPlan;
  }

  private rememberColors(plan: ShiftPlan): void {
    for (const color of plan.rule.domain.colors) this.seenColors.add(color);
  }
}
