// Bundled, open-source (OFL-1.1) fonts — served locally, no network fetches.
import '@fontsource/orbitron/latin-700.css';
import '@fontsource/orbitron/latin-900.css';
import '@fontsource/rajdhani/latin-600.css';
import '@fontsource/rajdhani/latin-700.css';
import './styles/main.css';
import { createGame, type GameHandle } from './game/createGame';

const FONT_FACES = ['700 32px "Orbitron"', '900 32px "Orbitron"', '600 32px "Rajdhani"', '700 32px "Rajdhani"'];
const FONT_TIMEOUT_MS = 2500;

/**
 * Phaser rasterises Text to canvas immediately, so wait for the web fonts
 * first (with a timeout so a font problem can never block the game).
 */
async function waitForFonts(): Promise<void> {
  if (!('fonts' in document)) return;
  const load = Promise.all(FONT_FACES.map((face) => document.fonts.load(face))).then(() => undefined);
  const timeout = new Promise<void>((resolve) => window.setTimeout(resolve, FONT_TIMEOUT_MS));
  try {
    await Promise.race([load, timeout]);
  } catch {
    // Fall back to system fonts.
  }
}

declare global {
  interface Window {
    /** Dev builds only: handle for automated QA scripts and debugging. */
    __SORT_SHIFT_DEBUG__?: GameHandle;
  }
}

let handle: GameHandle | null = null;

async function start(): Promise<void> {
  const parent = document.getElementById('game-root');
  if (!parent) throw new Error('Missing #game-root element');
  await waitForFonts();
  handle = createGame(parent);
  if (import.meta.env.DEV) window.__SORT_SHIFT_DEBUG__ = handle;
  // Vite replaces this flag at build time, so a normal build drops the branch
  // and never emits the bridge's code.
  if (import.meta.env.VITE_E2E === 'true') {
    const { installE2EBridge } = await import('./game/e2e/bridge');
    installE2EBridge(handle.game);
  }
}

void start();

// Vite HMR: tear the old game down so reloads never stack canvases/listeners.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    handle?.destroy();
    handle = null;
  });
}
