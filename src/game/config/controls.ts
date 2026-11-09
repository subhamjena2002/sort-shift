/** Abstract player intents, decoupled from the physical inputs that cause them. */
export type PlayerIntent = 'LEFT' | 'RIGHT' | 'PAUSE' | 'READY' | 'MUTE';

/** Phaser key names (see Phaser.Input.Keyboard.KeyCodes) mapped to intents. */
export const GAMEPLAY_KEY_BINDINGS: Readonly<Record<PlayerIntent, readonly string[]>> = {
  LEFT: ['LEFT', 'A'],
  RIGHT: ['RIGHT', 'D'],
  PAUSE: ['ESC', 'P'],
  READY: ['ENTER', 'SPACE'],
  MUTE: ['N'],
};

/** Returns the intent bound to a key name, if any. */
export function intentForKey(keyName: string): PlayerIntent | null {
  const upper = keyName.toUpperCase();
  for (const intent of Object.keys(GAMEPLAY_KEY_BINDINGS) as PlayerIntent[]) {
    if (GAMEPLAY_KEY_BINDINGS[intent].includes(upper)) return intent;
  }
  return null;
}
