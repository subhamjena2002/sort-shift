import { describe, expect, it } from 'vitest';
import { SPAWNABLE_COLORS } from '../src/game/data/parcelCatalog';
import { COLOR_SORT_RULE, DEFAULT_RULE, type SortingRule } from '../src/game/data/sortingRules';
import {
  clauseMatches,
  clausesForSide,
  judgeSort,
  resolveDestination,
  ruleCoversColors,
} from '../src/game/systems/RuleEvaluator';

describe('RuleEvaluator', () => {
  describe('correct sorting', () => {
    it('accepts BLUE → LEFT', () => {
      expect(judgeSort(COLOR_SORT_RULE, { color: 'BLUE' }, 'LEFT')).toEqual({ correct: true, expected: 'LEFT' });
    });

    it('accepts RED → RIGHT', () => {
      expect(judgeSort(COLOR_SORT_RULE, { color: 'RED' }, 'RIGHT')).toEqual({ correct: true, expected: 'RIGHT' });
    });
  });

  describe('incorrect sorting', () => {
    it('rejects BLUE → RIGHT and reports the expected bin', () => {
      expect(judgeSort(COLOR_SORT_RULE, { color: 'BLUE' }, 'RIGHT')).toEqual({ correct: false, expected: 'LEFT' });
    });

    it('rejects RED → LEFT and reports the expected bin', () => {
      expect(judgeSort(COLOR_SORT_RULE, { color: 'RED' }, 'LEFT')).toEqual({ correct: false, expected: 'RIGHT' });
    });

    it('treats a parcel the rule does not cover as wrong for either bin', () => {
      const blueOnly: SortingRule = { id: 'blue-only', title: 'T', clauses: [{ when: { color: 'BLUE' }, destination: 'LEFT' }] };
      expect(judgeSort(blueOnly, { color: 'RED' }, 'LEFT')).toEqual({ correct: false, expected: null });
      expect(judgeSort(blueOnly, { color: 'RED' }, 'RIGHT')).toEqual({ correct: false, expected: null });
    });
  });

  it('uses the first matching clause (order defines priority)', () => {
    const rule: SortingRule = {
      id: 'priority',
      title: 'T',
      clauses: [
        { when: { color: 'BLUE' }, destination: 'RIGHT' },
        { when: { color: 'BLUE' }, destination: 'LEFT' },
      ],
    };
    expect(resolveDestination(rule, { color: 'BLUE' })).toBe('RIGHT');
  });

  it('never matches an empty clause (no accidental catch-all)', () => {
    expect(clauseMatches({ when: {}, destination: 'LEFT' }, { color: 'BLUE' })).toBe(false);
  });

  it('the default rule gives every spawnable colour a destination', () => {
    expect(ruleCoversColors(DEFAULT_RULE, SPAWNABLE_COLORS)).toBe(true);
  });

  it('lists the clauses routed into each bin', () => {
    expect(clausesForSide(COLOR_SORT_RULE, 'LEFT').map((c) => c.when.color)).toEqual(['BLUE']);
    expect(clausesForSide(COLOR_SORT_RULE, 'RIGHT').map((c) => c.when.color)).toEqual(['RED']);
  });
});
