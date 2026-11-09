import type { SfxId } from '../config/soundDesign';
import type { SessionEvent } from './RunSession';

/**
 * Which effects a batch of session events should play. A batch is one game
 * moment, so a bigger reward replaces a smaller one instead of stacking on it.
 */
export function soundsForEvents(events: readonly SessionEvent[]): SfxId[] {
  const sounds = new Set<SfxId>();

  for (const event of events) {
    switch (event.type) {
      case 'PARCEL_SORTED':
        sounds.add(event.correct ? 'correct' : 'wrong');
        break;
      case 'PARCEL_MISSED':
        sounds.add('wrong');
        break;
      case 'COMBO_CHANGED':
        if (event.combo.multiplierIncreased || event.combo.streakBonus > 0) sounds.add('combo');
        break;
      case 'BONUS_AWARDED':
        if (event.kind === 'GOLDEN') sounds.add('golden');
        if (event.kind === 'PERFECT_SHIFT') sounds.add('perfect');
        break;
      case 'SHIFT_ANNOUNCED':
        sounds.add('shiftChange');
        break;
      case 'COUNTDOWN_STARTED':
        sounds.add('ready');
        break;
      case 'COUNTDOWN_TICK':
        sounds.add('tick');
        break;
      case 'SHIFT_STARTED':
        sounds.add('go');
        break;
      case 'RUN_ENDED':
        sounds.add('gameOver');
        break;
      case 'PARCEL_SPAWNED':
      case 'SCORE_CHANGED':
      case 'MISTAKES_CHANGED':
      case 'SHIFT_COMPLETED':
        break;
    }
  }

  if (sounds.has('gameOver')) sounds.delete('wrong');
  if (sounds.has('perfect') || sounds.has('golden') || sounds.has('combo')) sounds.delete('correct');
  if (sounds.has('perfect')) {
    sounds.delete('combo');
    sounds.delete('golden');
  }
  if (sounds.has('golden')) sounds.delete('combo');
  return [...sounds];
}
