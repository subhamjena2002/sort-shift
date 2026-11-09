import { describe, expect, it, vi } from 'vitest';
import { AUDIO_DEFAULTS, SFX, type SfxDefinition, type SfxId } from '../src/game/config/soundDesign';
import {
  AUDIO_MUTED_STORAGE_KEY,
  AudioManager,
  installAudioUnlock,
  type AudioContextLike,
  type AudioParamLike,
  type GainNodeLike,
  type OscillatorLike,
} from '../src/game/systems/AudioManager';
import type { SessionEvent } from '../src/game/systems/RunSession';
import { soundsForEvents } from '../src/game/systems/sessionSounds';
import { MemoryStorage } from '../src/game/utils/storage';
import type { Parcel } from '../src/types/game';

function fakeParam(): AudioParamLike {
  return { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
}

class FakeContext implements AudioContextLike {
  state = 'running';
  currentTime = 10;
  readonly destination = {};
  readonly oscillators: OscillatorLike[] = [];
  readonly gains: GainNodeLike[] = [];
  resumeCalls = 0;
  closed = false;

  resume(): Promise<void> {
    this.resumeCalls += 1;
    this.state = 'running';
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.closed = true;
    this.state = 'closed';
    return Promise.resolve();
  }

  createGain(): GainNodeLike {
    const gain: GainNodeLike = { gain: fakeParam(), connect: vi.fn(), disconnect: vi.fn() };
    this.gains.push(gain);
    return gain;
  }

  createOscillator(): OscillatorLike {
    const oscillator: OscillatorLike = {
      type: 'sine',
      frequency: fakeParam(),
      onended: null,
      start: vi.fn(),
      stop: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    this.oscillators.push(oscillator);
    return oscillator;
  }

  finishAll(): void {
    for (const oscillator of this.oscillators) oscillator.onended?.();
  }
}

function setup(options: { muted?: boolean; state?: string } = {}) {
  const context = new FakeContext();
  if (options.state) context.state = options.state;
  const storage = new MemoryStorage();
  if (options.muted) storage.setItem(AUDIO_MUTED_STORAGE_KEY, '1');
  const createContext = vi.fn(() => context);
  const audio = new AudioManager({ createContext, storage });
  return { audio, context, storage, createContext };
}

const ALL_SOUNDS = Object.keys(SFX) as SfxId[];

describe('AudioManager — autoplay rules', () => {
  it('creates no context until a user gesture', () => {
    const { audio, createContext } = setup();
    expect(audio.play('correct')).toBe(false);
    expect(createContext).not.toHaveBeenCalled();
    expect(audio.stats).toMatchObject({ contextState: 'none', contextsCreated: 0, droppedNotReady: 1 });
  });

  it('creates exactly one context across repeated gestures', () => {
    const { audio, createContext } = setup();
    for (let i = 0; i < 10; i += 1) audio.unlock();
    expect(createContext).toHaveBeenCalledTimes(1);
  });

  it('resumes a suspended context on a gesture', () => {
    const { audio, context } = setup({ state: 'suspended' });
    audio.unlock();
    expect(context.resumeCalls).toBe(1);
    expect(context.state).toBe('running');
  });

  it('drops a sound while suspended instead of queueing it, and tries to resume', () => {
    const { audio, context } = setup();
    audio.unlock();
    context.state = 'suspended';
    expect(audio.play('correct')).toBe(false);
    expect(context.resumeCalls).toBe(1);
    expect(context.oscillators).toHaveLength(0);
  });

  it('survives browsers without Web Audio', () => {
    const audio = new AudioManager({ createContext: () => null, storage: new MemoryStorage() });
    audio.unlock();
    expect(audio.play('correct')).toBe(false);
  });

  it('survives a context constructor that throws', () => {
    const audio = new AudioManager({
      createContext: () => {
        throw new Error('blocked');
      },
      storage: new MemoryStorage(),
    });
    expect(() => audio.unlock()).not.toThrow();
  });

  it('installs and fully removes its gesture listeners', () => {
    const { audio, createContext } = setup();
    const target = new EventTarget();
    const uninstall = installAudioUnlock(audio, target as unknown as Window);
    target.dispatchEvent(new Event('pointerdown'));
    expect(createContext).toHaveBeenCalledTimes(1);
    const add = vi.spyOn(target, 'removeEventListener');
    uninstall();
    expect(add).toHaveBeenCalledTimes(3);
  });
});

describe('AudioManager — playing', () => {
  it.each(ALL_SOUNDS)('%s schedules its notes and cleans them up', (id) => {
    const { audio, context } = setup();
    audio.unlock();
    expect(audio.play(id)).toBe(true);
    expect(context.oscillators).toHaveLength(SFX[id].notes.length);
    expect(audio.stats.activeInstances).toBe(1);
    expect(audio.stats.activeNodes).toBe(SFX[id].notes.length * 2);
    context.finishAll();
    expect(audio.stats).toMatchObject({ activeInstances: 0, activeNodes: 0 });
    for (const oscillator of context.oscillators) expect(oscillator.disconnect).toHaveBeenCalled();
  });

  it('gives every effect a distinct first note or waveform', () => {
    const signatures = ALL_SOUNDS.map((id) => {
      const first = SFX[id].notes[0];
      return `${first?.wave}:${first?.freq}`;
    });
    expect(new Set(signatures).size).toBe(ALL_SOUNDS.length);
  });

  it('keeps every note at a reasonable level and length', () => {
    for (const id of ALL_SOUNDS) {
      for (const note of SFX[id].notes) {
        expect(note.gain).toBeLessThanOrEqual(0.4);
        expect(note.at + note.duration).toBeLessThanOrEqual(1.3);
      }
    }
  });

  it('counts plays by effect', () => {
    const { audio, context } = setup();
    audio.unlock();
    audio.play('tick');
    context.currentTime += 1;
    context.finishAll();
    audio.play('tick');
    expect(audio.stats.played.tick).toBe(2);
  });
});

describe('AudioManager — overlap limits', () => {
  it('drops a repeat inside the minimum interval', () => {
    const { audio, context } = setup();
    audio.unlock();
    expect(audio.play('correct')).toBe(true);
    context.currentTime += 0.01;
    expect(audio.play('correct')).toBe(false);
    expect(audio.stats.droppedLimit).toBe(1);
  });

  it('limits concurrent instances of one effect', () => {
    const { audio, context } = setup();
    audio.unlock();
    expect(audio.play('wrong')).toBe(true);
    context.currentTime += 5;
    expect(audio.play('wrong')).toBe(false); // first still sounding
    context.finishAll();
    context.currentTime += 5;
    expect(audio.play('wrong')).toBe(true);
  });

  it('caps effects sounding at once across all kinds', () => {
    const sounds = Object.fromEntries(ALL_SOUNDS.map((id): [SfxId, SfxDefinition] => [id, { notes: [{ wave: 'sine', freq: 440, at: 0, duration: 1, gain: 0.1 }], minIntervalMs: 0, maxInstances: 100 }])) as Record<SfxId, SfxDefinition>;
    const context = new FakeContext();
    const audio = new AudioManager({ createContext: () => context, storage: new MemoryStorage(), sounds });
    audio.unlock();
    for (let i = 0; i < 50; i += 1) audio.play('correct');
    expect(audio.stats.activeInstances).toBe(AUDIO_DEFAULTS.maxTotalInstances);
  });
});

describe('AudioManager — mute and persistence', () => {
  it('starts unmuted by default', () => {
    expect(setup().audio.muted).toBe(false);
  });

  it('plays nothing while muted', () => {
    const { audio, context } = setup({ muted: true });
    audio.unlock();
    expect(audio.play('correct')).toBe(false);
    expect(context.oscillators).toHaveLength(0);
    expect(audio.stats.droppedMuted).toBe(1);
  });

  it('silences the master volume at once and restores it', () => {
    const { audio, context } = setup();
    audio.unlock();
    const master = context.gains[0];
    expect(master?.gain.value).toBe(AUDIO_DEFAULTS.masterVolume);
    audio.setMuted(true);
    expect(master?.gain.value).toBe(0);
    audio.setMuted(false);
    expect(master?.gain.value).toBe(AUDIO_DEFAULTS.masterVolume);
  });

  it('applies a stored mute to a context created later', () => {
    const { audio, context } = setup({ muted: true });
    audio.unlock();
    expect(context.gains[0]?.gain.value).toBe(0);
  });

  it('persists the preference across instances', () => {
    const storage = new MemoryStorage();
    const first = new AudioManager({ createContext: () => null, storage });
    first.toggleMuted();
    expect(new AudioManager({ createContext: () => null, storage }).muted).toBe(true);
    first.toggleMuted();
    expect(new AudioManager({ createContext: () => null, storage }).muted).toBe(false);
  });

  it('keeps working when storage throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const audio = new AudioManager({ createContext: () => null, storage: broken });
    expect(audio.muted).toBe(false);
    expect(() => audio.setMuted(true)).not.toThrow();
    expect(audio.muted).toBe(true);
  });
});

describe('AudioManager — cleanup', () => {
  it('closes the context and goes quiet after destroy', () => {
    const { audio, context, createContext } = setup();
    audio.unlock();
    audio.destroy();
    expect(context.closed).toBe(true);
    expect(audio.play('correct')).toBe(false);
    audio.unlock();
    expect(createContext).toHaveBeenCalledTimes(1);
  });

  it('can be destroyed twice safely', () => {
    const { audio } = setup();
    audio.unlock();
    audio.destroy();
    expect(() => audio.destroy()).not.toThrow();
  });
});

describe('sounds for game moments', () => {
  const parcel: Parcel = { id: 1, attributes: { color: 'BLUE', shape: 'SQUARE' }, kind: 'STANDARD' };
  const sorted = (correct: boolean): SessionEvent => ({ type: 'PARCEL_SORTED', parcel, chosen: 'LEFT', expected: 'LEFT', correct, pointsAwarded: 0, progress: 0 });
  const combo = (multiplierIncreased: boolean, streakBonus = 0): SessionEvent => ({
    type: 'COMBO_CHANGED',
    combo: { streak: 5, multiplier: 2, multiplierIncreased, broken: false, previousStreak: 4, streakBonus },
  });
  const bonus = (kind: 'GOLDEN' | 'PERFECT_SHIFT'): SessionEvent => ({ type: 'BONUS_AWARDED', kind, points: 50 });
  const ended: SessionEvent = { type: 'RUN_ENDED', stats: { score: 0, correctCount: 0, mistakeCount: 3, parcelsResolved: 3 } };

  it('maps basic outcomes', () => {
    expect(soundsForEvents([sorted(true), combo(false)])).toEqual(['correct']);
    expect(soundsForEvents([sorted(false)])).toEqual(['wrong']);
    expect(soundsForEvents([{ type: 'PARCEL_MISSED', parcel, expected: 'LEFT' }])).toEqual(['wrong']);
  });

  it('plays the combo sound on tier rises and streak milestones', () => {
    expect(soundsForEvents([sorted(true), combo(true, 10)])).toEqual(['combo']);
    expect(soundsForEvents([sorted(true), combo(false, 10)])).toEqual(['combo']);
  });

  it('lets a golden parcel outrank a combo', () => {
    expect(soundsForEvents([sorted(true), combo(true, 10), bonus('GOLDEN')])).toEqual(['golden']);
  });

  it('lets a perfect shift outrank everything else in the moment', () => {
    expect(soundsForEvents([sorted(true), combo(true, 10), bonus('GOLDEN'), bonus('PERFECT_SHIFT')])).toEqual(['perfect']);
  });

  it('plays game over instead of the final wrong sound', () => {
    expect(soundsForEvents([sorted(false), ended])).toEqual(['gameOver']);
  });

  it('maps the transition sequence', () => {
    expect(soundsForEvents([{ type: 'COUNTDOWN_TICK', value: 3 }])).toEqual(['tick']);
  });

  it('stays silent for bookkeeping events', () => {
    expect(soundsForEvents([{ type: 'SCORE_CHANGED', score: 1, correctCount: 1 }])).toEqual([]);
  });
});
