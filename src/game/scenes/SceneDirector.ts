import Phaser from 'phaser';
import type { GameOverData, GameState, RunStats } from '../../types/game';
import type { AudioManager } from '../systems/AudioManager';
import { GameStateMachine } from '../systems/GameStateMachine';
import type { HighScoreStore } from '../systems/HighScoreStore';
import { COLORS } from '../ui/theme';
import { SceneKeys, type SceneKey } from './SceneKeys';

const REGISTRY_KEY = 'sortshift.sceneDirector';
const FADE_MS = 220;

export interface RunOverrides {
  readonly seed?: number;
  readonly startShift?: number;
}

/**
 * The single owner of high-level game flow. Every state change goes through
 * the state machine first, so illegal or duplicate requests (double clicks,
 * pausing twice, restarting during a transition) are simply rejected.
 *
 * Scene layout:
 *   MENU               → Menu scene
 *   PLAYING            → Game scene running
 *   SHIFT_ANNOUNCEMENT → Game scene showing a rule card, waiting for the player
 *   COUNTDOWN          → Game scene counting down to the belt starting
 *   PAUSED             → Game scene paused (still rendered) + Pause overlay
 *   GAME_OVER          → Game scene paused (frozen board) + GameOver overlay
 */
export class SceneDirector {
  readonly machine = new GameStateMachine('MENU');
  readonly highScores: HighScoreStore;
  readonly audio: AudioManager;
  /** Fixed starting conditions for a run; only automated tests set these. */
  runOverrides: RunOverrides = {};
  /** The state a resume returns to. */
  private resumeState: GameState = 'PLAYING';

  constructor(highScores: HighScoreStore, audio: AudioManager) {
    this.highScores = highScores;
    this.audio = audio;
  }

  static install(game: Phaser.Game, director: SceneDirector): void {
    game.registry.set(REGISTRY_KEY, director);
  }

  static from(scene: Phaser.Scene): SceneDirector {
    const director: unknown = scene.registry.get(REGISTRY_KEY);
    if (director instanceof SceneDirector) return director;
    throw new Error('SceneDirector has not been installed on this game');
  }

  get state(): GameState {
    return this.machine.state;
  }

  /** MENU / PAUSED / GAME_OVER → PLAYING (new run). */
  startRun(from: Phaser.Scene): boolean {
    const fromMenu = this.machine.is('MENU');
    if (!this.machine.transition('PLAYING')) return false;
    this.audio.play('ui');
    const go = (): void => {
      this.stopOthers(from, [SceneKeys.PAUSE, SceneKeys.GAME_OVER]);
      // start() shuts down the calling scene and (re)starts the game scene,
      // fully resetting it even if it was paused.
      from.scene.start(SceneKeys.GAME);
    };
    if (fromMenu) fadeOutThen(from, go);
    else go();
    return true;
  }

  /** PLAYING / SHIFT_ANNOUNCEMENT / COUNTDOWN → PAUSED. Must be called from the Game scene. */
  pauseRun(game: Phaser.Scene): boolean {
    const previous = this.machine.state;
    if (!this.machine.transition('PAUSED')) return false;
    this.resumeState = previous;
    this.audio.play('ui');
    game.scene.pause();
    game.scene.launch(SceneKeys.PAUSE);
    game.scene.bringToTop(SceneKeys.PAUSE);
    return true;
  }

  /** PAUSED → whatever the run was doing when it was paused. */
  resumeRun(from: Phaser.Scene): boolean {
    if (!this.machine.is('PAUSED') || !this.machine.transition(this.resumeState)) return false;
    this.audio.play('ui');
    from.scene.stop(SceneKeys.PAUSE);
    from.scene.resume(SceneKeys.GAME);
    return true;
  }

  /** PLAYING → GAME_OVER. Records the high score and shows the results. */
  endRun(game: Phaser.Scene, stats: RunStats): GameOverData | null {
    if (!this.machine.transition('GAME_OVER')) return null;
    const result = this.highScores.submit(stats.score);
    const data: GameOverData = { ...stats, bestScore: result.bestScore, isNewBest: result.isNewBest };
    game.scene.pause();
    game.scene.launch(SceneKeys.GAME_OVER, data);
    game.scene.bringToTop(SceneKeys.GAME_OVER);
    return data;
  }

  /** PAUSED / GAME_OVER → MENU. */
  goToMenu(from: Phaser.Scene): boolean {
    if (!this.machine.transition('MENU')) return false;
    this.audio.play('ui');
    this.stopOthers(from, [SceneKeys.GAME, SceneKeys.PAUSE, SceneKeys.GAME_OVER]);
    from.scene.start(SceneKeys.MENU);
    return true;
  }

  private stopOthers(from: Phaser.Scene, keys: readonly SceneKey[]): void {
    for (const key of keys) {
      if (key === from.scene.key) continue;
      if (from.scene.isActive(key) || from.scene.isPaused(key) || from.scene.isSleeping(key)) {
        from.scene.stop(key);
      }
    }
  }
}

/** Fade the scene's camera to the background colour, then run `next`. */
export function fadeOutThen(scene: Phaser.Scene, next: () => void): void {
  const camera = scene.cameras.main;
  const r = (COLORS.bgDeep >> 16) & 0xff;
  const g = (COLORS.bgDeep >> 8) & 0xff;
  const b = COLORS.bgDeep & 0xff;
  camera.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, next);
  camera.fadeOut(FADE_MS, r, g, b);
}

export function fadeIn(scene: Phaser.Scene, duration = FADE_MS): void {
  const r = (COLORS.bgDeep >> 16) & 0xff;
  const g = (COLORS.bgDeep >> 8) & 0xff;
  const b = COLORS.bgDeep & 0xff;
  scene.cameras.main.fadeIn(duration, r, g, b);
}
