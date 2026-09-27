# Tidepool: Implementation Plan

This is the engineering plan for building Tidepool as described in [`README.md`](../README.md), the vision document. The README says **what** the game is. This document says **how** it will be built: the architecture, the exact rules where the README leaves room for interpretation, the game feel values, the tooling, and the ordered task breakdown.

Every task in §16 has an ID (`T1.05`, etc.) and a matching GitHub issue. When the README and this plan disagree, the README wins on *design intent*, and this plan wins on *implementation detail*. Update this file when a decision changes.

---

## Table of contents

1. [Resolved design decisions](#1-resolved-design-decisions)
2. [Tech stack & tooling](#2-tech-stack--tooling)
3. [Architecture overview](#3-architecture-overview)
4. [Core domain model](#4-core-domain-model)
5. [Game rules specification](#5-game-rules-specification)
6. [Fair piece generator](#6-fair-piece-generator)
7. [Rendering](#7-rendering)
8. [Input](#8-input)
9. [Layout](#9-layout)
10. [UI screens & flow](#10-ui-screens--flow)
11. [Game feel specification](#11-game-feel-specification)
12. [Audio](#12-audio)
13. [Services: storage, ads, analytics, platform](#13-services)
14. [Voyage mode](#14-voyage-mode)
15. [Progression, economy & boosters](#15-progression-economy--boosters)
16. [Milestones & task index](#16-milestones--task-index)
17. [Testing strategy](#17-testing-strategy)
18. [Performance budgets](#18-performance-budgets)
19. [Accessibility](#19-accessibility)
20. [Build targets & release](#20-build-targets--release)
21. [Risks](#21-risks)
22. [Open questions & recommendations](#22-open-questions--recommendations)

---

## 1. Resolved design decisions

The README leaves some details open. These are the decisions this plan uses. Each can be changed, but code and tests should follow them until then.

| # | Topic | Decision |
|---|---|---|
| D1 | Cells cleared when a row and a column clear together | Count **unique** cells. A row and a column that cross clear 15 cells, not 16. |
| D2 | Clear score formula | `10 × uniqueCellsCleared × linesClearedThisPlacement × streakMultiplier`, rounded down to an integer. |
| D3 | Streak semantics | A **tray-set** is the time between two deals. At the end of each tray-set (when the 3rd piece is placed), `streak++` if the set had at least one clear, otherwise `streak = 0`. Clears during a set use `multiplier = min(1 + 0.5 × streak, 4)`. The first set with a clear scores ×1, the next consecutive one ×1.5, and so on. |
| D4 | What the streak multiplier applies to | **Line-clear points only.** Placement points and the clean-board bonus are not multiplied. |
| D5 | Clean board bonus | +300 when the board is fully empty after a clear. It is added once per placement and is not multiplied. |
| D6 | Callouts | Based on lines cleared in a single placement: 2 → "Nice!", 3 → "Splash!", 4+ → "Tidal Wave!". A clean board also shows "Crystal Clear!". A single line shows only the floating points. |
| D7 | Game over check timing | Checked after each placement (after clears resolve) and after each deal. Game over happens when **no** remaining tray piece fits anywhere. |
| D8 | "At least one piece fits" guarantee | The 1-cell dot fits whenever any cell is empty. A board with no empty cells is impossible, because a full board would have full lines, which clear. So the guarantee can **always** be met, and the generator's fallback is always valid. |
| D9 | Piece colour | Each dealt piece gets a random colour (0–5) from the seeded RNG. It does not affect Endless rules. |
| D10 | Rotation | Pieces never rotate, except through the Rotate booster, which rotates a tray piece 90° clockwise. Rotating means swapping to the shape that is the rotated variant of the same family. |
| D11 | Second chance (Endless) | Once per run, a rewarded ad deals a special tray of 3 pieces from the **small set** (1–3 cells). Each of them must fit the current board. This tray counts as a normal tray-set for streaks. |
| D12 | Voyage move | 1 move = 1 piece placed. Boosters do not use moves. |
| D13 | Voyage stars | Reaching the goal gives ≥ 1 star. The level defines `stars: [twoStarMovesLeft, threeStarMovesLeft]` thresholds. |
| D14 | Voyage failure | The level fails when moves run out before the goal is met, or when no tray piece fits. |
| D15 | Coral counting | Coral counts as a **filled** cell for completing lines. On a line clear it takes 1 hit and stays (cracked). On the 2nd hit it breaks and the cell becomes empty. |
| D16 | Frozen glass (later milestone) | A frozen cell counts as filled. When a completed line contains a frozen cell, that line still clears, but the frozen cell only **thaws** into normal glass and stays. A clear of an orthogonally adjacent cell also thaws it. |
| D17 | Urchin chain reactions (later milestone) | An urchin's 3×3 blast can trigger other urchins in the same resolution step. Chains resolve breadth-first. Blast cells do not count as "lines" for the score multiplier; they score 10 points per cell. |
| D18 | Session | A session starts at app launch, or when the app returns after ≥ 30 minutes hidden. It is used for the "no interstitials in first session" rule and for analytics. |
| D19 | Interstitial frequency | An interstitial can show only at break points (between runs or levels), only after ≥ 180 s of **gameplay time** since the last interstitial or since the session started, never in session #1, and never within 60 s after a rewarded ad. Portal SDKs may apply stricter caps of their own. |
| D20 | Resume | An Endless run in progress is saved after every placement, so closing the tab and coming back resumes the run. |

---

## 2. Tech stack & tooling

| Concern | Choice | Notes |
|---|---|---|
| Language | TypeScript (`strict: true`, `noUncheckedIndexedAccess: true`) | |
| Bundler / dev server | Vite | Fast HMR, simple multi-target builds through `mode` and env. |
| Rendering | Canvas 2D | The board, tray, dragged piece and particles use **one** `<canvas>`. |
| UI | Plain DOM + CSS (no framework) | Menus, HUD and dialogs. A tiny helper (`h()` element builder) is enough. Add Preact only if UI complexity grows. |
| Unit tests | Vitest | Core logic has close to 100% coverage. |
| Property tests | fast-check | For board and scoring invariants. |
| E2E smoke | Playwright | Checks that the game boots, a drag places a piece, and game over renders. |
| Lint / format | ESLint (typescript-eslint) + Prettier | The `@typescript-eslint/no-restricted-imports` rules (regex patterns per folder) enforce the layer boundaries (§3.2), and `tools/lint-boundaries.test.ts` tests them. |
| Bundle budget | `size-limit` (or a custom script on `dist/`) | Runs in CI. |
| Offline (web) | `vite-plugin-pwa` (Workbox) | Enabled for the standalone web / itch build only. Portal builds usually don't allow a service worker. |
| Android | Capacitor, `@capacitor-community/admob`, `@capacitor/haptics`, `@capacitor/preferences`, `@capacitor/app` | |
| CI | GitHub Actions | Runs lint, typecheck, test, build and the size check on every PR. Deploys the web build to GitHub Pages on `main`. |
| Package manager | npm | Node 22 LTS. `.nvmrc` pins it. |

**Planned npm scripts** (created in T1.01; keep this list in sync with `package.json`):

```
npm run dev              # Vite dev server
npm run build            # production build (default target: web)
npm run build:<target>   # web | crazygames | poki | android
npm run preview          # serve dist/
npm run test             # vitest run
npm run test:watch       # vitest
npx vitest run src/core/board.test.ts        # single file
npx vitest run -t "clears row and column"    # single test by name
npm run test:e2e         # playwright
npm run lint             # eslint
npm run typecheck        # tsc --noEmit
npm run sim -- --games 5000 --seed 1   # headless generator/balance simulation (T1.10)
npm run size             # bundle size check
```

---

## 3. Architecture overview

### 3.1 Directory layout

```
src/
  main.ts                 # bootstrap: create services, app, start loop
  app/                    # composition root & screen router
    App.ts                # owns current screen, wires services
    events.ts             # typed event bus
  core/                   # PURE logic: no DOM, no canvas, no timers, no Math.random
    rng.ts                # seedable RNG (serializable state)
    shapes.ts             # shape catalogue
    board.ts              # grid, placement, line detection, clearing
    scoring.ts
    generator.ts          # fair piece generation
    game.ts               # EndlessGame: tray, deal, place, game over, snapshot
    tiles.ts              # special tiles (Voyage)
    level.ts              # level parsing/validation + VoyageGame goals/moves/stars
    boosters.ts
    economy.ts            # shells rules (pure functions)
    config.ts             # all tunables (weights, scores, timings used by logic)
  render/
    Renderer.ts           # canvas setup, DPR, frame orchestration
    layout.ts             # pure: viewport -> rects (unit-tested)
    sprites.ts            # pre-rendered sea-glass block sprites
    boardView.ts / trayView.ts / dragView.ts
    background.ts         # sand + caustics
    tween.ts              # tween system + easings
    particles.ts          # pooled particles
    effects/              # clear wave, sparkles, shake
  input/
    DragController.ts     # pointer events -> drag state -> placement intents
    hitTest.ts
  ui/
    dom.ts                # h() helper
    screens/              # MainMenu, Game (HUD), GameOver, Settings, Pause, ReefMap, LevelIntro, LevelResult, Shop, TileTutorial
    components/           # Button, Toggle, Modal, Callout, ScoreCounter
    styles/
  services/
    ads/
      AdService.ts        # interface (README §8.3)
      NoAdsService.ts
      CrazyGamesAdService.ts
      PokiAdService.ts
      AdMobAdService.ts
      AdManager.ts        # policy: frequency caps, first session, per-day limits
    storage/
      StorageBackend.ts   # interface: get/set string
      LocalStorageBackend.ts / MemoryBackend.ts / CapacitorPreferencesBackend.ts
      SaveStore.ts        # versioned schema + migrations + debounced writes
    audio/
      AudioEngine.ts
      sfx.ts
    analytics/
      Analytics.ts        # interface + ConsoleAnalytics + NoopAnalytics
    platform/
      Platform.ts         # haptics, lifecycle, back button, target info
  levels/
    shallows/001.json …
tools/
  sim/                    # headless simulation bot (Node, uses src/core)
  levels/                 # level validation / solvability checker
tests/e2e/                # Playwright
```

### 3.2 Layer rules (enforced by lint)

```
             ┌──────────── app/ (composition root) ────────────┐
             │                                                  │
   ui/  ◀────┤          render/        input/        services/  │
             │               │            │               │     │
             └───────────────┴─────┬──────┴───────────────┘     │
                                   ▼                            │
                                 core/  ◀───────────────────────┘
```

- `core/` imports **nothing** outside `core/`. No `window`, `document`, `performance`, `Math.random` or `Date.now()` (time is passed in when needed).
- `render/`, `input/`, `ui/` and `services/` may import `core/` types and pure helpers, but not each other. `app/` wires them together.
- Exception: `render/` may import `input/` drag *state types* to draw the dragged piece.
- Ads are only reached through `AdManager`. Screens never call a provider SDK directly.

### 3.3 Data flow

```
 pointer ──▶ DragController ──(PlaceIntent{slot,row,col})──▶ App ──▶ core Game.place()
                                                                        │
                                             GameEvent[] (placed, cleared, scored, dealt, gameOver…)
                                                                        │
                       ┌────────────────────────┬───────────────────────┼──────────────────┐
                       ▼                        ▼                       ▼                  ▼
                 Renderer (animations)     Audio (sfx)            UI/HUD (score)     SaveStore / Analytics
```

- **The logic never waits for visuals.** `Game.place()` updates state at once and returns a list of events. The renderer plays animations from those events. Its visual state can briefly lag behind the logical state; for example, cleared cells are still drawn while they dissolve.
- The only visual gating: the Game Over screen appears after pending clear animations finish (~600 ms), and input is ignored during the deal-in animation of a new tray (≤ 250 ms).
- Events are plain serializable objects. That keeps them easy to log, test and replay.

### 3.4 Main loop

- `requestAnimationFrame` loop with `dt` clamped to ≤ 50 ms.
- The renderer draws **only when needed**: while tweens or particles are active, during a drag, or while the ambient caustics are on. When nothing is animating and caustics are off, it draws no frames, which saves battery. Caustics are capped at 30 fps (§7.5).
- On `visibilitychange → hidden`, the loop pauses, audio is suspended, the game is saved, and `AdService.gameplayStop()` is called when a run is active.
- `services/platform/lifecycle.ts` merges `visibilitychange`, `pagehide` and `pageshow` into a single `onHide`/`onShow` pair. On hide, a run in play is paused, so the player comes back to the Pause dialog and play never resumes on its own. Paused time and time on the Game Over panel don't count towards the run duration.
- Restart (from the Pause dialog, after a confirm) and Menu from the Pause dialog never show a break ad. Only leaving from Game Over is a break point.

---

## 4. Core domain model

```ts
// core/shapes.ts
export type ShapeId = string;               // e.g. 'dot', 'i3h', 'l5_ne', 'sq3'
export interface Shape {
  id: ShapeId;
  family: string;                           // 'dot' | 'line2' | … | 't4' — groups rotations
  cells: ReadonlyArray<readonly [row: number, col: number]>; // normalized: min row/col = 0
  width: number; height: number; size: number;
  rotateCW: ShapeId;                        // for Rotate booster (self for symmetric shapes)
}

// core/board.ts
export const SIZE = 8;
export interface Cell {
  color: number | null;                     // null = empty sand; 0..5 = glass colour
  tile?: TileState;                         // Voyage special tile (see §14)
}
export interface Board { cells: Cell[] /* length 64, index = r*8+c */ }

// Pure functions (return new Board or result objects; never mutate input):
canPlace(board, shape, row, col): boolean
place(board, shape, row, col, color): Board
findFullLines(board): { rows: number[]; cols: number[] }
clearLines(board, lines): { board: Board; clearedCells: number[]; tileEffects: TileEffect[] }
anyFit(board, shape): boolean
allFits(board, shape): Array<[row, col]>
fullness(board): number                     // 0..1 filled ratio

// core/game.ts
export interface TraySlot { shape: ShapeId; color: number } // null when used
export interface EndlessState {
  board: Board;
  tray: (TraySlot | null)[];                // length 3
  score: number;
  streak: number;
  setHadClear: boolean;
  rng: RngState;
  genHistory: ShapeId[][];                  // last N trays, for repeat limiting
  secondChanceUsed: boolean;
  over: boolean;
  stats: { placed: number; linesCleared: number; bestCombo: number };
}
export type GameEvent =
  | { type: 'placed'; slot: number; shape: ShapeId; row: number; col: number; color: number; points: number }
  | { type: 'cleared'; rows: number[]; cols: number[]; cells: number[]; points: number; multiplier: number; callout?: string }
  | { type: 'cleanBoard'; points: number }
  | { type: 'streak'; streak: number; multiplier: number }
  | { type: 'dealt'; tray: TraySlot[] }
  | { type: 'gameOver'; score: number };
```

Implementation notes:

- The board is a flat array of 64 cells. For fast fit checks, `board.ts` may also keep a per-row 8-bit occupancy mask internally. A shape at `(r,c)` fits when `(rowMask[r+dr] & (shapeRowMask[dr] << c)) === 0` for each of its rows. Profile before adding it: 27 shapes × 64 positions is cheap either way.
- **Immutability:** state updates return new objects (structural sharing is fine). Undo, snapshots and tests all depend on this.
- `EndlessState` is plain JSON (including `rng` state), so saving and resuming is `JSON.stringify` plus a schema version.

### 4.1 Shape catalogue (27 shapes)

| Family | Size | Variants | IDs |
|---|---|---|---|
| dot | 1 | 1 | `dot` |
| line2 | 2 | H, V | `i2h`, `i2v` |
| line3 | 3 | H, V | `i3h`, `i3v` |
| line4 | 4 | H, V | `i4h`, `i4v` |
| line5 | 5 | H, V | `i5h`, `i5v` |
| square2 | 4 | 1 | `sq2` |
| square3 | 9 | 1 | `sq3` |
| corner3 (small L/J) | 3 | 4 | `l3_ne`, `l3_nw`, `l3_se`, `l3_sw` |
| corner5 (big L/J, 3+3 arms) | 5 | 4 | `l5_ne`, `l5_nw`, `l5_se`, `l5_sw` |
| t4 | 4 | 4 | `t4_u`, `t4_d`, `t4_l`, `t4_r` |
| s4 / z4 | 4 | 2 + 2 | `s4h`, `s4v`, `z4h`, `z4v` |

The README lists 3-cell and 5-cell L/J shapes. 4-cell L/J tetrominoes (8 more variants) are a candidate addition if playtests show the set is too narrow. They would sit behind a `config.shapes.includeL4` flag.

**Size classes** (used by the generator): small = 1–3 cells, medium = 4, large = 5–9.

---

## 5. Game rules specification

### 5.1 Placement
1. The player drops tray slot `s` at board position `(row, col)` (top-left of the shape's bounding box).
2. The drop is valid only if every shape cell is inside the board and empty. For Voyage, "empty" also means *not blocked by a tile*. A bubble over an empty cell does **not** block (§14.2).
3. The cells are filled with the slot's colour, and `+size` placement points are awarded.
4. Full rows and columns are found and all cleared **at once** (D1).
5. Scoring (§5.2) is applied.
6. The slot is emptied. When all 3 slots are empty, the tray-set ends: streak updates (D3), and a new tray is dealt (§6).
7. Game over is checked (D7).

### 5.2 Scoring
```
placementPoints = shape.size
clearPoints     = floor(10 × uniqueCells × lines × multiplier)      if lines > 0
multiplier      = min(1 + 0.5 × streak, 4)
cleanBonus      = 300 if board empty after clear
```
Worked examples (streak 0):

| Situation | Points |
|---|---|
| Place `sq3`, no clear | 9 |
| Place `i2h` completing 1 row | 2 + 10×8×1 = 82 |
| Complete 2 parallel rows | size + 10×16×2 = size + 320 |
| Complete 1 row + 1 column crossing | size + 10×15×2 = size + 300 |
| Same as the previous row with streak 2 (×2) | size + 600 |

All values live in `core/config.ts`.

### 5.3 Endless run lifecycle
`new run(seed)` → deal → (place)* → game over → optional second chance (once, D11) → final game over → results (score, best, new-best flag) → Play again.

---

## 6. Fair piece generator

`core/generator.ts`. Deterministic given `(rngState, board, history, mode)`.

### 6.1 Algorithm
```
deal(board, rng, history, cfg):
  f = fullness(board)                                   // 0..1
  for each shape s:
    w[s] = cfg.baseWeight[s.family]
         × sizeFactor(s.sizeClass, f)                   // lerp open→crowded table
         × repeatPenalty(s, history)                    // ×0.4 if in last tray, ×0.7 if in the one before
  repeat up to cfg.maxAttempts (20):
    trio = 3 weighted draws with replacement
    reject if all 3 share a family                      // "never 3 identical"
    reject if no member of trio fits the board          // fairness guarantee
    (optional, cfg.solvableTrio) reject if no placement order of the
       3 pieces exists, simulating clears             // stronger fairness; test cost
    accept
  fallback: take the last trio, replace a random slot with a weighted draw
            restricted to shapes that fit (always exists, see D8)
  colours: 3 draws from 0..5
```

### 6.2 Starting tuning tables (all in `config.ts`, tuned via the simulator)

`sizeFactor` interpolates linearly between the *open* value (fullness 0) and the *crowded* value (fullness ≥ 0.6):

| Size class | Open | Crowded |
|---|---|---|
| 1–2 cells | 0.6 | 1.6 |
| 3 cells | 1.0 | 1.3 |
| 4 cells | 1.0 | 0.9 |
| 5 cells | 0.9 | 0.5 |
| 9 cells (`sq3`) | 0.6 | 0.15 |

The base weights per family start at 1.0. Families with several orientations split their weight across the variants, so "L" is not 4× more common than "square".

### 6.3 Modes
- `normal`: as above.
- `secondChance`: only small shapes (1–3 cells), and **every** piece must fit.
- `voyage`: uses the level's `generator` overrides (a pool of allowed families and/or weights), then the same fairness rules.

### 6.4 Seeding
- `core/rng.ts` implements **sfc32** (or mulberry32) with a state of 4 × uint32 (JSON-safe). API: `createRng(seed: string|number)`, `next(state) → [float, newState]`, `int(state, n)`, `pick(state, weights)`. A string seed is hashed with **cyrb128**.
- Endless: seed = random at run start (from `crypto.getRandomValues` in `app/`, passed into core).
- Daily Tide: seed = `"daily-" + YYYY-MM-DD (UTC)`.
- Voyage: seed = `levelId + "#" + attemptNumber`. Each attempt gets a different sequence, but any attempt can be reproduced for bug reports.
- Debug: `?seed=xyz` in the URL forces the seed (dev builds and a hidden setting).

### 6.5 Validation (simulator, T1.10)
A headless greedy bot plays N seeded games and reports:
- mean, median and p90 score and pieces placed
- deals where the fallback was needed (%)
- game-over fullness distribution
- deals with 0 fitting pieces (**must be 0**)
- shape frequency histogram and repeat rate

The CI test runs a small N (for example 200 games) and asserts the hard invariants. A large N is run manually while tuning.

---

## 7. Rendering

### 7.1 Canvas setup
- One full-viewport canvas, sized by the CSS pixels of its container × `devicePixelRatio` (capped at 2 on low-end devices, or 3 when a quality setting allows it).
- Resize is handled with `ResizeObserver`, then layout (§9) is recomputed, then sprites are rebuilt.
- Draw order per frame: background → board base (sand + grid wells) → placed cells → ghost preview → clear effects → tray pieces → dragged piece → particles. The HUD, callouts and dialogs are DOM elements on top.

### 7.2 Sea-glass block sprites (`sprites.ts`)
Each colour is pre-rendered once per cell size into an `OffscreenCanvas` (or a hidden canvas as fallback):
1. A rounded rect (radius ≈ 22% of the cell), with a base fill gradient from lighter at the top-left to darker at the bottom-right.
2. 85–90% opacity, so the sand shows through slightly (translucent glass).
3. An inner glow: a radial gradient at the centre, in a slightly brighter tint.
4. A specular highlight: a soft white ellipse at the top-left, ~25% opacity.
5. A thin darker rim stroke (1 px at 1× scale).
6. Colour-blind variant: an extra subtle pattern glyph per colour (dot, stripe, ring, chevron, cross, wave) at ~20% opacity (§19).

Also pre-rendered: the empty-cell "sand well" (a slightly recessed tile), the ghost cell (outline plus 30% fill) and the "would clear" highlight.

### 7.3 Palette (default "Tidepool")
| Name | Hex (starting value) |
|---|---|
| Seafoam | `#7FD8BE` |
| Aqua | `#4FC3E8` |
| Coral pink | `#FF8A80` |
| Sand gold | `#F2C66D` |
| Lavender | `#B39DDB` |
| Deep teal | `#26808C` |
| Background | pale sand `#F6EBD9` → water blue `#CDEBF2` gradient |

The palettes are data (`render/palettes.ts`). As built (T2.14):
- `COLORBLIND` (`colorblind`) uses Okabe–Ito hues, nudged by a constrained search. `palettes.test.ts` simulates deuteranopia, protanopia and tritanopia (Machado 2009) and requires every pair of colours to stay ≥ 20 CIELAB ΔE apart. The shipped set reaches 23.
- Each colour has a glyph (dot, stripe, ring, chevron, cross, wave), baked into the block sprites at 28% opacity in a contrasting tone. Glyphs are always on for the colour-blind palette, and optional ("Shape patterns") for the default one.
- The would-clear highlight now also has an outline.
- Palette and patterns come from Settings, and apply live through `GameScene.refreshSprites()`. Colour-blind and cosmetic themes (Sunset, Moonlit, Arctic) are additional entries.

### 7.4 Animation system
- `tween.ts`: `tween(target, props, duration, easing, delay) → handle`, with an `onComplete` callback. Easings: linear, quadOut, cubicOut, backOut, elasticOut, sineInOut.
  - v2 (T2.01): handles have `whenDone(fn)`, and `Tweener.sequence(...steps)`, `parallel(...steps)` and `wait(seconds)` chain tweens synchronously on the render clock (a step is `() => handle`). `Renderer.timeScale` scales every frame's `dt`. In dev, `?slowmo=0.25` sets it.
  - `render/feel.ts` (`FEEL`) holds every §11 number, grouped by moment. Views read it at use time, so the dev panel (`?feel=1`, `app/FeelPanel.ts`) tunes values live and copies them as JSON. A test fails if the view files contain decimal literals or literal durations.
- The visual state (`BoardView`) keeps per-cell display properties: scale, alpha, offsetY and highlight. It animates towards the logical state.
- `particles.ts`: an object pool (≥ 512 particles, no allocations per frame) with position, velocity, gravity, life, size, rotation, colour and sprite type (bubble, sparkle, droplet).
  - Line clear (T2.03): `BoardView` lifts and brightens cleared cells (an additive redraw of the glass), then fades and shrinks them, staggered by distance. `render/ClearFx.ts` sweeps a wave band along each line (clipped to the board, drawn in 4 wobbling slices) and emits bubbles, sparkles and droplets. Bubbles take the cleared glass colours. Crossing cells get an extra burst, and 3+ lines add a droplet splash. All numbers are in `FEEL.lineClear`. Additive blending is a per-type FEEL flag (`additive`). It's off for sparkles, because `lighter` washes out on the light sand.
  - As built (T2.02): struct-of-arrays in fixed typed arrays, with live particles packed in `[0, count)` (swap-remove). When the pool is full, new particles are dropped. `burst(type, x, y, count, spread, speed, {color, angle, lifeScale})` and `line(type, x0, y0, x1, y1, countPerPx, speed, opts)` emit particles. Per-type physics lives in `FEEL.particles`. `density` scales counts and carries fractions between emits. Sparkles draw in a second, `lighter` pass. `draw` takes an (ox, oy) offset for screen shake. Sprites: 4 types × (white + palette colours), 16 CSS px, scaled when drawn.

### 7.5 Background & caustics
- The sand texture is generated once by procedural noise into an offscreen canvas and scaled to the board.
- Caustics: 2–3 layers of pre-rendered soft light blobs, drifting slowly with sine offsets and drawn in `lighter` / `screen` composite mode at low opacity, updated at ≤ 30 fps. They turn off automatically with **Reduced motion** or the **Low power** setting, or when the measured frame time is > 20 ms for 3 seconds.

- As built (T2.06): `render/background.ts`. The sand is a seeded, seamless 256 px tile of value-noise mottling, grain and a few faint pebbles, on transparent. It's baked into the board-base sprite (over the panel and into the wells) and used once at boot as a CSS background around the board, so it costs no frames. The edge vignette is a CSS radial gradient on the canvas element. Caustics are 3 half-resolution layers of wavy light lines, blended with `screen` at 9% and clipped to the board. They drift on their own clock, and `App` redraws them from a 30 fps ticker (the frame loop stays idle between ticks). With caustics off, nothing ticks. They're off with reduced motion or low power. They also switch off for the session when frames take > 20 ms for 3 s, which emits `perfFallback` (analytics `perf_fallback`). Values are in `FEEL.sand` / `FEEL.caustics`.

---

## 8. Input

`input/DragController.ts`, using Pointer Events on the canvas (`touch-action: none`).

1. **pointerdown** on a tray slot. Hit areas are generous (the whole slot rect, not just the shape's cells). The controller records the pointer id and the grab offset, and ignores other pointers until this drag ends.
2. **Lift:** the piece animates from tray scale (~0.55) to board scale in 90 ms.
   - Touch (`pointerType === 'touch'`): the piece is drawn **above the finger**. Its bottom edge sits about `1.2 × cellSize` above the touch point, and it is horizontally centred on the finger.
   - Mouse / pen: the piece keeps the grab offset relative to the cursor.
3. **pointermove:** compute the piece's top-left in board coordinates: `col = round((x - boardX) / cell)`, `row = round((y - boardY) / cell)`.
   - If `canPlace`, show the ghost there and highlight the lines that would clear.
   - **Magnet assist** (config, on by default): if that spot is invalid, try the 8 neighbouring offsets. Pick the valid one whose centre is closest, if it is within 0.5 cell. This makes near-misses forgiving.
   - Outside the board (by more than 0.5 cell): no ghost.
4. **pointerup:** if there is a ghost, emit `PlaceIntent`. Otherwise the piece animates back to its slot (200 ms, backOut).
5. **pointercancel** or lost capture: return to the tray.
6. Dragging is blocked while `inputLocked` (the deal-in animation, a modal open, or game over).

Keyboard play (arrow keys to move the ghost, 1–3 to select a slot, Enter to place) is a stretch goal for accessibility and desktop portals (T2.17).

As built (T2.17): `input/KeyboardController.ts` is pure selection logic:
- **1/2/3** pick a piece at the valid spot nearest the centre.
- **Arrows** jump to the next valid spot straight along the row or column, and only then fan out to neighbouring lines.
- **Enter/Space** place; **Esc** puts the piece back, then toggles pause, and closes Settings.

The App presents the selection as a synthetic `DragState`, so the ghost, the lifted piece, the snap and the return-to-tray animation are shared with pointer drags. The picked tray slot gets a focus ring, and UI controls get `:focus-visible` outlines. Game keys call `preventDefault` only during play, so arrows and space never scroll a portal page, and the menus keep the browser's own keyboard behaviour. A pointer drag cancels a keyboard selection.

---

## 9. Layout

`render/layout.ts` is a **pure function**: `computeLayout(viewportW, viewportH, safeAreaInsets) → Layout`. It is unit-tested for common sizes (360×640, 390×844, 768×1024, 1366×768, 1920×1080).

- **Portrait** (aspect ≤ 0.8): the HUD at the top (~12% of height), the board centred (width = min(92% of width, 60% of height)), and the tray below (height ≈ 0.45 × board). The 3 tray slots are evenly spaced.
- **Landscape** (aspect > 0.8): the board is centred-left (size = min(80% of height, 55% of width)), with the tray as a vertical column of 3 slots on the right and the HUD above the board or at top-left.
- Minimum touch target: 44 CSS px for every button. A tray slot is at least 2.2 × cellSize wide.
- Safe areas: CSS `env(safe-area-inset-*)` for the DOM. The same insets are passed into `computeLayout` for the canvas (important on Android with a notch).
- As built (T2.11):
  - In portrait, spare height first deepens the tray up to `trayRatioMax` (0.6 × board), giving bigger touch targets on 20:9 phones, and then centres the group.
  - In landscape, the HUD spans only the board and tray, not the whole window.
  - `maxBoard` is 720 px.
  - `render/viewport.ts` `readSafeArea()` reads `env(safe-area-inset-*)` through a hidden probe on every layout. The dialogs pad with `max(16px, env(...))`.
  - Any re-layout (rotation, resize) mid-drag cancels the drag, so the piece floats back.
  - Tests cover 800×450 and 960×600 portal embeds: cells ≥ 38 px and slots ≥ 44 px.

---

## 10. UI screens & flow

```
Boot/Loader ─▶ Main Menu ─┬─▶ Endless Game ─▶ (Pause) ─▶ Game Over ─▶ Play again / Menu
                          │                        └─▶ Second-chance offer (rewarded)
                          ├─▶ Voyage: Reef Map ─▶ Level Intro ─▶ Level Game ─▶ Level Result (win/lose)
                          │                                            └─▶ Tile Tutorial (first time a tile appears)
                          ├─▶ Daily Tide (later)
                          ├─▶ Shop (boosters, themes)
                          └─▶ Settings (sound, music, palette, colour-blind, reduced motion, low power, reset progress)
```

- As built (T2.16): on a fresh install (no games played, `tutorialDone` false), the first run starts on `app/tutorial.ts` `FIRST_RUN`. The bottom row is full except a 2-cell gap, and slot 0 holds a horizontal domino, so the first move clears a line. A text-free ghost hand (`ui/components/Hint.ts`, SVG plus a CSS loop) drags from that piece to the release point. `input/DragController.ts` `releasePoint()` computes it, including the touch lift on coarse pointers, and the dev hook shares it. The hand hides while paused or on the menu. The first pick-up sets `tutorialDone` in the save, so it never returns. A reload before the first move keeps it.
- As built (T2.13): `ui/screens/SettingsScreen.ts` is driven by a `SettingsModel` from the App:
  - Every change goes through `App.applySettings`, which writes the save and re-applies the audio buses at once.
  - Sound and music are each a switch plus a volume slider. Haptics shows only where `navigator.vibrate` exists. The palette choice shows with more than one palette.
  - Reduce motion shows the effective value (the system preference while the setting is "auto"). Toggling it makes it explicit.
  - Reset progress asks twice. `SaveStore.reset()` restores defaults but keeps `installedAt` and the ad counters, so a reset can't dodge the ad rules. It then returns to the menu with a fresh run.
  - The footer shows `v<version> · <short SHA>` (Vite `define`), links `privacy.html` (in `public/`), and toggles the credits.
  - Settings opens from the menu and from the pause dialog, and Back returns to either.
- As built (T2.12):
  - The game boots into `ui/screens/MenuScreen.ts`: a CSS title with rippling letters, Play/Continue with the best score under it, Voyage (disabled, "soon") and Settings. It sits over the live canvas, where the board and caustics show through softened and the tray is hidden.
  - `App.play()` / `App.showMenu()` switch screens. Input and the run clock only run in the game. The ads' run start and `runStart` fire when a run is first entered, not at boot.
  - Pause → Menu keeps the run for Continue. Game Over → Menu passes the break point, then leaves a fresh run waiting behind the menu.
  - The Router no longer unmounts a screen that became current again during its fade-out.
- Screens are classes with `mount(root)` / `unmount()` and receive services through their constructor. A small `Router` in `app/` switches screens with a 200 ms cross-fade.
- **HUD (Endless):** score (animated count-up), best score, streak chip (`×1.5`, pulses when it rises, dims when the current set has no clear yet), and a pause button.
- **HUD (Voyage):** goal counters with icons, moves left (turns coral when ≤ 3), booster bar, and pause.
- **Game Over:** shown after the board "fades to sand" (§11). It shows the score, the best score with a "New best!" ribbon, the second-chance button (if an ad is ready and it's unused), **Play again** (primary, large) and Menu.
- Text is kept minimal, and all strings live in `ui/strings.ts`, so localisation can be added later.

---

## 11. Game feel specification

All values are starting points in `render/feel.ts` and tuned during playtests.

| Moment | Visual | Audio | Haptic (Android) |
|---|---|---|---|
| Pick up | scale 0.55→1.0, 90 ms cubicOut; tray slot dims | soft "lift" tick (quiet) | — |
| Drag over valid spot | ghost fades in 60 ms; would-clear lines glow (pulse 1.2 s sine) | — | — |
| Drop valid | piece snaps to cells 70 ms quadOut; each cell squash 1.0→1.08→1.0 over 140 ms | glass "clink", pitch by colour (6 semitone steps), ±3% random detune | light tap |
| Drop invalid | returns to tray 200 ms backOut | soft "bloop" (very quiet) | — |
| Line clear | cells lift (offsetY −6 px) + fade out; stagger 22 ms per cell outward from the placed piece; a wave band sweeps across each cleared line (280 ms); 6–10 bubbles + sparkles per line | wave "whoosh"; pitch +1 semitone per streak level (max +8) | medium tap |
| 2 / 3 / 4+ lines | callout pops (scale 0.6→1.12→1.0, 220 ms; hold 600 ms; fade 300 ms); particles × lines | layered chimes (2, 3 or 4 notes, rising arpeggio) | 3+: heavy tap |
| 3+ lines | screen shake: amplitude 3 px (3 lines) or 5 px (4+), 180 ms, decaying | — | — |
| Clean board | full-board shimmer sweep + "Crystal Clear!" | chime flourish | heavy + light |
| Score gain | floating "+N" at the clear centroid (rise 30 px, 700 ms); HUD score counts up over 400 ms | — | — |
| Streak up | streak chip bounces; colour warms as it rises | subtle rising tone | — |
| New tray dealt | 3 pieces slide up from below and fade in, stagger 60 ms, 220 ms each | soft "shuffle" | — |
| Game over | remaining cells fade to sand one by one in random order over 700 ms; board desaturates slightly; then the panel slides up 250 ms | gentle descending chime; ambient ducks −6 dB | — |
| Button press | scale 0.96 on press, back on release | UI tick | — |

As built (T2.07): every non-audio row of the table reads its values from `feel.ts`:
- Deal-in blocks pick-up (through the drag host's `slotAt`) until the tray has dealt in, but never longer than `FEEL.deal.maxInputLock` (250 ms). A resumed tray has no deal-in and no lock.
- Pickup draws a soft shadow sprite under the lifted piece.
- A drag drop snaps the placed cells in from where the piece was released (`DropOrigin`), then squashes each cell. Placements without a drag (tests, the dev hook) only squash.
- The ghost fades in when it first appears, not on every cell change.
- Game over fades the cells to sand one by one in random order, and desaturates the board panel with a `saturation` composite clipped to the panel shape.
- "Crystal Clear!" adds a diagonal shimmer over the whole board.
- The CSS-driven values (panel slide, button press scale) are passed as CSS variables.

As built (T2.04): callouts and "+N" are DOM (`ui/components/FxLayer.ts`) with CSS animations. Their timings come from `FEEL.callout` / `FEEL.score`, which the App passes by reference, so the UI layer doesn't import `render/`. They reach the CSS as variables. When a placement has two callouts (a tier callout and "Crystal Clear!"), the second starts as the first begins to fade. The HUD score counts up with an eased rAF counter that retargets on new points and always ends on the exact value. The streak chip bounces on a rise, warms through `data-level` 1–6, dims while at risk (`!setHadClear`) and shrinks away on reset. Best glows once per run when a previous best (> 0) is beaten.

**Reduced motion** turns off screen shake and caustics, replaces staggered cell animations with a 150 ms fade, and cuts particle counts to 25%.

As built (T2.15), `App.applyMotionAndPower()` applies both modes live from Settings and persists them:
- **Reduced motion** (the setting, or `prefers-reduced-motion` while it's "auto", including live changes): no shake, and the caustics stay but don't drift, so the ticker stops redrawing. Clears, deal-in and game over become one 150 ms fade. There's no wave sweep, shimmer or squash (the drop snap stays), particles run at 25%, and a `reduced-motion` class drops the CSS wobble, bob, bump and slide.
- **Low power:** no caustics, particles at 50%, DPR capped at 1.5 (`Renderer.setMaxDpr`), and animation-only frames capped at 30 fps (`Renderer.maxFps`; input redraws are never held back).
- **Watchdog:** it counts only newly drawn frames, so idle time never looks slow. If frames stay > 20 ms for 3 s, low power switches on (once per session), a one-time toast explains it, and `perfFallback` / `perf_fallback` records `lowPower`.

---

## 12. Audio

- **Engine:** the Web Audio API. One `AudioContext`, created or resumed on the first user gesture (browser autoplay rules). Buses: `master → music`, `master → sfx`. Volumes and mutes are persisted.
- **Formats:** `.mp3` for broad support (WebView, Safari). Short SFX are ~20–60 KB each, and the ambient loop is ≤ 400 KB (mono, 64–96 kbps, seamless loop).
- **Loading:** SFX are decoded lazily after the first interaction. The game is fully playable before audio finishes loading.
- **Sources:** prototype SFX can be generated (for example jsfxr or ZzFX-style synthesis) or taken from CC0 libraries. Record the licence of every asset in `assets/CREDITS.md`.
- **SFX list:** lift, clink (1 sample, pitched per colour), bloop (invalid), whoosh (clear), chime set (3 notes), flourish (clean board), deal shuffle, game over, UI tick, star earned (×3 pitches), coin (shells), booster use (×4), bubble pop, coral crack, coral break, pearl collect.
- **Lifecycle:** suspend on `visibilitychange` hidden and while an ad is showing, resume after. On Android, also on the app pause/resume events.
- **Defaults:** SFX on at 100%, music on at 35% (README: "sound on, music low").
- **As built (T2.09):** every SFX is **generated in code** (`services/audio/synth.ts`: sine partials and filtered noise, seeded, normalised, 5 ms de-click), so the audio download is 0 KB (no mp3 and no encoder needed). Licences are in `assets/CREDITS.md`. `app/sounds.ts` maps events to sounds:
  - The clink is pitched per colour on a pentatonic set `[0, 2, 4, 7, 9, 12]`, with ±3% detune.
  - The whoosh rises +1 semitone per streak level, up to +8.
  - 2 / 3 / 4+ lines play a delayed chime arpeggio of 2–4 notes.
  - A clean board plays the flourish; a streak rise plays a soft high chime.
  - Other sounds: shuffle on deal and new run, lift on pick-up, bloop on a cancelled drop, the game-over chime, and a tick on any UI button.
  - Volumes are in `SOUND.volumes`.
- **As built (T2.10):** the ambient bed is a generated 60 s loop at 16 kHz: two-pole low-passed noise with slow "laps", plus a breathing low pad. Every modulation and pad frequency completes a whole number of cycles per loop, and the noise tail is cross-faded into the head, so the loop point has no click (tested). It's generated in 128k-sample slices (≤ 15 ms each) with a task break between them, so it never blocks the page. Recursive oscillators replace per-sample `sin`/`exp`, making all SFX ~20× cheaper. The loop fades in over 2 s once audio unlocks, ducks −6 dB when a run ends, and comes back up on a new run or a second chance. Ads and a hidden page silence it through `suspend`. The Music toggle and volume are the music bus (UI in T2.13).
- **As built (T2.08):** `services/audio/AudioEngine.ts`. The context is created on the first pointerdown/keydown, and nothing exists before that, so there are no autoplay warnings. The gesture listener stays attached, so a later tap re-resumes a context that iOS suspended. Sounds are `{ url }` (fetch + decode) or `{ synth(rate) }` (generated samples). They load after unlock, and a sound that isn't ready is skipped. Voice limits: 3 per sound and 16 in total, stopping the oldest. The bus level is volume × mute × duck (dB). Volume and mute (`sfxMuted` / `musicMuted`) persist in `SaveStore.settings`. The App suspends audio while the page is hidden or an ad is showing. Every Web Audio call is wrapped, so failures go to analytics `error` and never throw.

---

## 13. Services

### 13.1 Storage (`services/storage/`)
- `StorageBackend` interface: `get(key) / set(key, value) / remove(key)`, async so it can support Capacitor Preferences.
- Backends: `LocalStorageBackend`, which falls back to `MemoryBackend` when `localStorage` throws (this happens in some sandboxed portal iframes), and `CapacitorPreferencesBackend` for Android.
- `SaveStore` keeps one JSON document under the key `tidepool.save`:
  ```ts
  interface SaveV1 {
    version: 1;
    settings: { sfx: number; music: number; palette: string; colorBlind: boolean; reducedMotion: boolean; lowPower: boolean };
    stats: { bestScore: number; gamesPlayed: number; linesCleared: number; tidalWaves: number; totalPlaytimeMs: number };
    endlessRun: EndlessState | null;
    voyage: { levels: Record<string, { stars: number; bestMovesLeft: number }>; seenTutorials: string[] };
    wallet: { shells: number };
    boosters: Record<BoosterId, number>;
    cosmetics: { owned: string[]; active: { palette: string; board: string; clearFx: string } };
    ads: { sessionCount: number; lastSessionStart: number; gameplayMsSinceInterstitial: number; lastRewardedAt: number; daily: { date: string; freeBoosterAds: number; dailyBonusClaimed: boolean } };
    daily: { lastLoginDate: string; loginStreak: number; lastTideDate?: string; tideStreak: number };
    achievements: Record<string, number /* unlock timestamp */>;
  }
  ```
- `migrate(raw) → SaveLatest` runs step migrations (`v1→v2`, …). There is a unit test for every migration.
- Writes are debounced (500 ms), and a flush is forced on `visibilitychange` hidden and `pagehide`.
- Corrupt JSON: back it up under `tidepool.save.corrupt`, start fresh, and log to analytics.

### 13.2 Ads (`services/ads/`)
- `AdService`: exactly the interface in README §8.3.
- `AdManager` (pure policy plus orchestration, unit-tested with fake clocks):
  - `canShowInterstitial(ctx)`: implements D18 and D19.
  - `requestBreak(placement)`: called at break points. It checks the policy, calls `showInterstitial`, and **always resolves**. A failure or timeout (8 s) never blocks the flow.
  - `rewarded(placement)`: returns `Promise<boolean>`, applies the per-day limits (free booster: 3/day; daily bonus: 1/day; second chance: 1/run; double reward: 1 per level result), and pauses audio and the game loop during the ad.
  - `isRewardedAvailable(placement)`: checks readiness and limits. The UI hides reward buttons when it returns false.
  - Forwards `gameplayStart/Stop` at run start, pause, resume, game over and ad show.
  - Gameplay time only counts between `gameplayStart` and `gameplayStop`, and stops while the page is hidden. A new session (D18) resets it.
  - A failed or timed-out interstitial still resets the gameplay timer, so a broken provider isn't retried at every break point.
  - A rewarded ad has a 90 s safety timeout (it resolves as not earned), and provider `init` has 8 s. If init fails, ads stay off for the session. A skipped or failed rewarded ad doesn't use up a limit.
  - The daily limits reset on the local calendar day. The counters live in `SaveStore.ads`. They were added to save v1 without a version bump, because the defaults fill them in.
- Implementations are chosen by build target through **dynamic import**, so unused SDKs are not bundled (§20).

### 13.3 Analytics (`services/analytics/`)
- `Analytics.track(event, props)`, `Analytics.setUserProp()`. Implementations: `NoopAnalytics` (default), `ConsoleAnalytics` (dev), and later a real backend (candidates: GameAnalytics, or Firebase on Android). **The provider is an open question (§22).**
- Event list (README §13.3):

| Event | Props |
|---|---|
| `session_start` | sessionIndex, daysSinceInstall, platform |
| `session_end` | durationMs, runs |
| `run_start` | mode, seed |
| `run_end` | mode, score, placed, linesCleared, fullnessAtEnd, durationMs, secondChanceUsed |
| `level_start` / `level_end` | levelId, attempt, result, movesLeft, stars, boostersUsed |
| `ad_rewarded` | placement, result (earned / skipped / failed) |
| `ad_interstitial` | placement, result |
| `booster_used` | booster, mode |
| `shells` | source/sink, amount |
| `tutorial_step` | tile/step |
| `error` | message, where |
| `perf_fallback` | feature, frameMs |
| `placement` | mode, shape, lines, points, fullness (after the move) |
| `invalid_drop` | mode, fullness |
| `first_clear` | mode, playMs (play time, pauses excluded), placed |

- The event map is typed (`services/analytics/Analytics.ts`), and all instrumentation lives in `app/analytics.ts` (`GameAnalytics`). Sessions come from `AdManager` (D18). A session ends on `pagehide`, or when the player comes back after 30+ minutes (then the end is dated when they left).
- `run_end` is sent when a run is closed out: when the next run replaces it, or on boot if the saved run had already ended. It is not sent at game over, because a second chance can still continue the run. `durationMs` is wall time in the page, and it is carried across reloads in `SaveStore.endlessRunMs`.
- Errors are capped at 20 per session.
- `placement`, `invalid_drop` and `first_clear` were added for playtests (T2.18). `placement` fires on every move, so a real backend may need to sample it. `invalid_drop` counts only pieces released over the board where they don't fit (the drag's `onCancel` reports this). A piece put back on the tray, or a drag cancelled by blur or a layout change, is not counted.
- As built (T2.18 prep), **playtest mode** (`app/playtest.ts`) is for human playtests on the normal web build:
  - `?playtest=1` turns it on for the device, and `?playtest=0` turns it off.
  - While it's on, analytics go to `LocalLogAnalytics`, which writes every event to localStorage (`tidepool.playtestLog`, capped at 5000 entries). Settings shows **Export playtest log**, which downloads the log as JSON. The first entry of each page load is `page_open`, with the build, the variant and the device.
  - `?playtest=1` starts from the default variant (apart from switches in the same URL). Variant switches are remembered until changed: `?magnet=0|1` (magnet assist, by setting `DRAG.magnetRadius` to 0) and `?l4=0|1` (4-cell L/J shapes, stored in the run as `EndlessState.includeL4`, so resumed runs keep it).
  - `?clearlog=1` empties the log once.
  - Outside playtest mode, every switch is ignored.
  - The protocol is in `docs/playtests/round1-plan.md`.
- Retention (D1/D7) is computed by the backend from `session_start`. The client just sends `daysSinceInstall` (the install date is stored on first launch).

### 13.4 Platform (`services/platform/`)
- `haptics.impact(light|medium|heavy)`: `navigator.vibrate` on the web (Android Chrome only; a very short pulse), and `@capacitor/haptics` on Android. Off when Settings → Haptics is off.
  - As built (T2.05): `services/platform/haptics.ts` has `WebHaptics(enabled)` (10 / 20 / 35 ms) and `NoHaptics`. Each move gets one impact, the strongest that applies: light for a placement, medium for a clear, heavy for 3+ lines or a clean board. Screen shake is `render/shake.ts`, a scene child. `GameScene.add(view, { shake: true })` translates the board, ghost, clear FX and tray. Particles take the offset in their own transform. The dragged piece and the DOM HUD never shake, and layout/hit-testing is untouched. Reduced motion (the setting, or the system preference when it's "auto") disables the shake.
- `lifecycle.onPause/onResume`: `visibilitychange` on the web, `@capacitor/app` on Android.
- `backButton` (Android): close the modal, pause the game, go back to the menu, or exit.
- `target`: `'web' | 'crazygames' | 'poki' | 'itch' | 'android'`.

---

## 14. Voyage mode

### 14.1 Level format (`src/levels/<area>/<nnn>.json`)
```jsonc
{
  "id": "shallows-003",
  "area": "shallows",
  "index": 3,
  "moves": 18,
  "goals": [ { "type": "pearls", "count": 3 } ],   // pearls | coral | bubbles | score
  "stars": [4, 8],                                  // movesLeft needed for 2★ and 3★
  "board": [                                        // 8 strings × 8 chars, row 0 at top
    "........",
    "..#P#...",
    "........",
    "...CC...",
    "........",
    ".B....B.",
    "##.####.",
    "........"
  ],
  "colors": null,                                   // optional 8×8 digit grid to pin glass colours
  "generator": { "families": null, "weights": null }, // optional overrides
  "tutorial": null                                  // tile id to introduce, e.g. "coral"
}
```
Legend: `.` empty, `#` glass (seeded random colour), `1`–`6` glass of a specific colour, `P` glass with a pearl, `C` coral (2 hp), `c` cracked coral (1 hp), `B` bubble over an empty cell, `U` urchin (later), `F` frozen glass (later).

- `core/level.ts` parses and validates levels (exactly 8×8, known chars, goals achievable: for example the pearl count ≤ the pearls on the board, and `stars` ascending and < `moves`).
- `tools/levels/validate.ts` runs in CI over every level file and also runs the bot to check that each level is **solvable** in ≥ X% of seeds within the move limit. The report is used to tune difficulty.
- Levels are bundled with `import.meta.glob('./levels/**/*.json')`, so adding a JSON file needs no code change.
- As built (T4.01):
  - `core/level.ts` has `parseLevel(json): Level | ValidationError[]`. It's hand-written and strict, and reports every problem at once as `{path, message}`, e.g. `board[3]: row 3 has 9 chars, needs 8`, `goals[0].count: goal pearls=4 but the board has 3 pearls`.
  - It checks unknown fields (typos), the id as `<area>-NNN` matching area and index, 8×8 known characters, no already-full rows or columns (glass, pearl, coral, urchin and frozen count as filled; bubble doesn't), known unique goals with counts the board's tiles can reach, stars `1 ≤ 2★ < 3★ < moves`, colour pins only on `#`/`P` cells, the generator overrides' shape, and the tutorial tile.
  - `levelBoard()` gives the core `Board`. Unpinned glass colours are seeded from `level:<id>`, and tiles come out as `TileState`s (`pearl`, `coral` with hp 2/1, `bubble`, `urchin`, `frozen`); their behaviour is T4.02.
  - `app/levels.ts` bundles `src/levels/**/*.json` (excluding the schema) and orders them by area (reef-map order) and index. It leaves out and reports invalid files and duplicate ids.
  - `src/levels/level.schema.json` documents the format for editors, and `shallows-001` is the first level.

### 14.2 Tile mechanics
The tile logic lives in `core/tiles.ts` as hooks called by `clearLines` and `place`:

| Tile | Blocks placement? | Counts as filled for lines? | On line clear | On piece placed on it |
|---|---|---|---|---|
| Pearl | yes (the cell is filled) | yes | cell clears, **pearl collected** | n/a |
| Coral (2 hp) | yes | yes | hp −1; at 0 it breaks → empty cell; cracked visual at 1 | n/a |
| Bubble | **no** (it floats over an empty cell) | no | pops if its cell is in a cleared line | pops; the piece fills the cell normally |
| Urchin (later) | yes | yes | clears the 3×3 around it (D17) | n/a |
| Frozen (later) | yes | yes | thaws into normal glass, stays (D16) | n/a |

Each tile effect emits an event (`pearlCollected`, `coralCracked`, `coralBroken`, `bubblePopped`, …) for goals, visuals and audio.

### 14.3 VoyageGame
`VoyageGame` reuses board, generator and scoring, and adds: `movesLeft`, `goals` progress, win/lose checks after each placement (win is checked **before** lose, so a win on the last move counts), and the star calculation (D13).

Win → Level Result: stars animate in one by one. Shells are awarded (§15) with a "Double reward" rewarded option, and then Next level.
Lose → options: Retry (a new attempt seed) or Map. A possible "+5 moves" rewarded continue is an open question (§22).

### 14.4 Reef map
- A vertical scrolling map of nodes connected by a path. Each area has its own background tint (Shallows sandy, Coral Garden pink, Kelp Forest green, Sunken Ship deep blue).
- A node shows the level number and 0–3 stars. The next unlocked level pulses. Locked levels are dimmed.
- Unlock rule: level *n+1* unlocks when level *n* is completed (≥ 1 star). An area unlocks when the previous area's last level is completed.
- A DOM-based scroll view (native scrolling, cheap), with SVG for the path.

### 14.5 Area / tile introduction
| Area | Levels | New tile | Tutorial |
|---|---|---|---|
| Shallows | 1–20 | pearls (from level 1); score goal | Pearl |
| Coral Garden | 21–40 | coral | Coral |
| Kelp Forest | 41–60 (later) | bubbles | Bubble |
| Sunken Ship | 61–80 (later) | urchin, frozen | Urchin, Frozen |

Milestone 4 builds the bubble tile, because it's cheap and ready for Kelp Forest, but ships only 40 levels (Shallows and Coral Garden).

### 14.6 Tile tutorial
The first time a level has `"tutorial": "<tile>"`, a one-screen overlay shows an animated mini-board (3×3 or 4×4, rendered with the same sprites) looping the mechanic, one short line of text, and "Got it". The seen state is stored in `voyage.seenTutorials`.

---

## 15. Progression, economy & boosters

### 15.1 Shells (starting values, `core/economy.ts`)
| Source | Shells |
|---|---|
| Level complete | 10 + 5 per star (first completion); 3 on replays |
| Endless run end | 1 per 200 points, capped at 50 per run |
| Daily login | 20, +5 per consecutive day, capped at 50 |
| Rewarded: double reward | ×2 the level reward |
| Rewarded: daily bonus | +30 |
| Achievements | 25–100 each |

| Sink | Cost |
|---|---|
| Undo | 60 |
| Rotate | 60 |
| Reshuffle | 90 |
| Wave | 150 |
| Palette theme | 500 |
| Board background | 400 |
| Clear effect | 400 |

The economy is not balanced by guesswork. The simulator and early analytics tune it. It is **no pay-to-win**, and every level must be beatable with 0 boosters (the level validator checks this).

### 15.2 Boosters (`core/boosters.ts`)
| Booster | Logic | Notes |
|---|---|---|
| Undo | Restores the snapshot taken before the last placement (board, tray, score, streak, rng, goals, moves). One level deep. | Not available after game over; it doesn't cancel a second chance. |
| Rotate | Choose a tray slot and replace its shape with `shape.rotateCW`. | The button is disabled when every tray shape is rotation-symmetric. |
| Reshuffle | Deal a fresh tray (normal generator, so fairness holds). | Does not end the tray-set and does not reset the streak. |
| Wave | Choose a row or column and clear it (tile effects apply; e.g. pearls are collected). | Scores 10 points per cell, doesn't count for streak or callouts. |

Boosters come from shells, level rewards (areas give 1 of each at start), the daily login (on some days), and the rewarded "free booster" (3/day). Using a booster costs no move.

### 15.3 Achievements (later)
Data-driven (`core/achievements.ts`: id, condition over stats/events, reward). Examples: First Splash, First Tidal Wave, 100 / 1 000 lines, Crystal Clear, All stars in Shallows, 7-day tide streak.

---

## 16. Milestones & task index

The IDs map one-to-one to GitHub issues (the issue title starts with the ID). Sizes: **S** ≤ ½ day, **M** 1–2 days, **L** 3–5 days.

### Milestone 1: Playable core (Endless)
| ID | Task | Size | Depends on |
|---|---|---|---|
| [T1.01](https://github.com/satautiv/Tidepool/issues/1) | Project scaffold: Vite + TS strict + Vitest + ESLint/Prettier + folder layout | S | — |
| [T1.02](https://github.com/satautiv/Tidepool/issues/2) | CI: GitHub Actions (lint, typecheck, test, build) | S | T1.01 |
| [T1.03](https://github.com/satautiv/Tidepool/issues/3) | Seedable RNG (`core/rng.ts`) | S | T1.01 |
| [T1.04](https://github.com/satautiv/Tidepool/issues/4) | Shape catalogue (`core/shapes.ts`) | S | T1.01 |
| [T1.05](https://github.com/satautiv/Tidepool/issues/5) | Board model: placement & fit queries | M | T1.04 |
| [T1.06](https://github.com/satautiv/Tidepool/issues/6) | Line detection & clearing | S | T1.05 |
| [T1.07](https://github.com/satautiv/Tidepool/issues/7) | Scoring & streak (`core/scoring.ts`) | S | T1.06 |
| [T1.08](https://github.com/satautiv/Tidepool/issues/8) | Fair seedable piece generator | M | T1.03, T1.05 |
| [T1.09](https://github.com/satautiv/Tidepool/issues/9) | EndlessGame session: tray, deal, place, game over, events, snapshot | M | T1.06, T1.07, T1.08 |
| [T1.10](https://github.com/satautiv/Tidepool/issues/10) | Headless simulation bot & generator metrics | M | T1.09 |
| [T1.11](https://github.com/satautiv/Tidepool/issues/11) | Renderer foundation: canvas, DPR, loop, dirty rendering | M | T1.01 |
| [T1.12](https://github.com/satautiv/Tidepool/issues/12) | Layout module (pure, portrait/landscape) | S | T1.01 |
| [T1.13](https://github.com/satautiv/Tidepool/issues/13) | Code-drawn visuals: sand board, sea-glass sprites, palette | M | T1.11, T1.12 |
| [T1.14](https://github.com/satautiv/Tidepool/issues/14) | Tray rendering & deal-in | S | T1.13, T1.09 |
| [T1.15](https://github.com/satautiv/Tidepool/issues/15) | Drag & drop controller (mouse + touch, lift above finger) | M | T1.12, T1.14 |
| [T1.16](https://github.com/satautiv/Tidepool/issues/16) | Ghost preview, would-clear highlight, magnet assist | S | T1.15 |
| [T1.17](https://github.com/satautiv/Tidepool/issues/17) | Basic placement/clear/return animations (tween system v1) | M | T1.15 |
| [T1.18](https://github.com/satautiv/Tidepool/issues/18) | App shell, screen router, DOM helper, HUD (score/best/streak) | M | T1.09 |
| [T1.19](https://github.com/satautiv/Tidepool/issues/19) | Game over detection UI & restart | S | T1.18 |
| [T1.20](https://github.com/satautiv/Tidepool/issues/20) | Storage service & versioned SaveStore | M | T1.01 |
| [T1.21](https://github.com/satautiv/Tidepool/issues/21) | High score persistence & resume in-progress run | S | T1.20, T1.09 |
| [T1.22](https://github.com/satautiv/Tidepool/issues/22) | AdService interface, NoAdsService, AdManager policy | M | T1.20 |
| [T1.23](https://github.com/satautiv/Tidepool/issues/23) | Placeholder ad moments: second chance & break points | S | T1.22, T1.19 |
| [T1.24](https://github.com/satautiv/Tidepool/issues/24) | Analytics interface, Noop/Console impl, core events | S | T1.18 |
| [T1.25](https://github.com/satautiv/Tidepool/issues/25) | Lifecycle: pause on hidden, save flush, pause menu | S | T1.18, T1.20 |
| [T1.26](https://github.com/satautiv/Tidepool/issues/26) | Playwright E2E smoke test | S | T1.19 |

### Milestone 2: Feel & polish
| ID | Task | Size | Depends on |
|---|---|---|---|
| [T2.01](https://github.com/satautiv/Tidepool/issues/27) | Tween system v2 & feel config | S | T1.17 |
| [T2.02](https://github.com/satautiv/Tidepool/issues/28) | Pooled particle system | M | T1.11 |
| [T2.03](https://github.com/satautiv/Tidepool/issues/29) | Line clear effect (lift/dissolve, wave sweep, bubbles, sparkles) | M | T2.01, T2.02 |
| [T2.04](https://github.com/satautiv/Tidepool/issues/30) | Callouts, floating points, score count-up, streak chip | M | T2.01 |
| [T2.05](https://github.com/satautiv/Tidepool/issues/31) | Screen shake & haptics service | S | T2.03 |
| [T2.06](https://github.com/satautiv/Tidepool/issues/32) | Sand texture & water caustics background | M | T1.13 |
| [T2.07](https://github.com/satautiv/Tidepool/issues/33) | Deal-in, pickup, drop squash, game-over fade polish | S | T2.01 |
| [T2.08](https://github.com/satautiv/Tidepool/issues/34) | Audio engine (Web Audio, buses, unlock, lifecycle) | M | T1.25 |
| [T2.09](https://github.com/satautiv/Tidepool/issues/35) | SFX set + hookup to game events | M | T2.08 |
| [T2.10](https://github.com/satautiv/Tidepool/issues/36) | Ambient water loop / music | S | T2.08 |
| [T2.11](https://github.com/satautiv/Tidepool/issues/37) | Responsive layout final pass (portrait/landscape/safe areas) | M | T1.12 |
| [T2.12](https://github.com/satautiv/Tidepool/issues/38) | Main menu screen | S | T1.18 |
| [T2.13](https://github.com/satautiv/Tidepool/issues/39) | Settings screen | M | T2.08, T1.20 |
| [T2.14](https://github.com/satautiv/Tidepool/issues/40) | Colour-blind palette & patterns | S | T1.13 |
| [T2.15](https://github.com/satautiv/Tidepool/issues/41) | Reduced motion & low-power modes | S | T2.03, T2.06 |
| [T2.16](https://github.com/satautiv/Tidepool/issues/42) | First-time hint (animated hand, no text) | S | T1.16 |
| [T2.17](https://github.com/satautiv/Tidepool/issues/43) | Keyboard controls (desktop / a11y) | M | T1.16 |
| [T2.18](https://github.com/satautiv/Tidepool/issues/44) | Human playtest round #1 & tuning | M | all M2 |

### Milestone 3: Web release
| ID | Task | Size | Depends on |
|---|---|---|---|
| [T3.01](https://github.com/satautiv/Tidepool/issues/45) | Decide first portal & release scope (open questions) | S | — |
| [T3.02](https://github.com/satautiv/Tidepool/issues/46) | Name availability check & final name | S | — |
| [T3.03](https://github.com/satautiv/Tidepool/issues/47) | Build targets & per-target config (dynamic ad service import) | M | T1.22 |
| [T3.04](https://github.com/satautiv/Tidepool/issues/48) | Boot loader / preloader & asset pipeline | S | T3.03 |
| [T3.05](https://github.com/satautiv/Tidepool/issues/49) | CrazyGames SDK integration (`CrazyGamesAdService`) | M | T3.03 |
| [T3.06](https://github.com/satautiv/Tidepool/issues/50) | Poki SDK integration (`PokiAdService`) | M | T3.03 |
| [T3.07](https://github.com/satautiv/Tidepool/issues/51) | Wire rewarded & interstitial placements (Endless) | S | T3.05 or T3.06 |
| [T3.08](https://github.com/satautiv/Tidepool/issues/52) | PWA / offline for standalone web build | S | T3.03 |
| [T3.09](https://github.com/satautiv/Tidepool/issues/53) | Performance & load-time pass (bundle budget in CI) | M | T3.04 |
| [T3.10](https://github.com/satautiv/Tidepool/issues/54) | Cross-browser / device QA matrix | M | T3.09 |
| [T3.11](https://github.com/satautiv/Tidepool/issues/55) | Deploy: GitHub Pages / personal site + itch.io (Pages: done in T2.18 prep, `.github/workflows/pages.yml`) | S | T3.03 |
| [T3.12](https://github.com/satautiv/Tidepool/issues/56) | Marketing assets: icon, thumbnails, screenshots, trailer, description | M | T2.18 |
| [T3.13](https://github.com/satautiv/Tidepool/issues/57) | Portal submission | S | T3.10, T3.12 |
| [T3.14](https://github.com/satautiv/Tidepool/issues/58) | Analytics backend selection & integration | M | T1.24 |

### Milestone 4: Voyage mode
| ID | Task | Size | Depends on |
|---|---|---|---|
| [T4.01](https://github.com/satautiv/Tidepool/issues/59) | Level JSON format, parser & validator | M | T1.05 |
| [T4.02](https://github.com/satautiv/Tidepool/issues/60) | Special tile engine (tile layer, hooks, events) | M | T1.06 |
| [T4.03](https://github.com/satautiv/Tidepool/issues/61) | Pearl tile | S | T4.02 |
| [T4.04](https://github.com/satautiv/Tidepool/issues/62) | Coral tile | S | T4.02 |
| [T4.05](https://github.com/satautiv/Tidepool/issues/63) | Bubble tile | S | T4.02 |
| [T4.06](https://github.com/satautiv/Tidepool/issues/64) | VoyageGame: goals, move limit, win/lose, stars | M | T4.01, T4.03 |
| [T4.07](https://github.com/satautiv/Tidepool/issues/65) | Voyage generator mode & seeding | S | T1.08, T4.06 |
| [T4.08](https://github.com/satautiv/Tidepool/issues/66) | Tile rendering & tile effects | M | T4.03–T4.05, T2.02 |
| [T4.09](https://github.com/satautiv/Tidepool/issues/67) | Voyage HUD (goals, moves) | S | T4.06 |
| [T4.10](https://github.com/satautiv/Tidepool/issues/68) | Level intro & result screens | M | T4.06 |
| [T4.11](https://github.com/satautiv/Tidepool/issues/69) | Reef map screen & unlocks | L | T4.06 |
| [T4.12](https://github.com/satautiv/Tidepool/issues/70) | Tile tutorial overlays | M | T4.08 |
| [T4.13](https://github.com/satautiv/Tidepool/issues/71) | Level tooling: validator CLI + bot solvability + dev level loader | M | T4.06, T1.10 |
| [T4.14](https://github.com/satautiv/Tidepool/issues/72) | Author Shallows levels 1–20 | L | T4.13 |
| [T4.15](https://github.com/satautiv/Tidepool/issues/73) | Author Coral Garden levels 21–40 | L | T4.14, T4.04 |
| [T4.16](https://github.com/satautiv/Tidepool/issues/74) | Shells wallet & earning rules | S | T1.20 |
| [T4.17](https://github.com/satautiv/Tidepool/issues/75) | Booster logic (undo, rotate, reshuffle, wave) | M | T1.09, T4.06 |
| [T4.18](https://github.com/satautiv/Tidepool/issues/76) | Booster bar UI, inventory & shop | M | T4.16, T4.17 |
| [T4.19](https://github.com/satautiv/Tidepool/issues/77) | Daily login reward | S | T4.16 |
| [T4.20](https://github.com/satautiv/Tidepool/issues/78) | Rewarded placements: free booster, double reward, daily bonus | S | T4.18, T4.19, T3.07 |

### Milestone 5: Android
| ID | Task | Size | Depends on |
|---|---|---|---|
| [T5.01](https://github.com/satautiv/Tidepool/issues/79) | Capacitor project setup & Android build | M | T3.03 |
| [T5.02](https://github.com/satautiv/Tidepool/issues/80) | Capacitor platform adapters (storage, lifecycle, back button, haptics) | M | T5.01 |
| [T5.03](https://github.com/satautiv/Tidepool/issues/81) | AdMob integration (`AdMobAdService`) + UMP consent | L | T5.01 |
| [T5.04](https://github.com/satautiv/Tidepool/issues/82) | App icon, splash screen, status bar, safe areas | S | T5.01 |
| [T5.05](https://github.com/satautiv/Tidepool/issues/83) | Offline verification & bundled assets | S | T5.01 |
| [T5.06](https://github.com/satautiv/Tidepool/issues/84) | Android performance pass on a low-end device | M | T5.02 |
| [T5.07](https://github.com/satautiv/Tidepool/issues/85) | Privacy policy & Play Data safety form | S | T5.03 |
| [T5.08](https://github.com/satautiv/Tidepool/issues/86) | Signing, AAB build pipeline, internal testing track | M | T5.01 |
| [T5.09](https://github.com/satautiv/Tidepool/issues/87) | Play Store listing & production release | M | T5.07, T5.08 |
| [T5.10](https://github.com/satautiv/Tidepool/issues/88) | Optional banner experiment (off by default) | S | T5.03 |

### Later
| ID | Task | Size |
|---|---|---|
| [T6.01](https://github.com/satautiv/Tidepool/issues/89) | Daily Tide mode | L |
| [T6.02](https://github.com/satautiv/Tidepool/issues/90) | Urchin bomb tile | M |
| [T6.03](https://github.com/satautiv/Tidepool/issues/91) | Frozen glass tile | M |
| [T6.04](https://github.com/satautiv/Tidepool/issues/92) | Kelp Forest & Sunken Ship areas (levels 41–80) | L |
| [T6.05](https://github.com/satautiv/Tidepool/issues/93) | Cosmetic themes (palettes, boards, clear effects) | L |
| [T6.06](https://github.com/satautiv/Tidepool/issues/94) | Achievements | M |
| [T6.07](https://github.com/satautiv/Tidepool/issues/95) | "Remove Ads" in-app purchase (Android) | M |
| [T6.08](https://github.com/satautiv/Tidepool/issues/96) | Cloud save | L |
| [T6.09](https://github.com/satautiv/Tidepool/issues/97) | Localisation | M |

---

## 17. Testing strategy

| Layer | Tooling | What |
|---|---|---|
| `core/` | Vitest + fast-check | Every rule in §5 and §14.2; property tests: placing never overlaps; after resolve no full lines remain; score never decreases; the generator always deals ≥ 1 fitting piece; serialize → deserialize round-trips; same seed ⇒ same game. |
| Generator / balance | `tools/sim` | The CI run asserts invariants; manual large runs tune weights. |
| `render/layout.ts` | Vitest | Rect math for the standard viewports. Nothing overlaps, and touch targets meet the minimum. |
| Services | Vitest | SaveStore migrations and corruption; AdManager policy with a fake clock; storage fallback. |
| UI / E2E | Playwright | Boot; place a piece via pointer events; game over via a forced seed (debug URL `?seed=&board=` in dev builds); settings persist after reload. |
| Levels | `tools/levels/validate` | Schema validity + bot solvability for every level file. |
| Manual | Checklist in T3.10 | Real devices, touch feel, audio, ad flows. |

Testing hooks: dev builds expose `window.__tidepool` (`src/app/devHook.ts`: `getState`, `setSeed`, `setBoard(rows, tray?)`, `forceGameOver`, `slotCenter`, `cellCenter`, and `dropPoint(slot, row, col, kind)`, which mirrors the drag offsets for mouse and touch). `main.ts` imports it only under `import.meta.env.DEV`, and CI runs `npm run check:dist` after the build to prove it isn't in `dist/`.

E2E (`e2e/`, `npm run test:e2e`) runs against the dev server in Chromium desktop and Pixel 7 emulation. On mobile, real touch input goes through CDP `Input.dispatchTouchEvent`. It runs as a separate CI job.

---

## 18. Performance budgets

| Metric | Budget |
|---|---|
| JS (gzipped), core game, excluding portal SDK | ≤ 150 KB |
| Initial download before playable (excluding audio) | ≤ 400 KB |
| Time to playable, mid-range Android, 4G (throttled) | < 3 s |
| Frame time during clears, mid-range Android | ≤ 16.7 ms (60 fps), and no frame over 33 ms |
| Idle CPU (no animations, caustics off) | no rAF drawing |
| Memory | no per-frame allocations in the render loop (pools and reused arrays) |

The CI size check fails the build when the JS budget is exceeded.

---

## 19. Accessibility

- Colour is never the only signal: special tiles use distinct icons, and the colour-blind mode adds per-colour glyph patterns and a palette with CVD-safe contrast (check it with a simulator for deuteranopia, protanopia and tritanopia).
- Touch targets ≥ 44 px. Text contrast ≥ 4.5:1 on menus.
- Reduced motion follows `prefers-reduced-motion` by default and can be overridden in Settings.
- Separate volume controls, and haptics can be turned off.
- Keyboard play on desktop (T2.17). DOM buttons are focusable with visible focus rings.

---

## 20. Build targets & release

| Target | Ads | Offline | Storage | Notes |
|---|---|---|---|---|
| `web` (dev / GitHub Pages / personal site) | NoAds | PWA | localStorage | Default |
| `itch` | NoAds | PWA off (itch iframe) | localStorage | Zip of `dist/` |
| `crazygames` | CrazyGames SDK | no SW | localStorage (or SDK data module if required) | The SDK script is injected by an HTML transform for this target only |
| `poki` | Poki SDK | no SW | localStorage | Same |
| `android` | AdMob | bundled | Capacitor Preferences | `npx cap sync android` after build |

- The target is selected by `vite build --mode <target>`, which reads `.env.<target>` (`VITE_TARGET`).
- `src/services/ads/index.ts` does `switch (import.meta.env.VITE_TARGET)` with a dynamic `import()`. Vite tree-shakes the unused branches.
- Versioning: semver in `package.json`. The Android `versionCode` is derived from it. The build info (version plus git short SHA) is shown in Settings.
- As built (T3.08): PWA targets (only `web`) get `tools/pwa-plugin.ts`, a small purpose-built Vite plugin rather than `vite-plugin-pwa`. It links `manifest.webmanifest` and the Apple touch icon, and emits `sw.js`, which precaches exactly this build's files plus the public ones. The cache is named after the build (version + a hash of the file names), and old caches are removed on activate. The worker is cache-first for same-origin GETs, and navigations fall back to the cached shell. `ignoreVary` is required, because module scripts carry an `Origin` header while the server sends `Vary: Origin`; without it, offline loads failed. Updates install in the background and only activate from the "New version ready — Update" toast (`app/pwa.ts`), so the game never reloads by surprise. Icons (192, 512, maskable 512, touch 180) are rendered by `tools/make-icons.ts`. Verified in Chromium: no installability errors, and after an offline reload the game loads and plays. Audio is generated on the device, so it works offline too.
- As built (T3.04): `index.html` inlines the loader's critical CSS, a title and a progress bar, so they paint before any script. `app/boot.ts` `BootLoader` moves the bar through the boot steps (script, save, ads, app) and forwards progress to ad services that implement the optional, duck-typed `loadingProgress` / `loadingFinished`, keeping `AdService` exactly as in §8.3. It fades out after the first frame. There are no web fonts (system stack), no images, and audio is generated after the first interaction, so there is nothing else to preload. Portal builds get a `preconnect` to the SDK origin. Measured on the production build under 4× CPU: the loader paints at ~0.4 s, and the game is playable at ~1.9 s on Fast 4G (9 Mbps, 150 ms RTT) and ~2.0 s on 1.6 Mbps. JS is 37.6 KB gzipped.
- As built (T3.03):
  - `src/config/targets.ts` has the runtime table (ads, pwa, storage, haptics, externalLinks). `.env.<target>` sets `VITE_TARGET`, and `npm run build:<target>` writes `dist/<target>`.
  - `services/ads/index.ts` branches on `import.meta.env.VITE_TARGET` with `if` tests. Vite folds that constant, so the other providers' `import()` calls are dead code and emit no chunk. A runtime switch on a variable would have bundled them all, and `check:targets` caught exactly that.
  - SDK `<script>` URLs live in the build-only `src/config/sdk.ts`, and a Vite `transformIndexHtml` plugin injects them per target.
  - The CrazyGames, Poki and AdMob services are placeholders whose `init()` rejects, so ads stay off until T3.05, T3.06 and T5.03.
  - Portals without external links hide the privacy link. Android storage and haptics still fall back to web until T5.02.
  - CI builds every target and runs `check:targets` and `check:dist`.
- **Portal SDK details change over time. Always follow the current official SDK docs** at integration time. Don't rely on the snippets remembered in this plan.

---

## 21. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Generator feels unfair or too easy | Core retention | Simulator metrics, playtests, all weights in config |
| Low-end Android frame drops (caustics, particles) | Feel pillar | Dirty rendering, sprite caching, low-power auto-fallback, budget checks on a real device |
| Portal SDK requirements (e.g. gameplay events, no external links, size limits) | Rejection | Read the requirements in T3.01, and keep the AdService abstraction thin |
| Ad policy violations (AdMob rewarded must be opt-in and clearly labelled) | Account ban | AdManager policy tests, labels on buttons, consent (UMP) |
| GDPR / consent for AdMob in the EEA | Legal | UMP SDK consent flow in T5.03 before ads initialise |
| localStorage blocked in iframes | Lost progress | Memory fallback + portal data APIs if available |
| Scope creep (Voyage content is time-consuming) | Delay | Web release with Endless first; level tooling before content |

---

## 22. Open questions & recommendations

| Question (README §16 + new) | Recommendation |
|---|---|
| Launch with Endless only, or wait for Voyage? | **Launch Endless on the web first** (Milestone 3), and ship Voyage as the first update. It gets real-player feedback on the core feel sooner and matches the roadmap order. |
| Which portal first? | Decide in T3.01 after reading each portal's current developer requirements and acceptance process. Pick the one with the most accessible submission path to start, and keep the other as a follow-up. |
| Final name | T3.02: search Google Play, CrazyGames, Poki and itch for "Tidepool". Also check domain and trademark conflicts. |
| Analytics provider | T3.14: must work in portal iframes and on Android, and respect consent. Candidates: GameAnalytics (web + Android), Firebase (Android). |
| Voyage continue on fail ("+5 moves" rewarded)? | Not in the README. Decide after the first Voyage playtest. If added, limit it to once per attempt. |
| 4-cell L/J shapes? | Off by default. Evaluate in playtest #1. |
