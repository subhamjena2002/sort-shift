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
npm run verify:prod    # confirm dist/ contains no test hooks (after a build)
npm run test:e2e       # Playwright browser tests
npm run test:e2e:soak  # long-session checks (about 15 minutes)
```

Browser tests need Chromium once: `npx playwright install chromium`. They run
against `vite --mode e2e`, the only mode that loads the test bridge.

## Controls

| Action     | Keyboard        | Mouse / touch              |
|------------|-----------------|----------------------------|
| Left bin   | `←` or `A`      | LEFT button                |
| Right bin  | `→` or `D`      | RIGHT button               |
| Pause      | `Esc` or `P`    | Pause button (top right)   |
| I'm ready  | `Enter`/`Space` | I'M READY button           |
| Sound      | `N`             | Speaker button             |
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

- Before each shift the belt stops and a card shows the new LEFT and RIGHT
  mappings. It stays until you press I'M READY (`Enter` / `Space`, click or
  tap), then a 3-2-1 countdown starts the belt.
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
public/assets/images/blender/  Production WebP art generated from blender/
blender/                  Asset scripts, editable scenes, previews
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
- **Blender art, with drawn fallbacks.** Parcels, bins, conveyor parts and
  backgrounds are rendered from scripts in `blender/` (see `blender/README.md`)
  and listed in `src/game/assets/assetManifest.ts`. If an image fails to load,
  a drawn version of that same item is used, never a different variant. Parcel
  labels, symbols and all HUD text stay live in Phaser.

## Playtest guide

No human playtest has been recorded yet. Watch someone play without coaching,
then note answers to these:

- [ ] First-time understanding: could they say what to do after the first card?
- [ ] Difficulty progression: where did it first feel hard, or unfair?
- [ ] Rule-change clarity: could they say what changed at each new shift?
- [ ] Reading time: did they ever feel rushed on a card?
- [ ] I'M READY: did pressing it feel natural, on each input they used?
- [ ] Countdown: too long, too short, or about right?
- [ ] Combos: did building a streak feel satisfying?
- [ ] Golden parcels: did they notice them, including on yellow parcels?
- [ ] Mobile: are the buttons comfortable, with no mistaken taps?
- [ ] Audio feedback: was each sound clear and not distracting?
- [ ] Audio volume: comfortable at the default level?
- [ ] Replayability: did they choose to play again?

## Fonts

Orbitron and Rajdhani (SIL Open Font License 1.1) are bundled locally via
`@fontsource`, so the game makes no network requests at runtime.
