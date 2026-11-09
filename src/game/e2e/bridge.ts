import type Phaser from 'phaser';
import type { BinSide, GameState } from '../../types/game';
import type { PlayerIntent } from '../config/controls';
import { SceneDirector } from '../scenes/SceneDirector';
import { SceneKeys, type SceneKey } from '../scenes/SceneKeys';
import { clausesForSide, destinationFor } from '../systems/RuleEvaluator';
import type { RunSession, SessionEvent } from '../systems/RunSession';
import { glyphForClause } from '../ui/ruleGlyphs';
import { createSeededRandom } from '../utils/random';

/**
 * Test-only window onto a running game, for the Playwright suite. It is loaded
 * only when VITE_E2E is set, and never exists in a production build.
 *
 * Phaser draws everything to one canvas, so tests read state through here but
 * still press real keys and click real on-screen positions wherever they can.
 */

interface ViewInternals {
  readonly conveyor: { readonly surface: Phaser.GameObjects.TileSprite };
  readonly announcement: { readonly isShowing: boolean; isArmed(now: number): boolean; readonly title: Phaser.GameObjects.Text };
  readonly countdown: { readonly value: number | null };
  readonly hud: {
    readonly ruleTitle: Phaser.GameObjects.Text;
    readonly ruleRows: readonly Phaser.GameObjects.Container[];
  };
}

interface GameSceneInternals extends Phaser.Scene {
  session: RunSession | undefined;
  view: ViewInternals | null;
  beltSpeedFactor: number;
  applyEvents(events: readonly SessionEvent[]): void;
  handleIntent(intent: PlayerIntent, source: 'keyboard' | 'pointer'): void;
}

interface ButtonInternals {
  readonly x: number;
  readonly y: number;
  readonly config: { readonly label: string; readonly icon?: string };
}

export interface BotOptions {
  /** Belt progress at which the bot decides. */
  readonly thinkAt?: number;
  /** Chance of choosing correctly. */
  readonly accuracy?: number;
  /** Stop once this shift is being announced. */
  readonly untilShift?: number;
  /** Extra simulation steps per frame, to compress long sessions. */
  readonly extraSteps?: number;
}

export interface LoggedEvent {
  readonly type: SessionEvent['type'];
  readonly value?: number;
  readonly chosen?: BinSide;
  readonly correct?: boolean;
  readonly displayed?: number | null;
}

class E2EBridge {
  private readonly game: Phaser.Game;
  private readonly director: SceneDirector;
  private log: LoggedEvent[] = [];
  private stopBot: (() => void) | null = null;
  private goldenSeen = 0;
  private frameTimes: number[] | null = null;
  private lastFrameAt = 0;

  constructor(game: Phaser.Game) {
    this.game = game;
    const menu = game.scene.getScene(SceneKeys.MENU);
    if (!menu) throw new Error('Menu scene missing');
    this.director = SceneDirector.from(menu);

    const params = new URLSearchParams(window.location.search);
    const seed = params.get('seed');
    const startShift = params.get('startShift');
    this.director.runOverrides = {
      ...(seed !== null ? { seed: Number(seed) } : {}),
      ...(startShift !== null ? { startShift: Number(startShift) } : {}),
    };

    const scene = this.scene;
    const original = scene.applyEvents.bind(scene);
    scene.applyEvents = (events) => {
      original(events);
      for (const event of events) this.record(event);
    };
  }

  private get scene(): GameSceneInternals {
    return this.game.scene.getScene(SceneKeys.GAME) as unknown as GameSceneInternals;
  }

  private record(event: SessionEvent): void {
    this.log.push({
      type: event.type,
      ...(event.type === 'COUNTDOWN_TICK' ? { value: event.value, displayed: this.scene.view?.countdown.value ?? null } : {}),
      ...(event.type === 'PARCEL_SORTED' ? { chosen: event.chosen, correct: event.correct } : {}),
    });
    if (event.type === 'PARCEL_SPAWNED' && event.parcel.kind === 'GOLDEN') this.goldenSeen += 1;
  }

  events(): readonly LoggedEvent[] {
    return this.log;
  }

  clearEvents(): void {
    this.log = [];
  }

  frame(): number {
    return this.game.loop.frame;
  }

  state(): Record<string, unknown> {
    const scene = this.scene;
    const session = scene.session;
    const view = scene.view;
    const machine: GameState = this.director.machine.state;
    const active = session?.activeParcel ?? null;
    const transition = session?.transition ?? null;
    const rule = session?.rule ?? null;
    const mapping = (side: BinSide): string[] => (rule ? clausesForSide(rule, side).map((c) => glyphForClause(c).longText) : []);

    return {
      machine,
      size: { width: this.game.scale.width, height: this.game.scale.height },
      phase: session?.phase ?? null,
      stage: transition?.stage ?? null,
      countdownValue: transition?.countdownValue ?? null,
      briefing: transition ? { label: transition.briefing.shiftLabel, mode: transition.briefing.modeName, change: transition.briefing.change, firstTime: transition.briefing.firstTime } : null,
      shift: session?.shiftStatus?.plan.number ?? null,
      mode: session?.shiftStatus?.plan.mode ?? null,
      correctInShift: session?.shiftStatus?.correct ?? 0,
      ruleId: rule?.id ?? null,
      left: mapping('LEFT'),
      right: mapping('RIGHT'),
      score: session?.score ?? 0,
      mistakes: session?.mistakes ?? 0,
      streak: session?.comboStatus?.streak ?? 0,
      resolved: session?.parcelsResolved ?? 0,
      active: active && {
        id: active.parcel.id,
        kind: active.parcel.kind,
        progress: active.progress,
        attributes: active.parcel.attributes,
        expected: destinationFor(active.rule, active.parcel.attributes),
      },
      goldenSeen: this.goldenSeen,
      announcementVisible: view?.announcement.isShowing ?? false,
      announcementTitle: view?.announcement.title.text ?? null,
      readyArmed: view ? view.announcement.isArmed(scene.time.now) : false,
      countdownShown: view?.countdown.value ?? null,
      beltOffset: view?.conveyor.surface.tilePositionY ?? null,
      beltSpeedFactor: scene.beltSpeedFactor,
      ruleTitle: view?.hud.ruleTitle.text ?? null,
      ruleRowsVisible: view ? view.hud.ruleRows.length === 2 && view.hud.ruleRows.every((row) => row.visible && row.alpha > 0.5) : false,
      muted: this.director.audio.muted,
      audio: this.director.audio.stats,
    };
  }

  /** Where a button is on the page, for real mouse and touch input. */
  buttonPoint(sceneKey: SceneKey, name: string): { x: number; y: number } | null {
    const scene = this.game.scene.getScene(sceneKey);
    if (!scene) return null;
    const buttons = scene.children.list.filter((child) => 'config' in child && 'hit' in child) as unknown as ButtonInternals[];
    const match = buttons.find((b) => b.config.label === name || (b.config.label === '' && (b.config.icon === name || (name === 'mute' && b.config.icon !== 'pause'))));
    if (!match) return null;
    const rect = this.game.canvas.getBoundingClientRect();
    return {
      x: rect.left + (match.x / this.game.scale.width) * rect.width,
      y: rect.top + (match.y / this.game.scale.height) * rect.height,
    };
  }

  /** Feed the session simulated time directly, far faster than real time. */
  simulateTime(totalMs: number, stepMs = 16): number {
    const session = this.scene.session;
    if (!session) return 0;
    let produced = 0;
    for (let t = 0; t < totalMs; t += stepMs) {
      const events = session.update(stepMs);
      produced += events.length;
      this.scene.applyEvents(events);
    }
    return produced;
  }

  startBot(options: BotOptions = {}): void {
    this.endBot();
    const scene = this.scene;
    const { thinkAt = 0.08, accuracy = 1, untilShift, extraSteps = 0 } = options;
    const decide = createSeededRandom(4242);

    const step = (time: number): void => {
      const session = scene.session;
      const view = scene.view;
      if (!session || !view) return;
      const { machine } = this.director;

      if (machine.is('SHIFT_ANNOUNCEMENT')) {
        if (untilShift !== undefined && (session.shiftStatus?.plan.number ?? 0) >= untilShift) {
          this.endBot();
          return;
        }
        if (view.announcement.isArmed(scene.time.now)) scene.handleIntent('READY', 'keyboard');
      }
      for (let i = 0; i < extraSteps && session === scene.session; i += 1) scene.update(time, 16);
      const active = session.activeParcel;
      if (machine.is('PLAYING') && active && active.progress >= thinkAt) {
        const right = destinationFor(active.rule, active.parcel.attributes);
        const side: BinSide = decide() < accuracy ? right : right === 'LEFT' ? 'RIGHT' : 'LEFT';
        scene.handleIntent(side, 'keyboard');
      }
    };
    scene.events.on('postupdate', step);
    this.stopBot = () => scene.events.off('postupdate', step);
  }

  endBot(): void {
    this.stopBot?.();
    this.stopBot = null;
  }

  /** Counts of everything that could leak over a long session. */
  metrics(): Record<string, unknown> {
    const scene = this.scene;
    const keyboard = scene.input?.keyboard;
    // A forced collection makes samples comparable; it needs Chrome's --expose-gc flag.
    (globalThis as unknown as { gc?: () => void }).gc?.();
    const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    const timeline = scene.time as unknown as { _active?: unknown[]; _pendingInsertion?: unknown[] };
    return {
      children: scene.children?.length ?? 0,
      tweens: scene.tweens?.getTweens().length ?? 0,
      timers: (timeline._active?.length ?? 0) + (timeline._pendingInsertion?.length ?? 0),
      textures: this.game.textures.getTextureKeys().length,
      ...this.orphanedTextures(),
      blurListeners: this.game.events.listenerCount('blur'),
      hiddenListeners: this.game.events.listenerCount('hidden'),
      resizeListeners: this.game.scale.listenerCount('resize'),
      keyListeners: keyboard ? keyboard.listenerCount('keydown-LEFT') + keyboard.listenerCount('keydown-ENTER') : 0,
      sceneEventListeners: scene.events.listenerCount('shutdown'),
      audioContexts: this.director.audio.stats.contextsCreated,
      audioActiveNodes: this.director.audio.stats.activeNodes,
      audioActiveInstances: this.director.audio.stats.activeInstances,
      heapBytes: memory?.usedJSHeapSize ?? null,
    };
  }

  /** Per-object textures (each Text owns one) that no live game object uses any more. */
  private orphanedTextures(): { orphanTextures: number; orphanSizes: string } {
    interface Node {
      readonly texture?: { readonly key: string };
      readonly list?: readonly Node[];
    }
    const live = new Set<string>();
    const walk = (node: Node): void => {
      if (node.texture) live.add(node.texture.key);
      node.list?.forEach(walk);
    };
    for (const scene of this.game.scene.scenes) walk(scene.children as unknown as Node);

    const orphans = this.game.textures.getTextureKeys().filter((key) => /^[0-9a-f]{8}-/.test(key) && !live.has(key));
    const sizes = orphans.slice(0, 16).map((key) => {
      const source = this.game.textures.get(key).source[0];
      return `${source?.width}x${source?.height}`;
    });
    return { orphanTextures: orphans.length, orphanSizes: sizes.join(' ') };
  }

  startFrameSampling(): void {
    this.frameTimes = [];
    this.lastFrameAt = performance.now();
    const sample = (now: number): void => {
      if (!this.frameTimes) return;
      this.frameTimes.push(now - this.lastFrameAt);
      this.lastFrameAt = now;
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }

  stopFrameSampling(): Record<string, number> {
    const times = [...(this.frameTimes ?? [])].sort((a, b) => a - b);
    this.frameTimes = null;
    const at = (q: number): number => times[Math.min(times.length - 1, Math.floor(times.length * q))] ?? 0;
    const total = times.reduce((sum, t) => sum + t, 0);
    return {
      frames: times.length,
      seconds: total / 1000,
      averageFps: times.length > 0 ? 1000 / (total / times.length) : 0,
      medianMs: at(0.5),
      p95Ms: at(0.95),
      p99Ms: at(0.99),
      worstMs: times.at(-1) ?? 0,
      over33Ms: times.filter((t) => t > 33.4).length,
    };
  }
}

declare global {
  interface Window {
    __SORT_SHIFT_E2E__?: E2EBridge;
  }
}

export type { E2EBridge };

export function installE2EBridge(game: Phaser.Game): void {
  const install = (): void => {
    window.__SORT_SHIFT_E2E__ = new E2EBridge(game);
  };
  if (game.isBooted) install();
  else game.events.once('ready', install);
}
