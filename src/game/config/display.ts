/**
 * Design resolutions. The game renders at one of these fixed logical sizes and
 * Phaser's FIT scale mode letterboxes it into the browser window, so nothing
 * is ever stretched. Portrait is chosen on tall (phone) screens so the touch
 * buttons stay large.
 */
export interface DesignSize {
  readonly width: number;
  readonly height: number;
}

export const LANDSCAPE_SIZE: DesignSize = { width: 1280, height: 720 };
export const PORTRAIT_SIZE: DesignSize = { width: 720, height: 1280 };

/** Pick the design size that best matches the available viewport. */
export function chooseDesignSize(viewWidth: number, viewHeight: number): DesignSize {
  if (!(viewWidth > 0) || !(viewHeight > 0)) return LANDSCAPE_SIZE;
  // Small bias towards landscape so near-square desktop windows stay landscape.
  return viewHeight > viewWidth * 1.05 ? PORTRAIT_SIZE : LANDSCAPE_SIZE;
}

/** Background colour used outside and behind the game canvas. */
export const PAGE_BACKGROUND = '#050b1a';

/** Longest frame step fed to game logic, so a hitch can't skip a decision. */
export const MAX_FRAME_DELTA_MS = 100;
