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

  it('keeps pause and mute reachable beside the announcement card', () => {
    expect(overlaps(layout.announcement, layout.pauseButton)).toBe(false);
    expect(overlaps(layout.announcement, layout.muteButton)).toBe(false);
    expect(overlaps(layout.pauseButton, layout.muteButton)).toBe(false);
  });

  it('keeps the score, mistakes, rule panel and top controls apart', () => {
    const top = [layout.scorePanel, layout.mistakesPanel, layout.rulePanel, layout.pauseButton, layout.muteButton];
    for (const box of top) expect(boxFits(box, size.width, size.height)).toBe(true);
    top.forEach((a, i) => top.slice(i + 1).forEach((b) => expect(overlaps(a, b)).toBe(false)));
  });

  it('keeps the countdown inside the play area, clear of the rule panel', () => {
    const { x, y } = layout.countdown;
    expect(overlaps({ x, y, width: 280, height: 280 }, layout.rulePanel)).toBe(false);
    expect(boxFits({ x, y, width: 280, height: 280 }, size.width, size.height)).toBe(true);
  });
});
