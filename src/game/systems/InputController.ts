import Phaser from 'phaser';
import { GAMEPLAY_KEY_BINDINGS, type PlayerIntent } from '../config/controls';

export type IntentHandler = (intent: PlayerIntent) => void;

interface Binding {
  readonly eventName: string;
  readonly handler: (event: KeyboardEvent) => void;
}

/**
 * Translates keyboard input into player intents. Held-key auto-repeat is
 * ignored so one press is always one action. All listeners are removed in
 * `destroy()` (also wired to scene shutdown by the owner).
 *
 * On-screen buttons call the same intent handler directly, so keyboard,
 * mouse and touch all share one code path.
 */
export class InputController {
  private readonly keyboard: Phaser.Input.Keyboard.KeyboardPlugin | null;
  private readonly bindings: Binding[] = [];

  constructor(scene: Phaser.Scene, onIntent: IntentHandler, bindings = GAMEPLAY_KEY_BINDINGS) {
    this.keyboard = scene.input.keyboard;
    if (!this.keyboard) return;

    // Stop arrow keys / space from scrolling the host page (e.g. portal iframes).
    this.keyboard.addCapture('LEFT,RIGHT,UP,DOWN,SPACE');

    for (const intent of Object.keys(bindings) as PlayerIntent[]) {
      for (const key of bindings[intent]) {
        const eventName = `keydown-${key}`;
        const handler = (event: KeyboardEvent): void => {
          if (event.repeat) return;
          onIntent(intent);
        };
        this.keyboard.on(eventName, handler);
        this.bindings.push({ eventName, handler });
      }
    }
  }

  destroy(): void {
    if (this.keyboard) {
      for (const { eventName, handler } of this.bindings) this.keyboard.off(eventName, handler);
    }
    this.bindings.length = 0;
  }
}

/**
 * Bind simple one-shot keys (menus/overlays). Returns a disposer and also
 * auto-disposes on scene shutdown.
 */
export function bindMenuKeys(scene: Phaser.Scene, keys: Readonly<Record<string, () => void>>): () => void {
  const keyboard = scene.input.keyboard;
  if (!keyboard) return () => undefined;
  const entries = Object.entries(keys).map(([key, action]) => {
    const eventName = `keydown-${key}`;
    const handler = (event: KeyboardEvent): void => {
      if (!event.repeat) action();
    };
    keyboard.on(eventName, handler);
    return { eventName, handler };
  });
  let disposed = false;
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    for (const { eventName, handler } of entries) keyboard.off(eventName, handler);
  };
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, dispose);
  return dispose;
}
