import { AUDIO_DEFAULTS, SFX, type SfxDefinition, type SfxId, type SfxNote } from '../config/soundDesign';
import type { KeyValueStorage } from '../utils/storage';

export const AUDIO_MUTED_STORAGE_KEY = 'sortshift.neonParcelDepot.muted.v1';

/** The parts of the Web Audio API the manager uses, so it can be tested without a browser. */
export interface AudioParamLike {
  value: number;
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
  exponentialRampToValueAtTime(value: number, time: number): unknown;
}

export interface AudioNodeLike {
  connect(destination: never): unknown;
  disconnect(): void;
}

export interface GainNodeLike extends AudioNodeLike {
  readonly gain: AudioParamLike;
}

export interface OscillatorLike extends AudioNodeLike {
  type: string;
  readonly frequency: AudioParamLike;
  onended: (() => void) | null;
  start(time: number): void;
  stop(time: number): void;
}

export interface AudioContextLike {
  readonly state: string;
  readonly currentTime: number;
  readonly destination: unknown;
  resume(): Promise<void>;
  close(): Promise<void>;
  createGain(): GainNodeLike;
  createOscillator(): OscillatorLike;
}

export interface AudioManagerOptions {
  /** Called on the first user gesture only. May return null if audio is unsupported. */
  readonly createContext: () => AudioContextLike | null;
  readonly storage: KeyValueStorage;
  readonly sounds?: Readonly<Record<SfxId, SfxDefinition>>;
}

/** Counters that show what the manager is doing, without needing to hear it. */
export interface AudioStats {
  readonly contextState: string;
  readonly contextsCreated: number;
  readonly activeInstances: number;
  readonly activeNodes: number;
  readonly played: Readonly<Partial<Record<SfxId, number>>>;
  readonly droppedMuted: number;
  readonly droppedNotReady: number;
  readonly droppedLimit: number;
}

type Connectable = never;

/**
 * Plays the game's synthesised sound effects. One instance exists per game,
 * owned by the SceneDirector, so scene changes can't create duplicates.
 *
 * The AudioContext is only created inside `unlock()`, which is called from a
 * real user gesture, satisfying browser autoplay rules. A request that arrives
 * while audio isn't running is dropped rather than queued, so late effects
 * never burst out once audio resumes.
 */
export class AudioManager {
  private readonly createContext: () => AudioContextLike | null;
  private readonly storage: KeyValueStorage;
  private readonly sounds: Readonly<Record<SfxId, SfxDefinition>>;
  private context: AudioContextLike | null = null;
  private master: GainNodeLike | null = null;
  private isMuted: boolean;
  private destroyed = false;
  private contextsCreated = 0;
  private activeNodes = 0;
  private activeTotal = 0;
  private droppedMuted = 0;
  private droppedNotReady = 0;
  private droppedLimit = 0;
  private readonly activeBySound = new Map<SfxId, number>();
  private readonly lastPlayedMs = new Map<SfxId, number>();
  private readonly played: Partial<Record<SfxId, number>> = {};

  constructor(options: AudioManagerOptions) {
    this.createContext = options.createContext;
    this.storage = options.storage;
    this.sounds = options.sounds ?? SFX;
    this.isMuted = this.readMuted();
  }

  get muted(): boolean {
    return this.isMuted;
  }

  get stats(): AudioStats {
    return {
      contextState: this.context?.state ?? 'none',
      contextsCreated: this.contextsCreated,
      activeInstances: this.activeTotal,
      activeNodes: this.activeNodes,
      played: { ...this.played },
      droppedMuted: this.droppedMuted,
      droppedNotReady: this.droppedNotReady,
      droppedLimit: this.droppedLimit,
    };
  }

  /** Call from a user gesture. Creates the context once, and resumes it if suspended. */
  unlock(): void {
    if (this.destroyed) return;
    if (!this.context) this.startContext();
    if (this.context?.state === 'suspended') this.resumeContext();
  }

  setMuted(muted: boolean): void {
    if (muted === this.isMuted) return;
    this.isMuted = muted;
    this.applyMasterVolume();
    try {
      this.storage.setItem(AUDIO_MUTED_STORAGE_KEY, muted ? '1' : '0');
    } catch {
      // Storage blocked: the preference simply lasts for this session.
    }
  }

  toggleMuted(): boolean {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  /** Play an effect if allowed. Returns true when it actually started. */
  play(id: SfxId): boolean {
    if (this.destroyed) return false;
    if (this.isMuted) {
      this.droppedMuted += 1;
      return false;
    }

    const { context, master } = this;
    if (!context || !master || context.state !== 'running') {
      if (context?.state === 'suspended') this.resumeContext();
      this.droppedNotReady += 1;
      return false;
    }

    const sound = this.sounds[id];
    const nowMs = context.currentTime * 1000;
    const last = this.lastPlayedMs.get(id);
    const instances = this.activeBySound.get(id) ?? 0;
    if (
      (last !== undefined && nowMs - last < sound.minIntervalMs) ||
      instances >= sound.maxInstances ||
      this.activeTotal >= AUDIO_DEFAULTS.maxTotalInstances
    ) {
      this.droppedLimit += 1;
      return false;
    }

    this.lastPlayedMs.set(id, nowMs);
    this.played[id] = (this.played[id] ?? 0) + 1;
    this.activeBySound.set(id, instances + 1);
    this.activeTotal += 1;

    let remaining = sound.notes.length;
    const onNoteEnded = (): void => {
      remaining -= 1;
      if (remaining > 0) return;
      this.activeTotal -= 1;
      this.activeBySound.set(id, (this.activeBySound.get(id) ?? 1) - 1);
    };
    for (const note of sound.notes) this.scheduleNote(context, master, note, onNoteEnded);
    return true;
  }

  /** Release the audio hardware. The manager does nothing afterwards. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    const context = this.context;
    this.context = null;
    this.master = null;
    context?.close().catch(() => undefined);
  }

  private readMuted(): boolean {
    try {
      return this.storage.getItem(AUDIO_MUTED_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }

  private startContext(): void {
    let context: AudioContextLike | null = null;
    try {
      context = this.createContext();
    } catch {
      context = null;
    }
    if (!context) return;

    this.context = context;
    this.contextsCreated += 1;
    this.master = context.createGain();
    this.master.connect(context.destination as Connectable);
    this.applyMasterVolume();
  }

  private resumeContext(): void {
    this.context?.resume().catch(() => undefined);
  }

  private applyMasterVolume(): void {
    if (this.master) this.master.gain.value = this.isMuted ? 0 : AUDIO_DEFAULTS.masterVolume;
  }

  private scheduleNote(context: AudioContextLike, master: GainNodeLike, note: SfxNote, onEnded: () => void): void {
    const start = context.currentTime + note.at;
    const end = start + note.duration;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    this.activeNodes += 2;

    oscillator.type = note.wave;
    oscillator.frequency.setValueAtTime(note.freq, start);
    if (note.slideTo !== undefined) oscillator.frequency.exponentialRampToValueAtTime(note.slideTo, end);

    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(note.gain, start + 0.006);
    envelope.gain.setValueAtTime(note.gain, Math.max(start + 0.006, end - AUDIO_DEFAULTS.releaseSeconds));
    envelope.gain.linearRampToValueAtTime(0, end);

    oscillator.connect(envelope as Connectable);
    envelope.connect(master as Connectable);
    oscillator.onended = (): void => {
      oscillator.onended = null;
      oscillator.disconnect();
      envelope.disconnect();
      this.activeNodes -= 2;
      onEnded();
    };
    oscillator.start(start);
    oscillator.stop(end);
  }
}

/**
 * Wake audio on real user gestures. Kept installed for the game's lifetime
 * because browsers can suspend a context again, for example on a phone call.
 */
export function installAudioUnlock(audio: AudioManager, target: Pick<Window, 'addEventListener' | 'removeEventListener'>): () => void {
  const unlock = (): void => audio.unlock();
  const events = ['pointerdown', 'touchend', 'keydown'] as const;
  for (const name of events) target.addEventListener(name, unlock, { capture: true });
  return () => {
    for (const name of events) target.removeEventListener(name, unlock, { capture: true });
  };
}
