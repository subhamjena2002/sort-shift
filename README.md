# SORT SHIFT — Neon Parcel Depot

An endless arcade sorting game for the browser. Parcels ride a neon conveyor
towards a sorting gate; send each one to the correct bin before it crosses the
magenta decision line. The sorting rule changes every shift while the belt gets
faster. Three mistakes end the run.

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

## How a run works

Every parcel has a **color** (blue, red, yellow, green), a **shape** (circle,
square) and a printed label, so nothing relies on color vision alone.

A run moves through endless **shifts**. Each shift needs 10 correct sorts at
first (slowly rising to 15) and uses one rule mode, in a repeating cycle:

| Shift | Mode        | Example                                         |
|-------|-------------|-------------------------------------------------|
| 1     | Color       | Blue → left, red → right                        |
| 2     | Shape       | Circle → left, square → right                   |
| 3     | Reverse     | A previous mapping with its sides swapped       |
| 4     | Combination | Blue circle or red square → left, the rest right |
| 5+    | Repeats     | New mappings, a faster belt, a shorter gap      |

- Before each shift the belt empties and a SHIFT CHANGE card shows the new
  LEFT and RIGHT mappings during a short learning interval.
- A parcel is always judged by the rule in force when it spawned.
- Wrong bin or a parcel crossing the decision line unsorted: **1 mistake**.
  The third mistake ends the run. Best score is saved in `localStorage`.
- One parcel at a time; the next one spawns only after the previous one is
  resolved, so a left or right press is never ambiguous.

### Scoring

| Event                 | Points                                                  |
|-----------------------|---------------------------------------------------------|
| Correct sort          | 10 × combo multiplier                                   |
| Combo multiplier      | ×2 at a streak of 5, ×3 at 10, ×4 at 20                 |
| Streak bonus          | Every 5 in a row: 10 per milestone, up to 100           |
| Perfect shift         | 100, plus 20 per shift, up to 400                       |
| Golden parcel         | +50 when sorted correctly (appears from shift 3)        |

All pacing and reward numbers live in `src/game/config/`.

## Project structure

```
src/
  main.ts                 Entry: loads bundled fonts, boots the game
  styles/main.css         Page shell only
  types/game.ts           Core domain types (Parcel, BinSide, GameState …)
  game/
    createGame.ts         Phaser config (FIT scaling, scenes, input)
    config/               Display sizes, difficulty, progression, scoring, key bindings
    data/                 Sorting rule libraries and parcel catalogue (pure data)
    systems/              Game logic — pure TypeScript, no Phaser:
                            RunSession (the core loop), RuleEvaluator, RuleSet,
                            ShiftManager, DifficultyManager, ComboSystem,
                            BonusParcelSystem, ScoreSystem, MistakeTracker,
                            ParcelFactory, GameStateMachine, HighScoreStore
                          Phaser glue: InputController, ResponsiveScaler
    entities/             Conveyor, ParcelView, SortBin (visuals)
    ui/                   Theme, pure layout maths, NeonButton, Hud, Panel,
                          ShiftAnnouncement, rule glyphs, Backdrop,
                          FeedbackLayer, overlays, generated textures
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
- **Rules are data, and proven complete.** A `SortingRule` is a list of clauses
  matching parcel attributes. `RuleSet` validates each rule against the parcels
  it can receive, rejecting any with a gap or a contradiction.
- **Shifts are generated, not listed.** `generateShiftPlan(n)` is a pure function
  of the shift number and config, so progression is endless and deterministic.
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
