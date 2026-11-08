import Phaser from 'phaser';
import { chooseDesignSize, PAGE_BACKGROUND } from './config/display';
import { BootScene } from './scenes/BootScene';
import { GameOverScene } from './scenes/GameOverScene';
import { GameScene } from './scenes/GameScene';
import { MenuScene } from './scenes/MenuScene';
import { PauseScene } from './scenes/PauseScene';
import { SceneDirector } from './scenes/SceneDirector';
import { HighScoreStore } from './systems/HighScoreStore';
import { installResponsiveScaling } from './systems/ResponsiveScaler';
import { getBrowserStorage } from './utils/storage';

export interface GameHandle {
  readonly game: Phaser.Game;
  destroy(): void;
}

/** Create and boot the Phaser game inside the given parent element. */
export function createGame(parent: HTMLElement): GameHandle {
  const initial = chooseDesignSize(parent.clientWidth || window.innerWidth, parent.clientHeight || window.innerHeight);

  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent,
    title: 'SORT SHIFT — Neon Parcel Depot',
    backgroundColor: PAGE_BACKGROUND,
    banner: import.meta.env.DEV,
    disableContextMenu: true,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: initial.width,
      height: initial.height,
    },
    input: {
      // Mouse + up to two simultaneous touches (thumbs on both buttons).
      activePointers: 3,
    },
    // No sound assets in this milestone; avoids creating an AudioContext
    // (and the browser autoplay warning that comes with it).
    audio: { noAudio: true },
    render: {
      antialias: true,
      powerPreference: 'high-performance',
    },
    // Order matters: later scenes render on top (overlays above the game).
    scene: [BootScene, MenuScene, GameScene, PauseScene, GameOverScene],
  };

  const game = new Phaser.Game(config);
  SceneDirector.install(game, new SceneDirector(new HighScoreStore(getBrowserStorage())));
  const uninstallScaling = installResponsiveScaling(game);

  return {
    game,
    destroy: () => {
      uninstallScaling();
      game.destroy(true);
    },
  };
}
