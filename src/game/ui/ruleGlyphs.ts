import type Phaser from 'phaser';
import type { BinSide, ParcelShape } from '../../types/game';
import { PARCEL_COLORS, PARCEL_SHAPES } from '../data/parcelCatalog';
import type { RuleClause, SortingRule } from '../data/sortingRules';
import { clausesForSide } from '../systems/RuleEvaluator';
import { COLORS, CSS } from './theme';

/** How one rule clause is presented: an icon plus a text label, never colour alone. */
export interface RuleGlyph {
  /** Compact label; the icon carries the shape. */
  readonly text: string;
  /** Full label for the large rule card. */
  readonly longText: string;
  readonly css: string;
  /** Icon fill, or null when the clause does not depend on colour. */
  readonly fill: number | null;
  /** Icon outline, or null when the clause does not depend on shape. */
  readonly shape: ParcelShape | null;
}

export function glyphForClause(clause: RuleClause): RuleGlyph {
  const { color, shape } = clause.when;
  const colorDef = color ? PARCEL_COLORS[color] : null;
  const shapeLabel = shape ? PARCEL_SHAPES[shape].label : null;
  const parts = [colorDef?.label, shapeLabel].filter((part): part is string => part !== undefined && part !== null);
  return {
    text: parts[0] ?? 'ANY',
    longText: parts.join(' ') || 'ANY',
    css: colorDef?.css ?? CSS.white,
    fill: colorDef?.fill ?? null,
    shape: shape ?? null,
  };
}

/** Glyphs for everything the rule routes into `side`. */
export function glyphsForSide(rule: SortingRule, side: BinSide): RuleGlyph[] {
  return clausesForSide(rule, side).map(glyphForClause);
}

/**
 * Draw a glyph icon centred on (x, y). Shape rules use a circle or square,
 * colour-only rules a flat pill, so a swatch can't be mistaken for a shape.
 */
export function drawGlyphIcon(g: Phaser.GameObjects.Graphics, x: number, y: number, size: number, glyph: RuleGlyph): void {
  const fill = glyph.fill ?? COLORS.white;
  const half = size / 2;
  g.fillStyle(fill, 1);
  g.lineStyle(2, COLORS.white, 0.6);
  if (glyph.shape === 'CIRCLE') {
    g.fillCircle(x, y, half);
    g.strokeCircle(x, y, half);
  } else if (glyph.shape === 'SQUARE') {
    g.fillRoundedRect(x - half, y - half, size, size, 3);
    g.strokeRoundedRect(x - half, y - half, size, size, 3);
  } else {
    const height = size * 0.56;
    g.fillRoundedRect(x - half, y - height / 2, size, height, height / 2);
    g.strokeRoundedRect(x - half, y - height / 2, size, height, height / 2);
  }
}
