import { describe, expect, it } from 'vitest';
import { chooseDesignSize, LANDSCAPE_SIZE, PORTRAIT_SIZE } from '../src/game/config/display';
import { beltProgressToY, boxFits, computeLayout, HATCH_HEIGHT_ABOVE_BELT, MIN_SORT_BUTTON_HEIGHT } from '../src/game/ui/layout';
import { intentForKey } from '../src/game/config/controls';

describe('display / layout', () => {
  it('chooses portrait for tall viewports and landscape otherwise', () => {
    expect(chooseDesignSize(390, 844)).toBe(PORTRAIT_SIZE);
    expect(chooseDesignSize(1920, 1080)).toBe(LANDSCAPE_SIZE);
    expect(chooseDesignSize(1000, 1020)).toBe(LANDSCAPE_SIZE);
    expect(chooseDesignSize(0, 0)).toBe(LANDSCAPE_SIZE);
  });

  for (const size of [LANDSCAPE_SIZE, PORTRAIT_SIZE]) {
    describe(`${size.width}×${size.height}`, () => {
      const layout = computeLayout(size.width, size.height);

      it('keeps every interactive element on screen', () => {
        for (const box of [layout.pauseButton, layout.rulePanel, layout.bins.LEFT, layout.bins.RIGHT, layout.buttons.LEFT, layout.buttons.RIGHT]) {
          expect(boxFits(box, size.width, size.height)).toBe(true);
        }
      });

      it('keeps the sort buttons large enough for touch', () => {
        for (const side of ['LEFT', 'RIGHT'] as const) {
          expect(layout.buttons[side].height).toBeGreaterThanOrEqual(MIN_SORT_BUTTON_HEIGHT);
          expect(layout.buttons[side].width).toBeGreaterThanOrEqual(layout.buttons[side].height);
        }
      });

      it('places LEFT on the left and RIGHT on the right of the belt', () => {
        const beltLeft = layout.belt.x - layout.belt.width / 2;
        const beltRight = layout.belt.x + layout.belt.width / 2;
        expect(layout.bins.LEFT.x + layout.bins.LEFT.width / 2).toBeLessThan(beltLeft);
        expect(layout.bins.RIGHT.x - layout.bins.RIGHT.width / 2).toBeGreaterThan(beltRight);
        expect(layout.buttons.LEFT.x).toBeLessThan(layout.buttons.RIGHT.x);
      });

      it('keeps the rule panel clear of the inbound hatch', () => {
        const panelBottom = layout.rulePanel.y + layout.rulePanel.height / 2;
        expect(panelBottom).toBeLessThan(layout.belt.topY - HATCH_HEIGHT_ABOVE_BELT);
      });

      it('orders belt landmarks top to bottom', () => {
        const b = layout.belt;
        expect(b.topY).toBeLessThan(b.spawnY);
        expect(b.spawnY).toBeLessThan(b.zoneTopY);
        expect(b.zoneTopY).toBeLessThan(b.decisionY);
        // A parcel at the decision line must still be on the belt surface.
        expect(b.decisionY + b.parcelSize / 2).toBeLessThan(b.endY);
        expect(b.endY).toBeLessThan(b.rejectY);
        expect(beltProgressToY(b, 0)).toBe(b.spawnY);
        expect(beltProgressToY(b, 1)).toBe(b.decisionY);
      });
    });
  }
});

describe('controls', () => {
  it('maps LEFT/A, RIGHT/D and ESC/P to intents', () => {
    expect(intentForKey('LEFT')).toBe('LEFT');
    expect(intentForKey('a')).toBe('LEFT');
    expect(intentForKey('RIGHT')).toBe('RIGHT');
    expect(intentForKey('D')).toBe('RIGHT');
    expect(intentForKey('ESC')).toBe('PAUSE');
    expect(intentForKey('P')).toBe('PAUSE');
    expect(intentForKey('Q')).toBeNull();
  });
});
