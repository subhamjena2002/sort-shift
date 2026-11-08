import type { BinSide, ParcelAttributeKey, ParcelColor, ParcelTraits } from '../../types/game';
import type { RuleClause, SortingRule } from '../data/sortingRules';

/** True when every attribute named in the clause matches the parcel. */
export function clauseMatches(clause: RuleClause, attributes: ParcelTraits): boolean {
  const keys = Object.keys(clause.when) as ParcelAttributeKey[];
  // An empty clause would match everything; treat it as invalid instead.
  if (keys.length === 0) return false;
  return keys.every((key) => clause.when[key] === attributes[key]);
}

/** The bin a parcel belongs in under `rule`, or null if no clause applies. */
export function resolveDestination(rule: SortingRule, attributes: ParcelTraits): BinSide | null {
  for (const clause of rule.clauses) {
    if (clauseMatches(clause, attributes)) return clause.destination;
  }
  return null;
}

/** Thrown when a rule is asked about a parcel it has no destination for. */
export class RuleResolutionError extends Error {
  constructor(ruleId: string, attributes: ParcelTraits) {
    super(`Rule "${ruleId}" has no destination for ${JSON.stringify(attributes)}`);
    this.name = 'RuleResolutionError';
  }
}

/** Like `resolveDestination`, but an uncovered parcel is an error rather than null. */
export function destinationFor(rule: SortingRule, attributes: ParcelTraits): BinSide {
  const destination = resolveDestination(rule, attributes);
  if (destination === null) throw new RuleResolutionError(rule.id, attributes);
  return destination;
}

export interface SortJudgement {
  readonly correct: boolean;
  /** Where the parcel should have gone (null if the rule does not cover it). */
  readonly expected: BinSide | null;
}

/** Validate a player's choice against the parcel's actual attributes. */
export function judgeSort(rule: SortingRule, attributes: ParcelTraits, chosen: BinSide): SortJudgement {
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
