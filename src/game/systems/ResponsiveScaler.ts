import Phaser from 'phaser';
import { chooseDesignSize } from '../config/display';

/**
 * Keeps the game in the design orientation that best fits the window.
 * FIT mode handles uniform scaling + letterboxing; this switches between the
 * landscape and portrait design sizes when the window's shape changes
 * (e.g. rotating a phone). Scenes re-layout via `watchLayout`.
 */
export function installResponsiveScaling(game: Phaser.Game): () => void {
  const scale = game.scale;
  let applying = false;

  const apply = (): void => {
    if (applying) return;
    const parentW = scale.parentSize.width || window.innerWidth;
    const parentH = scale.parentSize.height || window.innerHeight;
    const target = chooseDesignSize(parentW, parentH);
    if (scale.width === target.width && scale.height === target.height) return;
    applying = true;
    try {
      scale.setGameSize(target.width, target.height);
    } finally {
      applying = false;
    }
  };

  scale.on(Phaser.Scale.Events.RESIZE, apply);
  return () => scale.off(Phaser.Scale.Events.RESIZE, apply);
}

/**
 * Calls `onChange(width, height)` whenever the game's design size changes
 * while the scene is running. The listener is removed on scene shutdown, so
 * restarts never stack duplicate listeners.
 */
export function watchLayout(scene: Phaser.Scene, onChange: (width: number, height: number) => void): void {
  let width = scene.scale.width;
  let height = scene.scale.height;
  const handler = (): void => {
    if (scene.scale.width === width && scene.scale.height === height) return;
    width = scene.scale.width;
    height = scene.scale.height;
    onChange(width, height);
  };
  scene.scale.on(Phaser.Scale.Events.RESIZE, handler);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.scale.off(Phaser.Scale.Events.RESIZE, handler));
}
