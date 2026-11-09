/**
 * Original sound effects, described as short note lists and synthesised at
 * runtime with the Web Audio API. There are no audio files and no licences to
 * track. Sound only ever reinforces what the screen already shows.
 */
export type SfxId =
  | 'correct'
  | 'wrong'
  | 'combo'
  | 'perfect'
  | 'golden'
  | 'shiftChange'
  | 'ready'
  | 'tick'
  | 'go'
  | 'gameOver'
  | 'ui';

export type SfxWave = 'sine' | 'square' | 'sawtooth' | 'triangle';

export interface SfxNote {
  readonly wave: SfxWave;
  /** Start frequency in Hz. */
  readonly freq: number;
  /** Optional end frequency, for slides. */
  readonly slideTo?: number;
  /** Offset from the start of the effect, in seconds. */
  readonly at: number;
  /** Length in seconds. */
  readonly duration: number;
  /** Peak level, 0–1, before the master volume. */
  readonly gain: number;
}

export interface SfxDefinition {
  readonly notes: readonly SfxNote[];
  /** The same effect is dropped if requested again within this time. */
  readonly minIntervalMs: number;
  /** Instances of this effect allowed to sound at once. */
  readonly maxInstances: number;
}

const arpeggio = (wave: SfxWave, freqs: readonly number[], step: number, duration: number, gain: number): SfxNote[] =>
  freqs.map((freq, index) => ({ wave, freq, at: index * step, duration, gain }));

export const SFX: Readonly<Record<SfxId, SfxDefinition>> = {
  correct: { notes: arpeggio('triangle', [660, 880], 0.055, 0.1, 0.32), minIntervalMs: 50, maxInstances: 2 },
  wrong: {
    notes: [
      { wave: 'square', freq: 196, slideTo: 130, at: 0, duration: 0.2, gain: 0.2 },
      { wave: 'sawtooth', freq: 147, slideTo: 98, at: 0.02, duration: 0.2, gain: 0.14 },
    ],
    minIntervalMs: 90,
    maxInstances: 1,
  },
  combo: { notes: arpeggio('square', [523, 659, 784, 1047], 0.05, 0.09, 0.15), minIntervalMs: 120, maxInstances: 1 },
  perfect: {
    notes: [
      ...arpeggio('triangle', [523, 659, 784, 1047, 1319], 0.08, 0.2, 0.28),
      { wave: 'sine', freq: 2093, at: 0.4, duration: 0.3, gain: 0.08 },
    ],
    minIntervalMs: 400,
    maxInstances: 1,
  },
  golden: {
    notes: [
      ...arpeggio('sine', [988, 1319, 1568, 1976], 0.06, 0.16, 0.26),
      { wave: 'triangle', freq: 2637, at: 0.24, duration: 0.22, gain: 0.1 },
    ],
    minIntervalMs: 200,
    maxInstances: 1,
  },
  shiftChange: {
    notes: [
      { wave: 'sawtooth', freq: 220, slideTo: 110, at: 0, duration: 0.22, gain: 0.1 },
      { wave: 'triangle', freq: 330, at: 0.2, duration: 0.14, gain: 0.24 },
      { wave: 'triangle', freq: 494, at: 0.33, duration: 0.2, gain: 0.26 },
    ],
    minIntervalMs: 400,
    maxInstances: 1,
  },
  ready: { notes: arpeggio('square', [740, 1109], 0.04, 0.06, 0.14), minIntervalMs: 150, maxInstances: 1 },
  tick: { notes: [{ wave: 'sine', freq: 880, at: 0, duration: 0.07, gain: 0.26 }], minIntervalMs: 150, maxInstances: 1 },
  go: {
    notes: [
      { wave: 'square', freq: 698, at: 0, duration: 0.24, gain: 0.13 },
      { wave: 'triangle', freq: 1397, at: 0, duration: 0.28, gain: 0.26 },
    ],
    minIntervalMs: 250,
    maxInstances: 1,
  },
  gameOver: {
    notes: [
      ...arpeggio('triangle', [392, 330, 262], 0.17, 0.2, 0.28),
      { wave: 'sawtooth', freq: 196, slideTo: 65, at: 0.5, duration: 0.65, gain: 0.16 },
    ],
    minIntervalMs: 800,
    maxInstances: 1,
  },
  ui: { notes: [{ wave: 'triangle', freq: 1175, at: 0, duration: 0.04, gain: 0.16 }], minIntervalMs: 40, maxInstances: 2 },
};

export const AUDIO_DEFAULTS = {
  masterVolume: 0.6,
  /** Hard ceiling on effects sounding at once, across all effects. */
  maxTotalInstances: 8,
  /** Fade applied to each note's end, in seconds, to avoid clicks. */
  releaseSeconds: 0.03,
} as const;
