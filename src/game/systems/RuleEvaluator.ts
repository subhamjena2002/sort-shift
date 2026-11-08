import type { BinSide, ParcelAttributeKey, ParcelAttributes, ParcelColor } from '../../types/game';
import type { RuleClause, SortingRule } from '../data/sortingRules';

/** True when every attribute named in the clause matches the parcel. */
export function clauseMatches(clause: RuleClause, attributes: ParcelAttributes): boolean {
  const keys = Object.keys(clause.when) as ParcelAttributeKey[];
  // An empty clause would match everything; treat it as invalid instead.
  if (keys.length === 0) return false;
  return keys.every((key) => clause.when[key] === attributes[key]);
}

/** The bin a parcel belongs in under `rule`, or null if no clause applies. */
export function resolveDestination(rule: SortingRule, attributes: ParcelAttributes): BinSide | null {
  for (const clause of rule.clauses) {
    if (clauseMatches(clause, attributes)) return clause.destination;
  }
  return null;
}

export interface SortJudgement {
  readonly correct: boolean;
  /** Where the parcel should have gone (null if the rule does not cover it). */
  readonly expected: BinSide | null;
}

/** Validate a player's choice against the parcel's actual attributes. */
export function judgeSort(rule: SortingRule, attributes: ParcelAttributes, chosen: BinSide): SortJudgement {
  const expected = resolveDestination(rule, attributes);
  return { correct: expected !== null && expected === chosen, expected };
}

/** Clauses that route parcels into a given bin (used to label the bins). */
export function clausesForSide(rule: SortingRule, side: BinSide): RuleClause[] {
  return rule.clauses.filter((clause) => clause.destination === side);
}

/** True when the rule gives every listed colour a destination. */
export function ruleCoversColors(rule: SortingRule, colors: readonly ParcelColor[]): boolean {
  return colors.every((color) => resolveDestination(rule, { color }) !== null);
}
