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

The palettes are data (`render/palettes.ts`). Colour-blind and cosmetic themes (Sunset, Moonlit, Arctic) are additional entries.

### 7.4 Animation system
- `tween.ts`: `tween(target, props, duration, easing, delay) → handle`, with an `onComplete` callback. Easings: linear, quadOut, cubicOut, backOut, elasticOut, sineInOut.
- The visual state (`BoardView`) keeps per-cell display properties: scale, alpha, offsetY and highlight. It animates towards the logical state.
- `particles.ts`: an object pool (≥ 512 particles, no allocations per frame) with position, velocity, gravity, life, size, rotation, colour and sprite type (bubble, sparkle, droplet).

### 7.5 Background & caustics
- The sand texture is generated once by procedural noise into an offscreen canvas and scaled to the board.
- Caustics: 2–3 layers of pre-rendered soft light blobs, drifting slowly with sine offsets and drawn in `lighter` / `screen` composite mode at low opacity, updated at ≤ 30 fps. They turn off automatically with **Reduced motion** or the **Low power** setting, or when the measured frame time is > 20 ms for 3 seconds.

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

---

## 9. Layout

`render/layout.ts` is a **pure function**: `computeLayout(viewportW, viewportH, safeAreaInsets) → Layout`. It is unit-tested for common sizes (360×640, 390×844, 768×1024, 1366×768, 1920×1080).

- **Portrait** (aspect ≤ 0.8): the HUD at the top (~12% of height), the board centred (width = min(92% of width, 60% of height)), and the tray below (height ≈ 0.45 × board). The 3 tray slots are evenly spaced.
- **Landscape** (aspect > 0.8): the board is centred-left (size = min(80% of height, 55% of width)), with the tray as a vertical column of 3 slots on the right and the HUD above the board or at top-left.
- Minimum touch target: 44 CSS px for every button. A tray slot is at least 2.2 × cellSize wide.
- Safe areas: CSS `env(safe-area-inset-*)` for the DOM. The same insets are passed into `computeLayout` for the canvas (important on Android with a notch).

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

**Reduced motion** turns off screen shake and caustics, replaces staggered cell animations with a 150 ms fade, and cuts particle counts to 25%.

---

## 12. Audio

- **Engine:** the Web Audio API. One `AudioContext`, created or resumed on the first user gesture (browser autoplay rules). Buses: `master → music`, `master → sfx`. Volumes and mutes are persisted.
- **Formats:** `.mp3` for broad support (WebView, Safari). Short SFX are ~20–60 KB each, and the ambient loop is ≤ 400 KB (mono, 64–96 kbps, seamless loop).
- **Loading:** SFX are decoded lazily after the first interaction. The game is fully playable before audio finishes loading.
- **Sources:** prototype SFX can be generated (for example jsfxr or ZzFX-style synthesis) or taken from CC0 libraries. Record the licence of every asset in `assets/CREDITS.md`.
- **SFX list:** lift, clink (1 sample, pitched per colour), bloop (invalid), whoosh (clear), chime set (3 notes), flourish (clean board), deal shuffle, game over, UI tick, star earned (×3 pitches), coin (shells), booster use (×4), bubble pop, coral crack, coral break, pearl collect.
- **Lifecycle:** suspend on `visibilitychange` hidden and while an ad is showing, resume after. On Android, also on the app pause/resume events.
- **Defaults:** SFX on at 100%, music on at 35% (README: "sound on, music low").

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

- Retention (D1/D7) is computed by the backend from `session_start`. The client just sends `daysSinceInstall` (the install date is stored on first launch).

### 13.4 Platform (`services/platform/`)
- `haptics.impact(light|medium|heavy)`: `navigator.vibrate` on the web (Android Chrome only; a very short pulse), and `@capacitor/haptics` on Android. Off when Settings → Haptics is off.
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
| [T3.11](https://github.com/satautiv/Tidepool/issues/55) | Deploy: GitHub Pages / personal site + itch.io | S | T3.03 |
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

Testing hooks: dev builds expose `window.__tidepool` (state dump, set board, set seed, force game over). It's stripped from production builds.

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
