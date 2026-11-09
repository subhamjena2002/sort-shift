import { describe, expect, it, vi } from 'vitest';
import { GameStateMachine } from '../src/game/systems/GameStateMachine';

describe('GameStateMachine', () => {
  it('starts in MENU', () => {
    expect(new GameStateMachine().state).toBe('MENU');
  });

  it('follows the full MENU → PLAYING → PAUSED → PLAYING → GAME_OVER → MENU loop', () => {
    const machine = new GameStateMachine();
    expect(machine.transition('PLAYING')).toBe(true);
    expect(machine.transition('PAUSED')).toBe(true);
    expect(machine.transition('PLAYING')).toBe(true);
    expect(machine.transition('GAME_OVER')).toBe(true);
    expect(machine.transition('MENU')).toBe(true);
    expect(machine.state).toBe('MENU');
  });

  it('allows restart from PAUSED and GAME_OVER, and menu from PAUSED', () => {
    const machine = new GameStateMachine('PAUSED');
    expect(machine.canTransition('PLAYING')).toBe(true);
    expect(machine.canTransition('MENU')).toBe(true);
    const over = new GameStateMachine('GAME_OVER');
    expect(over.canTransition('PLAYING')).toBe(true);
  });

  it('rejects illegal or duplicate transitions without changing state', () => {
    const machine = new GameStateMachine();
    expect(machine.transition('PAUSED')).toBe(false);
    expect(machine.transition('GAME_OVER')).toBe(false);
    expect(machine.state).toBe('MENU');
    machine.transition('PLAYING');
    expect(machine.transition('PLAYING')).toBe(false); // double "Play" click
    machine.transition('PAUSED');
    expect(machine.transition('PAUSED')).toBe(false);
    expect(machine.transition('GAME_OVER')).toBe(false); // can't lose while paused
    expect(machine.state).toBe('PAUSED');
  });

  it('follows PLAYING → SHIFT_ANNOUNCEMENT → COUNTDOWN → PLAYING', () => {
    const machine = new GameStateMachine('PLAYING');
    expect(machine.transition('SHIFT_ANNOUNCEMENT')).toBe(true);
    expect(machine.transition('COUNTDOWN')).toBe(true);
    expect(machine.transition('PLAYING')).toBe(true);
  });

  it('cannot leave an announcement except by confirming or pausing', () => {
    const machine = new GameStateMachine('SHIFT_ANNOUNCEMENT');
    expect(machine.transition('PLAYING')).toBe(false);
    expect(machine.transition('GAME_OVER')).toBe(false);
    expect(machine.transition('SHIFT_ANNOUNCEMENT')).toBe(false);
    expect(machine.state).toBe('SHIFT_ANNOUNCEMENT');
  });

  it('allows pausing from an announcement or countdown and returning to it', () => {
    for (const state of ['SHIFT_ANNOUNCEMENT', 'COUNTDOWN'] as const) {
      const machine = new GameStateMachine(state);
      expect(machine.transition('PAUSED')).toBe(true);
      expect(machine.transition(state)).toBe(true);
    }
  });

  it('does not allow a countdown to go back to an announcement', () => {
    const machine = new GameStateMachine('COUNTDOWN');
    expect(machine.transition('SHIFT_ANNOUNCEMENT')).toBe(false);
  });

  it('notifies listeners and supports unsubscribing', () => {
    const machine = new GameStateMachine();
    const listener = vi.fn();
    const off = machine.onChange(listener);
    machine.transition('PLAYING');
    expect(listener).toHaveBeenCalledWith('PLAYING', 'MENU');
    off();
    machine.transition('PAUSED');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
