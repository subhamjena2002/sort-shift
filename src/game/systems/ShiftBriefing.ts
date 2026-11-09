import type { BinSide, ParcelAttributes, ParcelColor, RuleMode } from '../../types/game';
import { PARCEL_COLORS, PARCEL_SHAPES } from '../data/parcelCatalog';
import type { RuleClause } from '../data/sortingRules';
import { clausesForSide } from './RuleEvaluator';
import type { RuleDomain } from './RuleSet';
import type { ShiftPlan } from './ShiftManager';

/** One line of the rule card: what goes in this bin, with parcels to show for it. */
export interface BriefingEntry {
  readonly clause: RuleClause;
  /** Full name, e.g. "BLUE CIRCLE". */
  readonly label: string;
  /** Parcels to draw as illustrations of this entry. */
  readonly examples: readonly ParcelAttributes[];
  /** Highlight for a mapping that moved, e.g. "WAS RIGHT". */
  readonly note: string | null;
}

/** A worked decision shown when a mechanic is new. */
export interface WorkedExample {
  readonly parcel: ParcelAttributes;
  readonly text: string;
}

/** Everything the shift announcement presents, free of rendering concerns. */
export interface ShiftBriefing {
  readonly shiftLabel: string;
  readonly modeName: string;
  /** What is different from the previous shift. */
  readonly change: string;
  /** Short explanation; longer the first time a mode appears. */
  readonly explanation: string;
  readonly firstTime: boolean;
  readonly worked: WorkedExample | null;
  /** True for a reversal, which gets a stronger visual warning. */
  readonly warning: boolean;
  readonly entries: Readonly<Record<BinSide, readonly BriefingEntry[]>>;
}

const MODE_NAMES: Readonly<Record<RuleMode, string>> = {
  COLOR: 'COLOR SORTING',
  SHAPE: 'SHAPE SORTING',
  REVERSE: 'REVERSE SORTING',
  COMBINATION: 'COMBINATION SORTING',
};

/** Longer explanations for the first time a player meets a mode. */
const FIRST_TIME_EXPLANATIONS: Readonly<Record<RuleMode, string>> = {
  COLOR: 'Every parcel has a color and a shape. In this mode only the color decides its bin.',
  SHAPE: 'Color is now a distraction. Only the outline of the parcel decides its bin.',
  REVERSE: 'A rule you already know comes back with LEFT and RIGHT swapped. Trust this card, not your memory.',
  COMBINATION: 'Color and shape must both match an entry on this card. The same color can go to either bin.',
};

const MAX_EXAMPLES = 2;

function clauseLabel(clause: RuleClause): string {
  const { color, shape } = clause.when;
  return [color && PARCEL_COLORS[color].label, shape && PARCEL_SHAPES[shape].label].filter(Boolean).join(' ');
}

/** Parcels that illustrate a clause, drawn from what can actually appear this shift. */
export function clauseExamples(clause: RuleClause, domain: RuleDomain): ParcelAttributes[] {
  const colors = clause.when.color ? [clause.when.color] : domain.colors;
  const shapes = clause.when.shape ? [clause.when.shape] : domain.shapes;
  return colors.flatMap((color) => shapes.map((shape): ParcelAttributes => ({ color, shape }))).slice(0, MAX_EXAMPLES);
}

function otherSide(side: BinSide): BinSide {
  return side === 'LEFT' ? 'RIGHT' : 'LEFT';
}

function describeChange(plan: ShiftPlan, previous: ShiftPlan | null, seenColors: readonly ParcelColor[]): string {
  if (!previous) return 'First shift of the run.';
  const { rule, mode } = plan;
  const newColors = rule.domain.colors.filter((color) => !seenColors.includes(color));
  const colorNote = newColors.length > 0 ? ` New: ${newColors.map((c) => PARCEL_COLORS[c].label).join(' and ')}.` : '';

  switch (mode) {
    case 'COLOR':
      return `Color only now. Shape no longer matters.${colorNote}`;
    case 'SHAPE':
      return `Shape only now. Color no longer matters.${colorNote}`;
    case 'COMBINATION':
      return `Color and shape now decide together.${colorNote}`;
    case 'REVERSE': {
      if (rule.reversedFrom === previous.rule.id) return 'Same rule as last shift, with LEFT and RIGHT swapped.';
      const attribute = rule.clauses.some((clause) => clause.when.color) ? 'color' : 'shape';
      return `Back to ${attribute}, with LEFT and RIGHT swapped.${colorNote}`;
    }
  }
}

function buildWorkedExample(plan: ShiftPlan, entries: Readonly<Record<BinSide, readonly BriefingEntry[]>>): WorkedExample | null {
  const first = entries.LEFT[0];
  const parcel = first?.examples[0];
  if (!first || !parcel) return null;
  const name = `${PARCEL_COLORS[parcel.color].label} ${PARCEL_SHAPES[parcel.shape].label}`;

  switch (plan.mode) {
    case 'COLOR':
      return { parcel, text: `${name} goes LEFT, because ${first.label} goes LEFT. Its shape does not count.` };
    case 'SHAPE':
      return { parcel, text: `${name} goes LEFT, because ${first.label} goes LEFT. Its color does not count.` };
    case 'REVERSE':
      return { parcel, text: `${name} now goes LEFT. Before the swap it went RIGHT.` };
    case 'COMBINATION': {
      const twin: ParcelAttributes = { color: parcel.color, shape: parcel.shape === 'CIRCLE' ? 'SQUARE' : 'CIRCLE' };
      return { parcel, text: `${name} goes LEFT, but ${PARCEL_COLORS[twin.color].label} ${PARCEL_SHAPES[twin.shape].label} goes RIGHT.` };
    }
  }
}

/**
 * Turn a shift plan into the content of its announcement card.
 * `seenColors` is every colour the run has shown so far, so only colours that
 * are truly new get called out.
 */
export function createShiftBriefing(
  plan: ShiftPlan,
  previous: ShiftPlan | null,
  seenColors: readonly ParcelColor[] = previous?.rule.domain.colors ?? [],
): ShiftBriefing {
  const { rule, mode, warning, firstOfMode } = plan;
  const entriesFor = (side: BinSide): BriefingEntry[] =>
    clausesForSide(rule, side).map((clause) => ({
      clause,
      label: clauseLabel(clause),
      examples: clauseExamples(clause, rule.domain),
      note: rule.reversedFrom ? `WAS ${otherSide(side)}` : null,
    }));
  const entries = { LEFT: entriesFor('LEFT'), RIGHT: entriesFor('RIGHT') };

  return {
    shiftLabel: `SHIFT ${String(plan.number).padStart(2, '0')}`,
    modeName: MODE_NAMES[mode],
    change: describeChange(plan, previous, seenColors),
    explanation: firstOfMode ? FIRST_TIME_EXPLANATIONS[mode] : rule.instruction,
    firstTime: firstOfMode,
    worked: firstOfMode ? buildWorkedExample(plan, entries) : null,
    warning,
    entries,
  };
}
