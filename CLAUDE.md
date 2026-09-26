# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Tidepool is a calm, drag-and-drop 8×8 block puzzle game. It targets the web first, then Android through Capacitor, and is ad-supported. The repo is **pre-production**: it contains only `README.md`, which is the full design and vision document. No code, `package.json`, or build tooling exists yet. Read `README.md` before implementing anything. It is the source of truth for design intent: rules, scoring, modes, monetization rules and the roadmap (§14).

**`docs/PLAN.md` is the implementation plan.** It covers the resolved rule ambiguities (§1, decisions D1–D20), architecture, core data model, generator algorithm, game feel values, Voyage level format and the task index (§16). Each task ID (`T1.05`, …) matches a GitHub issue titled `[T1.05] …` in `satautiv/Tidepool`, and the issues are grouped into milestones M1–M5 and Later. Work one issue at a time, and follow its acceptance criteria. If an implementation decision changes, update `docs/PLAN.md`. Update this file with real commands once the project is scaffolded (T1.01).

## Planned stack (README §13.1)

- TypeScript + Vite
- HTML5 Canvas 2D for the board and effects; DOM/CSS for menus, HUD and overlays
- No game engine, to keep the bundle small (target: playable in under 3 s on mobile)
- Vitest for unit tests of game logic
- Capacitor for the Android wrapper, with AdMob for Android ads

Milestone 1 starts with project setup (Vite + TypeScript + Vitest), so expect standard `npm run dev` / `npm run build` / `npx vitest` style commands once it exists. Verify them against `package.json` and don't assume.

## Architecture (planned, README §13.2)

```
src/core/      pure game logic: board, pieces, generator, scoring, level
src/render/    canvas drawing, animations, particles
src/input/     mouse + touch drag & drop
src/ui/        DOM menus, HUD, dialogs
src/services/  ads/ (AdService + impls), storage.ts (localStorage), audio.ts, analytics.ts
src/levels/    Voyage level JSON files
```

**Core rule: `src/core/` must know nothing about rendering, input, or ads.** Keep it pure and fully unit-tested, so visuals and platforms can change independently.

Cross-cutting design constraints that affect the code:

- **Piece generator must be seedable/deterministic.** Daily Tide mode, tests and bug reproduction depend on this. Never use `Math.random()` directly in core logic; thread a seeded RNG through instead. The generator must also guarantee that at least one tray piece fits whenever any piece could, weight towards smaller pieces on crowded boards, and avoid repeats (§3.5).
- **Scoring:** 1 point per placed cell; line clears = 10 × cells cleared × lines cleared at once; the streak multiplier goes up in 0.5 steps per consecutive tray-set with a clear, capped at ×4; a clean board adds +300 (§3.4).
- **Game over** happens when no remaining tray piece fits anywhere. Pieces don't rotate, except through the Rotate booster.
- **Voyage levels are data (JSON).** Adding a level must not need code changes. Special tiles (pearl, coral, bubble, urchin bomb, frozen glass) are listed in §5.
- **All ad calls go through the `AdService` interface** (§8.3), with implementations `NoAdsService` (dev/test), `CrazyGamesAdService`, `PokiAdService` and `AdMobAdService`. Ad rules are hard requirements: never interrupt a run, rewarded ads are always opt-in, no interstitials in the first session, and an ad load failure must never break the game (hide the reward button instead).
- Layout must work in both portrait (mobile) and landscape (desktop), and the game must work offline once loaded.
