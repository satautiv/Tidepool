# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Tidepool is a calm, drag-and-drop 8×8 block puzzle game. It targets the web first, then Android through Capacitor, and is ad-supported. The project is in early development: the scaffold exists, and the game is built issue by issue. `README.md` is the design and vision document. Read `README.md` before implementing anything. It is the source of truth for design intent: rules, scoring, modes, monetization rules and the roadmap (§14).

**`docs/PLAN.md` is the implementation plan.** It covers the resolved rule ambiguities (§1, decisions D1–D20), architecture, core data model, generator algorithm, game feel values, Voyage level format and the task index (§16). Each task ID (`T1.05`, …) matches a GitHub issue titled `[T1.05] …` in `satautiv/Tidepool`, and the issues are grouped into milestones M1–M5 and Later. Work one issue at a time, and follow its acceptance criteria. If an implementation decision changes, update `docs/PLAN.md`.

## Commands

Node 22 (`.nvmrc`), npm.

```
npm run dev            # Vite dev server
npm run build          # typecheck + production build to dist/
npm run preview        # serve dist/
npm test               # all Vitest tests (src/**/*.test.ts, tools/**/*.test.ts)
npx vitest run src/core/config.test.ts      # single file
npx vitest run -t "forbids Math.random"     # single test by name
npm run test:watch
npm run lint           # ESLint (includes layer-boundary rules)
npm run typecheck      # tsc --noEmit
npm run format         # Prettier (code only; *.md is excluded on purpose)
npm run sim -- --games 5000 --seed 1 --bot greedy   # generator/balance simulator (tools/sim), results in docs/tuning.md
```

Before committing, run `npm run lint`, `npm run typecheck` and `npm test`.

## Stack

TypeScript (strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`), Vite, Vitest, ESLint flat config (typescript-eslint) + Prettier. Canvas 2D for the board and effects; plain DOM/CSS for UI; no game engine. Capacitor + AdMob for Android later. `@/` is an import alias for `src/`.

## Architecture (docs/PLAN.md §3)

```
src/core/      pure game logic: board, pieces, generator, scoring, level
src/render/    canvas drawing, animations, particles
src/input/     mouse + touch drag & drop
src/ui/        DOM menus, HUD, dialogs
src/services/  ads/, storage/, audio/, analytics/, platform/
src/app/       composition root: wires the layers together
src/levels/    Voyage level JSON files
tools/         Node-side tooling (simulation bot, level checker) and tooling tests
```

**Layer rules are enforced by ESLint** (`eslint.config.js`, tested in `tools/lint-boundaries.test.ts`):
- `src/core/` imports nothing outside `core/`. It must not use browser globals, timers, `Math.random`, `Date.now` or `new Date()`. Randomness comes from the seeded RNG, and time is passed in as a parameter. Keep it pure and fully unit-tested.
- `render/`, `input/`, `ui/` and `services/` may import `core/` but not each other. There are two exceptions, both type-only: `render/` may import types from `input/`, and `ui/` may import types from `services/`. Only `app/` wires the implementations together.
- Game logic never waits for animations. Core functions return events, and the presentation layers react to them.

Cross-cutting design constraints that affect the code:

- **Piece generator must be seedable/deterministic.** Daily Tide mode, tests and bug reproduction depend on this. Never use `Math.random()` directly in core logic; thread a seeded RNG through instead. The generator must also guarantee that at least one tray piece fits whenever any piece could, weight towards smaller pieces on crowded boards, and avoid repeats (§3.5).
- **Scoring:** 1 point per placed cell; line clears = 10 × cells cleared × lines cleared at once; the streak multiplier goes up in 0.5 steps per consecutive tray-set with a clear, capped at ×4; a clean board adds +300 (§3.4).
- **Game over** happens when no remaining tray piece fits anywhere. Pieces don't rotate, except through the Rotate booster.
- **Voyage levels are data (JSON).** Adding a level must not need code changes. Special tiles (pearl, coral, bubble, urchin bomb, frozen glass) are listed in §5.
- **All ad calls go through the `AdService` interface** (§8.3), with implementations `NoAdsService` (dev/test), `CrazyGamesAdService`, `PokiAdService` and `AdMobAdService`. Ad rules are hard requirements: never interrupt a run, rewarded ads are always opt-in, no interstitials in the first session, and an ad load failure must never break the game (hide the reward button instead).
- Layout must work in both portrait (mobile) and landscape (desktop), and the game must work offline once loaded.
