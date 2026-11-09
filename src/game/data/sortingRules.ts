import type { BinSide, ParcelAttributes, ParcelColor, ParcelShape, RuleMode } from '../../types/game';

/**
 * A single "if the parcel looks like this, send it there" instruction.
 * `when` lists attribute values that must ALL match (logical AND), so
 * `{ when: { color: 'BLUE', shape: 'CIRCLE' }, destination: 'LEFT' }` needs
 * no special handling anywhere.
 */
export interface RuleClause {
  readonly when: Readonly<Partial<ParcelAttributes>>;
  readonly destination: BinSide;
}

/**
 * An ordered list of clauses. The first matching clause decides the
 * destination, so more specific clauses should be listed first.
 */
export interface SortingRule {
  readonly id: string;
  readonly title: string;
  readonly clauses: readonly RuleClause[];
}

export const COLOR_SORT_RULE: SortingRule = {
  id: 'color-basic',
  title: 'SORTING RULE',
  clauses: [
    { when: { color: 'BLUE' }, destination: 'LEFT' },
    { when: { color: 'RED' }, destination: 'RIGHT' },
  ],
};

/** Rule used by a fixed-rule session. */
export const DEFAULT_RULE: SortingRule = COLOR_SORT_RULE;

/** Short mode names shown on the HUD. */
export const MODE_LABELS: Readonly<Record<RuleMode, string>> = {
  COLOR: 'COLOR',
  SHAPE: 'SHAPE',
  REVERSE: 'REVERSE',
  COMBINATION: 'COMBINATION',
};

function colorRule(id: string, left: readonly ParcelColor[], right: readonly ParcelColor[]): SortingRule {
  return {
    id,
    title: 'SORT BY COLOR',
    clauses: [
      ...left.map((color): RuleClause => ({ when: { color }, destination: 'LEFT' })),
      ...right.map((color): RuleClause => ({ when: { color }, destination: 'RIGHT' })),
    ],
  };
}

function shapeRule(id: string, left: ParcelShape, right: ParcelShape): SortingRule {
  return {
    id,
    title: 'SORT BY SHAPE',
    clauses: [
      { when: { shape: left }, destination: 'LEFT' },
      { when: { shape: right }, destination: 'RIGHT' },
    ],
  };
}

type Combo = readonly [ParcelColor, ParcelShape];

function combinationRule(id: string, left: readonly Combo[], right: readonly Combo[]): SortingRule {
  const clause = ([color, shape]: Combo, destination: BinSide): RuleClause => ({ when: { color, shape }, destination });
  return {
    id,
    title: 'COMBINATION: COLOR + SHAPE',
    clauses: [...left.map((combo) => clause(combo, 'LEFT')), ...right.map((combo) => clause(combo, 'RIGHT'))],
  };
}

/**
 * Rule libraries the shift generator walks through, one entry per cycle.
 * Order is the difficulty ramp: pairs first, then four-colour mappings.
 */
export const COLOR_RULE_LIBRARY: readonly SortingRule[] = [
  colorRule('color-blue-red', ['BLUE'], ['RED']),
  colorRule('color-yellow-green', ['YELLOW'], ['GREEN']),
  colorRule('color-four-a', ['BLUE', 'YELLOW'], ['RED', 'GREEN']),
  colorRule('color-four-b', ['BLUE', 'GREEN'], ['RED', 'YELLOW']),
  colorRule('color-four-c', ['RED', 'GREEN'], ['BLUE', 'YELLOW']),
];

export const SHAPE_RULE_LIBRARY: readonly SortingRule[] = [
  shapeRule('shape-circle-left', 'CIRCLE', 'SQUARE'),
  shapeRule('shape-square-left', 'SQUARE', 'CIRCLE'),
];

export const COMBINATION_RULE_LIBRARY: readonly SortingRule[] = [
  combinationRule('combo-blue-red', [['BLUE', 'CIRCLE'], ['RED', 'SQUARE']], [['BLUE', 'SQUARE'], ['RED', 'CIRCLE']]),
  combinationRule('combo-yellow-green', [['YELLOW', 'SQUARE'], ['GREEN', 'CIRCLE']], [['YELLOW', 'CIRCLE'], ['GREEN', 'SQUARE']]),
  combinationRule('combo-blue-yellow', [['BLUE', 'SQUARE'], ['YELLOW', 'CIRCLE']], [['BLUE', 'CIRCLE'], ['YELLOW', 'SQUARE']]),
  combinationRule('combo-red-green', [['RED', 'CIRCLE'], ['GREEN', 'SQUARE']], [['RED', 'SQUARE'], ['GREEN', 'CIRCLE']]),
];
