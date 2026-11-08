import type { BinSide, ParcelAttributes, ParcelColor, ParcelShape, RuleMode } from '../../types/game';
import { ALL_COLORS, ALL_SHAPES } from '../data/parcelCatalog';
import type { RuleClause, SortingRule } from '../data/sortingRules';
import { clauseMatches } from './RuleEvaluator';

/** The parcel attribute values a rule promises to handle. */
export interface RuleDomain {
  readonly colors: readonly ParcelColor[];
  readonly shapes: readonly ParcelShape[];
}

/** A rule that has been proven complete and unambiguous for its domain. */
export interface RuleSet extends SortingRule {
  readonly mode: RuleMode;
  readonly domain: RuleDomain;
  /** One-line player instruction shown when the rule is introduced. */
  readonly instruction: string;
  /** Id of the rule this one reverses, if any. */
  readonly reversedFrom: string | null;
}

export type RuleSetDefinition = Omit<RuleSet, 'reversedFrom'> & { readonly reversedFrom?: string | null };

export class RuleValidationError extends Error {
  readonly issues: readonly string[];

  constructor(ruleId: string, issues: readonly string[]) {
    super(`Invalid sorting rule "${ruleId}": ${issues.join('; ')}`);
    this.name = 'RuleValidationError';
    this.issues = issues;
  }
}

/** Every colour × shape pair in the domain. */
export function domainCombinations(domain: RuleDomain): ParcelAttributes[] {
  return domain.colors.flatMap((color) => domain.shapes.map((shape): ParcelAttributes => ({ color, shape })));
}

function clauseIssues(clause: RuleClause, index: number): string[] {
  const issues: string[] = [];
  const { color, shape } = clause.when;
  if (color === undefined && shape === undefined) issues.push(`clause ${index} matches nothing`);
  if (color !== undefined && !ALL_COLORS.includes(color)) issues.push(`clause ${index} has unknown color "${String(color)}"`);
  if (shape !== undefined && !ALL_SHAPES.includes(shape)) issues.push(`clause ${index} has unknown shape "${String(shape)}"`);
  if (clause.destination !== 'LEFT' && clause.destination !== 'RIGHT') {
    issues.push(`clause ${index} has invalid destination "${String(clause.destination)}"`);
  }
  return issues;
}

/**
 * Everything wrong with `rule` for parcels in `domain`. Empty means every
 * parcel in the domain has exactly one possible destination.
 */
export function findRuleIssues(rule: SortingRule, domain: RuleDomain): string[] {
  const issues: string[] = [];
  if (rule.id.length === 0) issues.push('rule has no id');
  if (rule.clauses.length === 0) issues.push('rule has no clauses');
  if (domain.colors.length === 0) issues.push('domain has no colors');
  if (domain.shapes.length === 0) issues.push('domain has no shapes');
  rule.clauses.forEach((clause, index) => issues.push(...clauseIssues(clause, index)));

  const reachable = new Set<BinSide>();
  for (const parcel of domainCombinations(domain)) {
    const destinations = new Set(rule.clauses.filter((c) => clauseMatches(c, parcel)).map((c) => c.destination));
    const name = `${parcel.color} ${parcel.shape}`;
    if (destinations.size === 0) issues.push(`no destination for ${name}`);
    if (destinations.size > 1) issues.push(`ambiguous destination for ${name}`);
    for (const destination of destinations) reachable.add(destination);
  }
  if (rule.clauses.length > 0 && domainCombinations(domain).length > 0 && reachable.size < 2) {
    issues.push('rule never uses both bins');
  }
  return issues;
}

/** Validate a definition and return it as a RuleSet. Throws RuleValidationError. */
export function createRuleSet(definition: RuleSetDefinition): RuleSet {
  const issues = findRuleIssues(definition, definition.domain);
  if (issues.length > 0) throw new RuleValidationError(definition.id, issues);
  return { ...definition, reversedFrom: definition.reversedFrom ?? null };
}

/** The same rule with every destination swapped. */
export function reverseRuleSet(rule: RuleSet, instruction: string): RuleSet {
  return createRuleSet({
    ...rule,
    id: `${rule.id}:reversed`,
    title: `REVERSED ${rule.title}`,
    mode: 'REVERSE',
    instruction,
    reversedFrom: rule.id,
    clauses: rule.clauses.map((clause): RuleClause => ({
      when: clause.when,
      destination: clause.destination === 'LEFT' ? 'RIGHT' : 'LEFT',
    })),
  });
}

/** Colours named anywhere in the rule, in clause order and without repeats. */
export function colorsInRule(rule: SortingRule): ParcelColor[] {
  return [...new Set(rule.clauses.flatMap((c) => (c.when.color ? [c.when.color] : [])))];
}

/** Shapes named anywhere in the rule, in clause order and without repeats. */
export function shapesInRule(rule: SortingRule): ParcelShape[] {
  return [...new Set(rule.clauses.flatMap((c) => (c.when.shape ? [c.when.shape] : [])))];
}
