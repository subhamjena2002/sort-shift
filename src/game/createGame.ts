import Phaser from 'phaser';
import { chooseDesignSize, PAGE_BACKGROUND } from './config/display';
import { BootScene } from './scenes/BootScene';
import { GameOverScene } from './scenes/GameOverScene';
import { GameScene } from './scenes/GameScene';
import { MenuScene } from './scenes/MenuScene';
import { PauseScene } from './scenes/PauseScene';
import { SceneDirector } from './scenes/SceneDirector';
import { AudioManager, installAudioUnlock, type AudioContextLike } from './systems/AudioManager';
import { HighScoreStore } from './systems/HighScoreStore';
import { installResponsiveScaling } from './systems/ResponsiveScaler';
import { getBrowserStorage } from './utils/storage';

export interface GameHandle {
  readonly game: Phaser.Game;
  destroy(): void;
}

function createBrowserAudioContext(): AudioContextLike | null {
  return typeof AudioContext === 'undefined' ? null : (new AudioContext() as unknown as AudioContextLike);
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
    // Sound is synthesised by AudioManager after a user gesture, so Phaser's
    // own audio system (and its autoplay warning) is not needed.
    audio: { noAudio: true },
    render: {
      antialias: true,
      powerPreference: 'high-performance',
      // With all 32 texture slots in use, a text quad could lose one triangle
      // (seen under software WebGL). 16 is a common hardware limit anyway.
      maxTextures: 16,
    },
    // Order matters: later scenes render on top (overlays above the game).
    scene: [BootScene, MenuScene, GameScene, PauseScene, GameOverScene],
  };

  const game = new Phaser.Game(config);
  const storage = getBrowserStorage();
  const audio = new AudioManager({ storage, createContext: createBrowserAudioContext });
  SceneDirector.install(game, new SceneDirector(new HighScoreStore(storage), audio));
  const uninstallScaling = installResponsiveScaling(game);
  const uninstallAudioUnlock = installAudioUnlock(audio, window);

  return {
    game,
    destroy: () => {
      uninstallScaling();
      uninstallAudioUnlock();
      audio.destroy();
      game.destroy(true);
    },
  };
}
