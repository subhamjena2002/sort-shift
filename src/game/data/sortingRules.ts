import type { BinSide, ParcelAttributes } from '../../types/game';

/**
 * A single "if the parcel looks like this, send it there" instruction.
 * `when` lists attribute values that must ALL match (logical AND).
 * Adding a `shape` attribute later means clauses like
 * `{ when: { color: 'BLUE', shape: 'CUBE' }, destination: 'LEFT' }` just work.
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

/** Rule used when a run starts. */
export const DEFAULT_RULE: SortingRule = COLOR_SORT_RULE;
