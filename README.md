# 🌊 Tidepool

*A calm, satisfying block puzzle set in a sunlit tidepool. Web first, Android next, ad-supported.*

> **Status:** Pre-production — vision document. Working title; check name availability on stores and portals before release.

---

## 1. Elevator pitch

Tidepool is a drag-and-drop block puzzle. You place pieces of polished sea glass onto an 8×8 grid. When you fill a row or column, the line washes away with a soft wave. It's easy to learn in ten seconds and hard to put down.

On top of the classic endless mode, **Voyage mode** takes you across a reef map with hand-made levels and clear goals: collect pearls, free coral, and pop bubbles. That gives players a reason to come back every day, not just to chase a high score.

**Target player:** casual puzzle fans of all ages who play in short sessions (2–10 minutes) on a phone or a browser tab, on a commute, on a break, or before sleep.

---

## 2. Design pillars

1. **Instantly readable.** No tutorial text needed for the core loop. A new player understands the game within one move.
2. **Satisfying feel.** Every placement, clear and combo has juicy feedback: animation, sound, haptics. Feel matters as much as rules.
3. **Calm, never stressful.** No timers in the core modes. Soft colours, gentle audio. Players relax *while* thinking.
4. **Fair.** Losing should feel like the player's mistake, never the random piece generator's. Ads never block progress.
5. **Short sessions, many returns.** Designed around 3–5 minute runs and daily reasons to come back.

---

## 3. Core gameplay (Endless mode)

### 3.1 The board
- 8×8 grid of empty "sand" cells.
- Below the board: a **tray with 3 pieces**.

### 3.2 The loop
1. Drag a piece from the tray onto the board. A **ghost preview** shows where it will land and which lines would clear.
2. Pieces cannot be rotated (classic rule; rotation is a power-up, see §6).
3. When a row or column is completely filled, it clears. Multiple lines can clear at once.
4. When all 3 tray pieces are used, 3 new ones are dealt.
5. **Game over** when none of the remaining tray pieces fits anywhere on the board.

### 3.3 Piece set
Standard shapes, from 1 to 9 cells:
- Single dot (1)
- Lines: 2, 3, 4, 5 (horizontal and vertical)
- Squares: 2×2, 3×3
- L-shapes and J-shapes (3-cell and 5-cell, all orientations)
- T-shapes, S/Z-shapes (4-cell, all orientations)

Each piece gets a random sea-glass colour from a palette of 6 (purely cosmetic in Endless mode).

### 3.4 Scoring
| Action | Points |
|---|---|
| Placing a piece | 1 point per cell placed |
| Clearing lines | 10 points per cell cleared × number of lines cleared at once |
| Combo streak | Each consecutive tray-set with at least one clear increases a streak multiplier (×1, ×1.5, ×2, ×2.5 … capped at ×4) |
| Clean board | Clearing the entire board: +300 bonus |

Example: clearing 2 lines at once (16 cells) = 16 × 10 × 2 = 320 points, before the streak multiplier.

Big clears show escalating callouts ("Nice!", "Splash!", "Tidal Wave!").

### 3.5 Fair piece generation
Pure randomness creates unwinnable deals and feels unfair. The generator should:
- **Guarantee that at least one piece in each new tray fits the current board** whenever any piece in the set could fit at all.
- **Adapt to board fullness:** when the board is crowded, weight towards smaller pieces; when it is open, allow more large pieces.
- **Avoid repeats:** never deal 3 identical shapes; limit the same shape appearing in consecutive trays.
- Be **seedable** (deterministic from a seed), which is needed for Daily Tide mode, testing and bug reproduction.

---

## 4. Game modes

### 4.1 Endless (launch)
The classic mode described above. Chase your high score. The best score is saved locally.

### 4.2 Voyage (launch or first update)
A reef map with a path of levels, grouped into areas of ~20 levels each:
1. **Shallows**: introduces goals gently
2. **Coral Garden**: introduces coral
3. **Kelp Forest**: introduces bubbles
4. **Sunken Ship**: mixes everything, harder layouts
5. More areas added in updates

Each level has:
- A **pre-made starting board** (some cells already filled, special tiles placed).
- A **goal**, for example:
  - Collect N pearls
  - Break all coral
  - Pop all bubbles
  - Reach X points
- A **move limit** (number of pieces placed), not a time limit.
- **1–3 stars** based on moves left when the goal is reached.

Levels are defined as data (JSON), so new levels can be added without code changes.

### 4.3 Daily Tide (post-launch)
One seeded challenge per day, the same for every player. The same board and piece sequence for everyone makes scores comparable and gives a daily reason to return. Streak counter for consecutive days played.

---

## 5. Special tiles (Voyage mode)

| Tile | Behaviour |
|---|---|
| 🦪 **Pearl** | Sits inside a pre-filled cell. Collected when that cell's line is cleared. |
| 🪸 **Coral** | A locked cell. Needs to be part of **2** line clears to break (cracks after the first). |
| 🫧 **Bubble** | Floats over a cell. Pops when a piece is placed on it, or when its line clears. |
| 💣 **Urchin bomb** | When its line clears, it also clears the surrounding 3×3 area. |
| 🧊 **Frozen glass** | A cell that can't be cleared until an adjacent line clear thaws it. |

New tile types are introduced one at a time, each with a short one-screen visual tutorial.

---

## 6. Power-ups (boosters)

| Booster | Effect |
|---|---|
| ↩️ **Undo** | Take back the last placement |
| 🔄 **Rotate** | Rotate one tray piece 90° |
| 🔀 **Reshuffle** | Replace the current tray with 3 new pieces |
| 💥 **Wave** | Clear one chosen row or column |

Players earn boosters from level rewards and daily login. They can also get one by **watching a rewarded ad**. Boosters are helpful but never required to finish a level.

---

## 7. Progression & meta

- **Shells** 🐚: soft currency earned from levels, daily play and score milestones.
- Spend shells on:
  - Boosters
  - **Cosmetic themes:** alternate glass palettes (Sunset, Moonlit, Arctic), board backgrounds and clear effects
- Everything cosmetic; **no pay-to-win**.
- Achievements for milestones (first Tidal Wave, 100 lines cleared, all stars in Shallows, etc.).

---

## 8. Monetization

Revenue comes primarily from ads, with an optional "Remove Ads" purchase later on Android.

### 8.1 Ad placements
| Placement | Type | Where / when |
|---|---|---|
| **Second chance** | Rewarded | On game over: "Watch an ad to get 3 small pieces and keep going." Once per run. |
| **Free booster** | Rewarded | From the booster menu, limited per day. |
| **Double reward** | Rewarded | At level complete: double the shells earned. |
| **Daily bonus** | Rewarded | Extra daily login reward. |
| **Break ad** | Interstitial | Between runs/levels only, never mid-play. At most every ~3 minutes of play, and never in the first session. |
| Banner | Banner | *Optional*, Android only, below the tray, and only if it doesn't hurt retention. Off by default. |

### 8.2 Rules
- Rewarded ads are **always the player's choice**.
- **Never interrupt a run** with an ad.
- New players see **no interstitials in their first session**.
- If an ad fails to load, the game continues normally and the reward button is hidden. The game never breaks because of ads.

### 8.3 Ad abstraction layer
All ad calls go through one small interface, so the provider can be swapped per platform:

```ts
interface AdService {
  init(): Promise<void>;
  isRewardedReady(): boolean;
  showRewarded(placement: string): Promise<boolean>; // true = reward earned
  showInterstitial(placement: string): Promise<void>;
  gameplayStart(): void;  // some web portals require these signals
  gameplayStop(): void;
}
```

Implementations:
- `NoAdsService`: for development and testing
- `CrazyGamesAdService` / `PokiAdService`: web portals
- `AdMobAdService`: Android (via Capacitor plugin)

---

## 9. Platforms & distribution

1. **Web (first):** submit to web game portals (e.g. CrazyGames, Poki). They provide players and handle ads via their SDK with a revenue share. Also playable on itch.io and a personal site.
2. **Android (second):** wrap the same web build with **Capacitor**, monetize with **Google AdMob**, and publish on Google Play.
3. iOS: possible later with the same wrapper; not a goal for now.

Requirements this creates:
- Works well in **portrait (mobile) and landscape (desktop browser)**; the layout adapts.
- Small download size, fast first load (target: playable in < 3 seconds on mobile).
- Works offline once loaded (Android especially).
- Progress saved locally; cloud save is a later nice-to-have.

---

## 10. Art direction

- **Mood:** a sunny, shallow tidepool seen from above. Calm, soft, a little dreamy.
- **Board:** light sand texture, gentle water caustics shimmering over it.
- **Blocks:** rounded sea-glass pieces, slightly translucent, with a soft highlight and subtle inner glow.
- **Palette (default):** seafoam green, aqua, coral pink, sand gold, lavender, deep teal on a pale sand/blue background.
- **Clears:** the line lifts and dissolves into a small wave and bubbles, with sparkles scaling with the size of the clear.
- **UI:** rounded, friendly shapes; large touch targets; minimal text.
- **Accessibility:** colour is never the only information. Pieces also differ subtly in pattern where it matters (e.g. special tiles use distinct icons). A colour-blind friendly palette option.

Art can be produced in code (shapes, gradients, particles) for the prototype, then upgraded with drawn sprites if the game shows promise.

## 11. Audio direction

- Soft ambient water loop (low volume, toggleable).
- Each placement: a gentle "clink" of glass, slightly pitched per colour.
- Line clears: a wave "whoosh"; pitch rises with combo streak.
- Big clears: layered chimes.
- Separate music and sound effect toggles. Default is sound on and music low.

## 12. Game feel checklist

- The dragged piece is lifted **above the finger** on touch devices so the player can see where it goes.
- Ghost preview snaps to the grid and highlights the lines that would clear.
- Invalid drop: the piece smoothly returns to the tray.
- Tiny screen shake and haptic tap on big clears (Android).
- Score counts up with animation; combo callouts pop and fade.
- Game over is gentle: the board fades to sand, and the best score is shown, with a clear "Play again" button.

---

## 13. Technical plan

### 13.1 Stack
- **TypeScript + Vite**
- **HTML5 Canvas 2D** for the board and effects; DOM/CSS for menus and UI overlays
- No heavy game engine. The game is simple enough that a small custom setup stays lighter and faster to load.
- **Vitest** for unit tests of game logic
- **Capacitor** for the Android build

### 13.2 Architecture
```
src/
  core/        # Pure game logic, no rendering, fully unit-tested
    board.ts        # grid state, placement checks, line detection/clearing
    pieces.ts       # piece definitions
    generator.ts    # fair, seedable piece generation
    scoring.ts      # points, combos, streaks
    level.ts        # Voyage level loading and goal tracking
  render/      # Canvas drawing, animations, particles
  input/       # Drag & drop for mouse and touch
  ui/          # Menus, HUD, dialogs (DOM)
  services/
    ads/            # AdService interface + implementations
    storage.ts      # save/load progress (localStorage)
    audio.ts
    analytics.ts
  levels/      # Voyage level JSON files
```

Key principle: **the game logic in `core/` knows nothing about rendering, input or ads.** That keeps it testable and makes it easy to change visuals or platforms later.

### 13.3 Analytics to track
- Day-1 and Day-7 retention
- Average session length and sessions per day
- Rewarded ads watched per session, and interstitials per session
- Endless: average score, most common game-over board fullness
- Voyage: completion rate and attempts per level (to find difficulty spikes)

---

## 14. Roadmap

### Milestone 1: Playable core (Endless)
- [ ] Project setup (Vite + TypeScript + Vitest)
- [ ] Board, pieces, placement and line clearing (with tests)
- [ ] Fair seedable piece generator (with tests)
- [ ] Drag & drop for mouse and touch, with ghost preview
- [ ] Scoring, combos, streak multiplier
- [ ] Game over detection and restart
- [ ] High score saved locally
- [ ] Basic Tidepool visuals drawn in code
- [ ] `AdService` interface with `NoAdsService` and placeholder ad moments

### Milestone 2: Feel & polish
- [ ] Clear animations, particles, callouts
- [ ] Sound effects and ambient loop
- [ ] Responsive layout for portrait and landscape
- [ ] Main menu, settings (sound, music, palette)
- [ ] Human playtest round

### Milestone 3: Web release
- [ ] Portal SDK integration (rewarded + interstitial)
- [ ] Performance and load-time pass
- [ ] Submit to web portals

### Milestone 4: Voyage mode
- [ ] Level format and loader
- [ ] Special tiles: pearl, coral, bubble
- [ ] Reef map, stars, first 40 levels
- [ ] Boosters and shells

### Milestone 5: Android
- [ ] Capacitor wrapper, AdMob integration, haptics
- [ ] Offline support
- [ ] Store listing, privacy policy, Google Play release

### Later
- Daily Tide mode, more areas, cosmetic themes, achievements, "Remove Ads" purchase, cloud save

---

## 15. Non-goals (for now)
- Multiplayer or leaderboards with accounts
- Timers or speed-based modes in the core game
- Energy/lives systems that block play
- Pay-to-win purchases

## 16. Open questions
- Launch with Endless only, or wait until Voyage is ready?
- Which web portal to target first (their SDK requirements differ)?
- Final name: check availability of "Tidepool" on Google Play and the portals.
