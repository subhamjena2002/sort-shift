import { describe, expect, it } from 'vitest';
import { intentForKey } from '../src/game/config/controls';
import { destinationFor } from '../src/game/systems/RuleEvaluator';
import { clauseExamples, createShiftBriefing } from '../src/game/systems/ShiftBriefing';
import { generateShiftPlan, ShiftManager } from '../src/game/systems/ShiftManager';
import type { BinSide } from '../src/types/game';

function briefingFor(shift: number) {
  return createShiftBriefing(generateShiftPlan(shift), shift > 1 ? generateShiftPlan(shift - 1) : null);
}

describe('shift briefing — the card contents', () => {
  it('states the shift number and mode', () => {
    expect(briefingFor(4)).toMatchObject({ shiftLabel: 'SHIFT 04', modeName: 'COMBINATION SORTING' });
    expect(briefingFor(12).shiftLabel).toBe('SHIFT 12');
    expect(briefingFor(123).shiftLabel).toBe('SHIFT 123');
  });

  it('lists every mapping for both bins, exactly as the rule routes them', () => {
    for (let shift = 1; shift <= 60; shift += 1) {
      const plan = generateShiftPlan(shift);
      const briefing = briefingFor(shift);
      expect(briefing.entries.LEFT.length + briefing.entries.RIGHT.length).toBe(plan.rule.clauses.length);
      for (const side of ['LEFT', 'RIGHT'] as BinSide[]) {
        for (const entry of briefing.entries[side]) {
          expect(entry.label.length).toBeGreaterThan(0);
          expect(entry.examples.length).toBeGreaterThan(0);
          // Every parcel the card shows really goes in the bin it is shown under.
          for (const example of entry.examples) expect(destinationFor(plan.rule, example)).toBe(side);
        }
      }
    }
  });

  it('matches the combination example from the design', () => {
    const { entries } = briefingFor(4);
    expect(entries.LEFT.map((e) => e.label)).toEqual(['BLUE CIRCLE', 'RED SQUARE']);
    expect(entries.RIGHT.map((e) => e.label)).toEqual(['BLUE SQUARE', 'RED CIRCLE']);
  });

  it('only shows parcels that can actually appear in the shift', () => {
    for (let shift = 1; shift <= 40; shift += 1) {
      const { rule } = generateShiftPlan(shift);
      for (const clause of rule.clauses) {
        for (const parcel of clauseExamples(clause, rule.domain)) {
          expect(rule.domain.colors).toContain(parcel.color);
          expect(rule.domain.shapes).toContain(parcel.shape);
        }
      }
    }
  });
});

describe('shift briefing — what changed', () => {
  it('describes each transition of the opening cycle', () => {
    expect(briefingFor(1).change).toBe('First shift of the run.');
    expect(briefingFor(2).change).toContain('Shape only');
    expect(briefingFor(3).change).toBe('Back to color, with LEFT and RIGHT swapped.');
    expect(briefingFor(4).change).toContain('Color and shape');
  });

  it('calls out newly introduced colors', () => {
    expect(briefingFor(5).change).toContain('New: YELLOW and GREEN.');
  });

  it('says when the reversal applies to the rule just played', () => {
    expect(briefingFor(7).change).toBe('Same rule as last shift, with LEFT and RIGHT swapped.');
  });

  it('always has a change description', () => {
    for (let shift = 1; shift <= 200; shift += 1) expect(briefingFor(shift).change.length).toBeGreaterThan(0);
  });
});

describe('shift briefing — reverse highlighting', () => {
  it('flags every reversed mapping with where it used to go', () => {
    const { entries, warning } = briefingFor(3);
    expect(warning).toBe(true);
    expect(entries.LEFT.every((e) => e.note === 'WAS RIGHT')).toBe(true);
    expect(entries.RIGHT.every((e) => e.note === 'WAS LEFT')).toBe(true);
  });

  it('adds no reversal notes to other modes', () => {
    for (const shift of [1, 2, 4, 5]) {
      const { entries, warning } = briefingFor(shift);
      expect(warning).toBe(false);
      expect([...entries.LEFT, ...entries.RIGHT].every((e) => e.note === null)).toBe(true);
    }
  });
});

describe('shift briefing — first-time learning', () => {
  it('gives each mode a longer explanation and worked example on first sight', () => {
    for (const shift of [1, 2, 3, 4]) {
      const briefing = briefingFor(shift);
      expect(briefing.firstTime).toBe(true);
      expect(briefing.worked).not.toBeNull();
      expect(briefing.explanation.length).toBeGreaterThan(briefingFor(shift + 8).explanation.length);
    }
  });

  it('returns to a concise card when a mode comes back', () => {
    for (const shift of [5, 6, 7, 8, 40]) {
      const briefing = briefingFor(shift);
      expect(briefing.firstTime).toBe(false);
      expect(briefing.worked).toBeNull();
    }
  });

  it('never gives a worked example that contradicts the rule', () => {
    for (const shift of [1, 2, 3, 4]) {
      const plan = generateShiftPlan(shift);
      const worked = briefingFor(shift).worked;
      if (!worked) throw new Error('expected a worked example');
      expect(destinationFor(plan.rule, worked.parcel)).toBe('LEFT');
    }
  });
});

describe('ShiftManager briefing', () => {
  it('stays in step with the plan', () => {
    const manager = new ShiftManager();
    expect(manager.briefing.shiftLabel).toBe('SHIFT 01');
    manager.advance();
    expect(manager.briefing.shiftLabel).toBe('SHIFT 02');
    expect(manager.briefing.change).toContain('Shape only');
  });

  it('only calls colors new the first time the run shows them', () => {
    const manager = new ShiftManager();
    const notes: string[] = [];
    for (let shift = 2; shift <= 16; shift += 1) {
      manager.advance();
      notes.push(manager.briefing.change);
    }
    expect(notes.filter((note) => note.includes('New:'))).toEqual([expect.stringContaining('New: YELLOW and GREEN.')]);
    expect(new ShiftManager(undefined, 9).briefing.change).not.toContain('New:');
  });

  it('can start from a later shift, with an accurate change note', () => {
    const manager = new ShiftManager(undefined, 5);
    expect(manager.plan.number).toBe(5);
    expect(manager.briefing.change).toContain('Color only');
  });
});

describe('ready and mute keys', () => {
  it('maps Enter and Space to READY, N to MUTE', () => {
    expect(intentForKey('ENTER')).toBe('READY');
    expect(intentForKey('SPACE')).toBe('READY');
    expect(intentForKey('N')).toBe('MUTE');
  });
});
