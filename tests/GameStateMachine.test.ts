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
