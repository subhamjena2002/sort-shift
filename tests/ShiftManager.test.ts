import { describe, expect, it } from 'vitest';
import { DEFAULT_PROGRESSION } from '../src/game/config/progression';
import { destinationFor } from '../src/game/systems/RuleEvaluator';
import { domainCombinations, findRuleIssues } from '../src/game/systems/RuleSet';
import { generateShiftPlan, ShiftManager } from '../src/game/systems/ShiftManager';

describe('shift generator — the opening shifts', () => {
  it('shift 1 is blue/red colour sorting at the slowest speed, with 10 parcels', () => {
    const plan = generateShiftPlan(1);
    expect(plan.mode).toBe('COLOR');
    expect(plan.quota).toBe(10);
    expect(plan.rule.domain.colors).toEqual(['BLUE', 'RED']);
    expect(destinationFor(plan.rule, { color: 'BLUE', shape: 'SQUARE' })).toBe('LEFT');
    expect(destinationFor(plan.rule, { color: 'RED', shape: 'SQUARE' })).toBe('RIGHT');
    expect(plan.difficulty.travelMs).toBe(DEFAULT_PROGRESSION.difficulty.baseTravelMs);
  });

  it('shift 2 is shape sorting on a faster belt', () => {
    const plan = generateShiftPlan(2);
    expect(plan.mode).toBe('SHAPE');
    expect(plan.rule.domain.shapes).toEqual(['CIRCLE', 'SQUARE']);
    expect(plan.difficulty.travelMs).toBeLessThan(generateShiftPlan(1).difficulty.travelMs);
  });

  it('shift 3 reverses the colour mappings of shift 1, with a warning', () => {
    const plan = generateShiftPlan(3);
    expect(plan.mode).toBe('REVERSE');
    expect(plan.warning).toBe(true);
    expect(plan.warningMs).toBeGreaterThan(0);
    expect(destinationFor(plan.rule, { color: 'BLUE', shape: 'CIRCLE' })).toBe('RIGHT');
    expect(destinationFor(plan.rule, { color: 'RED', shape: 'CIRCLE' })).toBe('LEFT');
  });

  it('shift 4 combines colour and shape with a shorter decision time', () => {
    const plan = generateShiftPlan(4);
    expect(plan.mode).toBe('COMBINATION');
    expect(plan.rule.clauses.every((c) => c.when.color && c.when.shape)).toBe(true);
    expect(plan.difficulty.travelMs).toBeLessThan(generateShiftPlan(3).difficulty.travelMs);
  });

  it('shift 5 returns to colour sorting at a higher speed', () => {
    const plan = generateShiftPlan(5);
    expect(plan.mode).toBe('COLOR');
    expect(plan.difficulty.travelMs).toBeLessThan(generateShiftPlan(1).difficulty.travelMs);
    expect(plan.rule.id).not.toBe(generateShiftPlan(1).rule.id);
  });
});

describe('shift generator — endless progression', () => {
  it('is deterministic: the same shift always produces the same plan', () => {
    for (const n of [1, 2, 3, 4, 5, 17, 42, 500]) {
      expect(generateShiftPlan(n)).toEqual(generateShiftPlan(n));
    }
  });

  it('matches a fixed reference sequence of modes and rules', () => {
    const summary = Array.from({ length: 12 }, (_, i) => {
      const plan = generateShiftPlan(i + 1);
      return `${plan.mode}:${plan.rule.id}:${plan.quota}`;
    });
    expect(summary).toEqual([
      'COLOR:color-blue-red:10',
      'SHAPE:shape-circle-left:10',
      'REVERSE:color-blue-red:reversed:10',
      'COMBINATION:combo-blue-red:10',
      'COLOR:color-yellow-green:11',
      'SHAPE:shape-square-left:11',
      'REVERSE:shape-square-left:reversed:11',
      'COMBINATION:combo-yellow-green:11',
      'COLOR:color-four-a:12',
      'SHAPE:shape-circle-left:12',
      'REVERSE:color-four-a:reversed:12',
      'COMBINATION:combo-blue-yellow:12',
    ]);
  });

  it('repeats the mode cycle indefinitely', () => {
    const { cycle } = DEFAULT_PROGRESSION;
    for (let n = 1; n <= 400; n += 1) {
      expect(generateShiftPlan(n).mode).toBe(cycle[(n - 1) % cycle.length]);
    }
  });

  it('never generates an incomplete or ambiguous rule, however far it runs', () => {
    for (let n = 1; n <= 1000; n += 1) {
      const { rule } = generateShiftPlan(n);
      expect(findRuleIssues(rule, rule.domain)).toEqual([]);
      for (const parcel of domainCombinations(rule.domain)) {
        expect(['LEFT', 'RIGHT']).toContain(destinationFor(rule, parcel));
      }
    }
  });

  it('keeps every rule small enough to read on the rule card', () => {
    for (let n = 1; n <= 200; n += 1) expect(generateShiftPlan(n).rule.clauses.length).toBeLessThanOrEqual(4);
  });

  it('grows the quota slowly and caps it', () => {
    expect(generateShiftPlan(5).quota).toBe(11);
    expect(generateShiftPlan(4000).quota).toBe(DEFAULT_PROGRESSION.maxQuota);
  });

  it('gives longer learning time to rules with more mappings', () => {
    const { transition } = DEFAULT_PROGRESSION;
    expect(generateShiftPlan(1).announcementMs).toBe(transition.announceMs + transition.learnMs);
    expect(generateShiftPlan(4).announcementMs).toBe(transition.announceMs + transition.learnMs + 2 * transition.learnPerExtraClauseMs);
  });

  it('rejects invalid shift numbers', () => {
    expect(() => generateShiftPlan(0)).toThrow();
    expect(() => generateShiftPlan(1.5)).toThrow();
  });
});

describe('ShiftManager', () => {
  it('starts at shift 1 with nothing recorded', () => {
    const manager = new ShiftManager();
    expect(manager.plan.number).toBe(1);
    expect(manager.correctInShift).toBe(0);
    expect(manager.isQuotaMet).toBe(false);
    expect(manager.isPerfect).toBe(true);
  });

  it('counts only correct sorts towards the quota', () => {
    const manager = new ShiftManager();
    for (let i = 0; i < 20; i += 1) manager.recordMistake();
    expect(manager.isQuotaMet).toBe(false);
    for (let i = 0; i < 9; i += 1) manager.recordCorrect();
    expect(manager.isQuotaMet).toBe(false);
    manager.recordCorrect();
    expect(manager.isQuotaMet).toBe(true);
  });

  it('clears per-shift counters when advancing', () => {
    const manager = new ShiftManager();
    manager.recordCorrect();
    manager.recordMistake();
    expect(manager.isPerfect).toBe(false);
    const next = manager.advance();
    expect(next.number).toBe(2);
    expect(manager.plan).toBe(next);
    expect(manager.correctInShift).toBe(0);
    expect(manager.isPerfect).toBe(true);
    expect(manager.shiftsCompleted).toBe(1);
  });
});
