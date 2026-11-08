# SORT SHIFT — Neon Parcel Depot

An endless arcade sorting game for the browser. Parcels ride a neon conveyor
towards a sorting gate; send each one to the correct bin before it crosses the
magenta decision line. Three mistakes end the shift.

Built with **Phaser 4.2.1**, **TypeScript** (strict), **Vite** and **Vitest**.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (Vitest)
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build
```

## Controls

| Action     | Keyboard        | Mouse / touch              |
|------------|-----------------|----------------------------|
| Left bin   | `←` or `A`      | LEFT button                |
| Right bin  | `→` or `D`      | RIGHT button               |
| Pause      | `Esc` or `P`    | Pause button (top right)   |
| Menus      | `Enter` / `Space` to play or restart, `R` restart, `M` menu |

The game also pauses itself when the tab or window loses focus.

## Rules (milestone 1)

- Active rule: **BLUE → LEFT**, **RED → RIGHT** (always shown above the belt).
- Correct sort: **+10 points**.
- Wrong bin or a parcel crossing the decision line unsorted: **1 mistake**.
- The third mistake ends the run. Best score is saved in `localStorage`.
- One parcel at a time; the next one spawns only after the previous one is resolved.
- The belt speeds up gently every 5 correct sorts (capped).

## Project structure

```
src/
  main.ts                 Entry: loads bundled fonts, boots the game
  styles/main.css         Page shell only
  types/game.ts           Core domain types (Parcel, BinSide, GameState …)
  game/
    createGame.ts         Phaser config (FIT scaling, scenes, input)
    config/               Display sizes, difficulty curve, scoring, key bindings
    data/                 Sorting rules and parcel catalogue (pure data)
    systems/              Game logic — pure TypeScript, no Phaser:
                            RunSession (the core loop), RuleEvaluator, ScoreSystem,
                            MistakeTracker, ParcelFactory, GameStateMachine,
                            HighScoreStore
                          Phaser glue: InputController, ResponsiveScaler
    entities/             Conveyor, ParcelView, SortBin (visuals)
    ui/                   Theme, pure layout maths, NeonButton, Hud, Panel,
                          Backdrop, FeedbackLayer, overlays, generated textures
    scenes/               Boot, Menu, Game, Pause, GameOver + SceneDirector
    utils/                Seeded RNG, storage access
tests/                    Vitest specs for the pure systems and layout
public/assets/            Reserved for Blender-rendered images and audio
```

### Architecture notes

- **Logic is separate from rendering.** `RunSession` owns the rules: spawning,
  parcel progress, sorting, misses, scoring, mistakes and game over. Scenes
  call `update(delta)` and `choose(side)` and react to the returned events, so
  the gameplay is deterministic for a seed and fully unit-testable.
- **Rules are data.** `SortingRule` is an ordered list of clauses matching
  parcel attributes. Adding a `shape` attribute to `ParcelAttributes` makes
  shape-based rules work without touching the evaluator or UI handlers.
- **One owner for game flow.** `SceneDirector` routes every transition through
  `GameStateMachine` (`MENU → PLAYING ⇄ PAUSED → GAME_OVER`), so duplicate or
  illegal requests (double clicks, pausing twice) are rejected.
- **Responsive without distortion.** Phaser's `FIT` scale mode letterboxes a
  fixed design size. The game switches between a 1280×720 landscape layout and
  a 720×1280 portrait layout to match the window, and scenes re-layout live.
- **Placeholder art.** All art is generated at boot with Phaser Graphics
  (`ui/textures.ts`). Texture keys there are the swap points for Blender renders.

## Fonts

Orbitron and Rajdhani (SIL Open Font License 1.1) are bundled locally via
`@fontsource`, so the game makes no network requests at runtime.
