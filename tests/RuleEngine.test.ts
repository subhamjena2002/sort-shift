import { describe, expect, it } from 'vitest';
import { ALL_COLORS, ALL_SHAPES } from '../src/game/data/parcelCatalog';
import {
  COLOR_RULE_LIBRARY,
  COMBINATION_RULE_LIBRARY,
  SHAPE_RULE_LIBRARY,
  type SortingRule,
} from '../src/game/data/sortingRules';
import { destinationFor, judgeSort, resolveDestination, RuleResolutionError } from '../src/game/systems/RuleEvaluator';
import {
  colorsInRule,
  createRuleSet,
  domainCombinations,
  findRuleIssues,
  reverseRuleSet,
  RuleValidationError,
  shapesInRule,
  type RuleSet,
} from '../src/game/systems/RuleSet';
import type { ParcelColor, ParcelShape } from '../src/types/game';
import { glyphForClause, glyphsForSide } from '../src/game/ui/ruleGlyphs';

const FULL_DOMAIN = { colors: ALL_COLORS, shapes: ALL_SHAPES };

function asRuleSet(rule: SortingRule, mode: RuleSet['mode'], domain = FULL_DOMAIN): RuleSet {
  return createRuleSet({ ...rule, mode, domain, instruction: 'test' });
}

const fourColor = asRuleSet(
  {
    id: 'four',
    title: 'T',
    clauses: [
      { when: { color: 'BLUE' }, destination: 'LEFT' },
      { when: { color: 'YELLOW' }, destination: 'LEFT' },
      { when: { color: 'RED' }, destination: 'RIGHT' },
      { when: { color: 'GREEN' }, destination: 'RIGHT' },
    ],
  },
  'COLOR',
);

describe('four-colour rules', () => {
  it.each<[ParcelColor, 'LEFT' | 'RIGHT']>([
    ['BLUE', 'LEFT'],
    ['YELLOW', 'LEFT'],
    ['RED', 'RIGHT'],
    ['GREEN', 'RIGHT'],
  ])('routes %s to %s regardless of shape', (color, side) => {
    for (const shape of ALL_SHAPES) expect(destinationFor(fourColor, { color, shape })).toBe(side);
  });
});

describe('shape rules', () => {
  const rule = asRuleSet(
    {
      id: 'shape',
      title: 'T',
      clauses: [
        { when: { shape: 'CIRCLE' }, destination: 'LEFT' },
        { when: { shape: 'SQUARE' }, destination: 'RIGHT' },
      ],
    },
    'SHAPE',
  );

  it('ignores colour entirely', () => {
    for (const color of ALL_COLORS) {
      expect(destinationFor(rule, { color, shape: 'CIRCLE' })).toBe('LEFT');
      expect(destinationFor(rule, { color, shape: 'SQUARE' })).toBe('RIGHT');
    }
  });
});

describe('reverse rules', () => {
  it('swaps every destination of the source rule', () => {
    const reversed = reverseRuleSet(fourColor, 'swap');
    for (const parcel of domainCombinations(FULL_DOMAIN)) {
      expect(destinationFor(reversed, parcel)).not.toBe(destinationFor(fourColor, parcel));
    }
    expect(reversed.mode).toBe('REVERSE');
    expect(reversed.reversedFrom).toBe('four');
    expect(reversed.id).not.toBe(fourColor.id);
  });

  it('does not modify the source rule', () => {
    reverseRuleSet(fourColor, 'swap');
    expect(destinationFor(fourColor, { color: 'BLUE', shape: 'CIRCLE' })).toBe('LEFT');
  });

  it('restores the original mappings when applied twice', () => {
    const twice = reverseRuleSet(reverseRuleSet(fourColor, 'a'), 'b');
    for (const parcel of domainCombinations(FULL_DOMAIN)) {
      expect(destinationFor(twice, parcel)).toBe(destinationFor(fourColor, parcel));
    }
  });
});

describe('combination rules', () => {
  const rule = asRuleSet(
    {
      id: 'combo',
      title: 'T',
      clauses: [
        { when: { color: 'BLUE', shape: 'CIRCLE' }, destination: 'LEFT' },
        { when: { color: 'RED', shape: 'SQUARE' }, destination: 'LEFT' },
        { when: { color: 'BLUE', shape: 'SQUARE' }, destination: 'RIGHT' },
        { when: { color: 'RED', shape: 'CIRCLE' }, destination: 'RIGHT' },
      ],
    },
    'COMBINATION',
    { colors: ['BLUE', 'RED'], shapes: ALL_SHAPES },
  );

  it.each<[ParcelColor, ParcelShape, 'LEFT' | 'RIGHT']>([
    ['BLUE', 'CIRCLE', 'LEFT'],
    ['RED', 'SQUARE', 'LEFT'],
    ['BLUE', 'SQUARE', 'RIGHT'],
    ['RED', 'CIRCLE', 'RIGHT'],
  ])('routes %s %s to %s', (color, shape, side) => {
    expect(judgeSort(rule, { color, shape }, side)).toEqual({ correct: true, expected: side });
  });

  it('needs both attributes to match', () => {
    expect(resolveDestination(rule, { color: 'BLUE' })).toBeNull();
    expect(resolveDestination(rule, { shape: 'CIRCLE' })).toBeNull();
  });
});

describe('missing or invalid rules', () => {
  const blueOnly: SortingRule = { id: 'blue', title: 'T', clauses: [{ when: { color: 'BLUE' }, destination: 'LEFT' }] };
  const domain = { colors: ['BLUE', 'RED'] as ParcelColor[], shapes: ['SQUARE'] as ParcelShape[] };

  it('reports a parcel with no destination', () => {
    expect(findRuleIssues(blueOnly, domain)).toContain('no destination for RED SQUARE');
  });

  it('rejects an incomplete rule when it is created', () => {
    expect(() => asRuleSet(blueOnly, 'COLOR', domain)).toThrow(RuleValidationError);
  });

  it('rejects contradictory clauses as ambiguous', () => {
    const rule: SortingRule = {
      id: 'x',
      title: 'T',
      clauses: [
        { when: { color: 'BLUE' }, destination: 'LEFT' },
        { when: { shape: 'SQUARE' }, destination: 'RIGHT' },
        { when: { color: 'RED' }, destination: 'RIGHT' },
      ],
    };
    expect(findRuleIssues(rule, domain)).toContain('ambiguous destination for BLUE SQUARE');
  });

  it('allows overlapping clauses that agree', () => {
    const rule: SortingRule = {
      id: 'x',
      title: 'T',
      clauses: [
        { when: { color: 'BLUE' }, destination: 'LEFT' },
        { when: { color: 'BLUE', shape: 'SQUARE' }, destination: 'LEFT' },
        { when: { color: 'RED' }, destination: 'RIGHT' },
      ],
    };
    expect(findRuleIssues(rule, domain)).toEqual([]);
  });

  it('rejects empty clauses, an empty rule and an empty domain', () => {
    expect(findRuleIssues({ id: 'x', title: 'T', clauses: [] }, domain)).toContain('rule has no clauses');
    expect(findRuleIssues({ id: 'x', title: 'T', clauses: [{ when: {}, destination: 'LEFT' }] }, domain)).toContain('clause 0 matches nothing');
    expect(findRuleIssues(blueOnly, { colors: [], shapes: ['SQUARE'] })).toContain('domain has no colors');
    expect(findRuleIssues(blueOnly, { colors: ['BLUE'], shapes: [] })).toContain('domain has no shapes');
  });

  it('rejects unknown attribute values and destinations', () => {
    const rule = {
      id: 'x',
      title: 'T',
      clauses: [{ when: { color: 'PINK', shape: 'HEX' }, destination: 'UP' }],
    } as unknown as SortingRule;
    const issues = findRuleIssues(rule, domain);
    expect(issues).toContain('clause 0 has unknown color "PINK"');
    expect(issues).toContain('clause 0 has unknown shape "HEX"');
    expect(issues).toContain('clause 0 has invalid destination "UP"');
  });

  it('rejects a rule that sends everything to one bin', () => {
    const rule: SortingRule = {
      id: 'x',
      title: 'T',
      clauses: [
        { when: { color: 'BLUE' }, destination: 'LEFT' },
        { when: { color: 'RED' }, destination: 'LEFT' },
      ],
    };
    expect(findRuleIssues(rule, domain)).toContain('rule never uses both bins');
  });

  it('throws instead of returning undefined for an uncovered parcel', () => {
    expect(() => destinationFor(blueOnly, { color: 'RED', shape: 'SQUARE' })).toThrow(RuleResolutionError);
  });
});

describe('rule libraries', () => {
  const entries: ReadonlyArray<readonly [string, SortingRule]> = [
    ...COLOR_RULE_LIBRARY.map((r) => ['color', r] as const),
    ...SHAPE_RULE_LIBRARY.map((r) => ['shape', r] as const),
    ...COMBINATION_RULE_LIBRARY.map((r) => ['combination', r] as const),
  ];

  it.each(entries)('%s rule is complete and unambiguous', (kind, rule) => {
    const colors = kind === 'shape' ? ALL_COLORS : colorsInRule(rule);
    const shapes = kind === 'color' ? ALL_SHAPES : shapesInRule(rule);
    expect(findRuleIssues(rule, { colors, shapes })).toEqual([]);
  });
});

describe('rule display', () => {
  it('never relies on colour alone: colour clauses carry the colour name', () => {
    expect(glyphForClause({ when: { color: 'RED' }, destination: 'LEFT' })).toMatchObject({ text: 'RED', longText: 'RED', shape: null });
  });

  it('names the shape for shape clauses', () => {
    expect(glyphForClause({ when: { shape: 'CIRCLE' }, destination: 'LEFT' })).toMatchObject({ text: 'CIRCLE', shape: 'CIRCLE', fill: null });
  });

  it('names both attributes for combination clauses', () => {
    expect(glyphForClause({ when: { color: 'BLUE', shape: 'SQUARE' }, destination: 'LEFT' })).toMatchObject({ longText: 'BLUE SQUARE', shape: 'SQUARE' });
  });

  it('groups a rule by destination', () => {
    expect(glyphsForSide(fourColor, 'LEFT').map((g) => g.text)).toEqual(['BLUE', 'YELLOW']);
    expect(glyphsForSide(fourColor, 'RIGHT').map((g) => g.text)).toEqual(['RED', 'GREEN']);
  });
});
