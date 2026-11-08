import { describe, expect, it } from 'vitest';
import { LANDSCAPE_SIZE, PORTRAIT_SIZE } from '../src/game/config/display';
import { boxFits, computeLayout, type Box } from '../src/game/ui/layout';

function overlaps(a: Box, b: Box): boolean {
  return Math.abs(a.x - b.x) * 2 < a.width + b.width && Math.abs(a.y - b.y) * 2 < a.height + b.height;
}

/** Half-width of the belt housing either side of its centre. */
const HOUSING_MARGIN = 34;

describe.each([LANDSCAPE_SIZE, PORTRAIT_SIZE])('HUD panels at %o', (size) => {
  const layout = computeLayout(size.width, size.height);
  const panels = [layout.comboPanel, layout.shiftPanel];

  it('keeps the new panels on screen', () => {
    for (const box of [...panels, layout.announcement]) expect(boxFits(box, size.width, size.height)).toBe(true);
  });

  it('keeps the panels clear of the bins, rule panel and each other', () => {
    expect(overlaps(layout.comboPanel, layout.shiftPanel)).toBe(false);
    for (const panel of panels) {
      expect(overlaps(panel, layout.bins.LEFT)).toBe(false);
      expect(overlaps(panel, layout.bins.RIGHT)).toBe(false);
      expect(overlaps(panel, layout.rulePanel)).toBe(false);
    }
  });

  it('keeps the panels clear of the conveyor', () => {
    const halfBelt = layout.belt.width / 2 + HOUSING_MARGIN;
    expect(layout.comboPanel.x + layout.comboPanel.width / 2).toBeLessThanOrEqual(layout.belt.x - halfBelt);
    expect(layout.shiftPanel.x - layout.shiftPanel.width / 2).toBeGreaterThanOrEqual(layout.belt.x + halfBelt);
  });

  it('leaves the rule panel readable beside the score and mistakes blocks', () => {
    expect(layout.rulePanel.width).toBeGreaterThanOrEqual(600);
    expect(boxFits(layout.rulePanel, size.width, size.height)).toBe(true);
  });

  it('keeps the announcement clear of the rule panel, so the pause button stays reachable', () => {
    expect(overlaps(layout.announcement, layout.rulePanel)).toBe(false);
    expect(overlaps(layout.announcement, layout.pauseButton)).toBe(false);
  });
});
