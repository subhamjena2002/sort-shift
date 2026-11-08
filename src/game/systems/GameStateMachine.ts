import type { GameState } from '../../types/game';

/** Legal transitions between the high-level game states. */
export const GAME_STATE_TRANSITIONS: Readonly<Record<GameState, readonly GameState[]>> = {
  MENU: ['PLAYING'],
  PLAYING: ['PAUSED', 'GAME_OVER'],
  // PAUSED -> PLAYING covers both "resume" and "restart".
  PAUSED: ['PLAYING', 'MENU'],
  GAME_OVER: ['PLAYING', 'MENU'],
};

export type StateChangeListener = (next: GameState, previous: GameState) => void;

/**
 * Guards state changes so that, for example, a double-clicked button can't
 * start two runs or a paused game can't be paused again.
 */
export class GameStateMachine {
  private current: GameState;
  private readonly listeners = new Set<StateChangeListener>();

  constructor(initial: GameState = 'MENU') {
    this.current = initial;
  }

  get state(): GameState {
    return this.current;
  }

  is(state: GameState): boolean {
    return this.current === state;
  }

  canTransition(to: GameState): boolean {
    return GAME_STATE_TRANSITIONS[this.current].includes(to);
  }

  /** Attempt a transition. Returns false (and changes nothing) if illegal. */
  transition(to: GameState): boolean {
    if (!this.canTransition(to)) return false;
    const previous = this.current;
    this.current = to;
    for (const listener of this.listeners) listener(to, previous);
    return true;
  }

  /** Subscribe to state changes. Returns an unsubscribe function. */
  onChange(listener: StateChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
