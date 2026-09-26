# Tuning log

This file records the generator and balance settings, and the simulator results they produce (docs/PLAN.md §6.2, §6.5). Add a new entry whenever `GENERATOR` or `SCORING` in `src/core/config.ts` changes, so the effect of each change is on record.

Run the simulator with:

```
npm run sim -- --games 5000 --seed 1 --bot greedy [--json out.json]
npm run sim -- --games 1000 --seed 1 --bot random
```

The greedy bot is a simple heuristic player. It rewards line clears and penalizes enclosed single-cell holes, ragged edges and filled cells. It is much better than random play but plays no deeper strategy, so its numbers describe the generator and rules, not how a skilled human would score.

---

## Baseline, 2026-09-26 (T1.10)

**Settings:** the PLAN §6.2 starting values, unchanged. `maxAttempts` 20, `historyLength` 2, `repeatPenalty` [0.4, 0.7], `crowdedFullness` 0.6, size factors {1–2: 0.6→1.6, 3: 1.0→1.3, 4: 1.0→0.9, 5: 0.9→0.5, 9: 0.6→0.15}, all family weights 1, `solvableTrio` off, L/J tetrominoes off.

### Greedy bot: 5 000 games, seed 1 (43.6 s)

| Metric | Value |
|---|---|
| Score | mean 14 385 · median 10 338 · p90 31 903 · min 43 · max 127 590 |
| Pieces placed | mean 156 · median 116 · p90 329 · min 10 · max 1 214 |
| Lines per game | 65.8 |
| Best combo (lines in one placement) | mean 2.0 |
| Streak at the end of a tray-set | mean 4.03 · max 56 |
| Deals | 262 393 |
| Fallback deals | 0.0% |
| **Unfair deals** (no fitting piece) | **0** |
| Repeat rate (piece was also in the previous tray) | 6.0% |

Game-over fullness: 20–29% 112 · 30–39% 663 · 40–49% 1 636 · 50–59% 1 846 · 60–69% 681 · 70–79% 62.

Shape frequency: dot 9.4%, sq2 7.7%, each 2- and 3-line ~5.2%, each 4-line / S / Z ~4.3%, sq3 and each 5-line 3.2%, each small corner 2.8%, each T 2.3%, each big corner ~1.6%.

### Random bot: 1 000 games, seed 1

Score mean 233 (median 128), 14.6 pieces placed on average, 1.5 lines per game, 0 unfair deals, 0% fallback deals.

### Observations

- **Fairness holds.** There were no unfair deals across 262k deals, and the fallback was never needed: 20 weighted attempts always found an acceptable trio.
- **Family weights are split across rotations**, so a family with 4 variants (corners, T) shows each variant at ¼ of the family share. Per family, corner3 (11.2%) and line2 (10.5%) are the most common and corner5 (6.5%) the least. That matches the equal family weights combined with the size factors.
- **Early deaths still happen** (minimum 10 pieces placed, and a 20–29% fullness bucket). These are cases where no dealt piece fits in a useful spot, even though one piece fits somewhere. `solvableTrio` is the lever to try if playtests find early losses unfair.
- **Streaks are long for the greedy bot** (mean ×3 multiplier at set end), because it always takes a clear when one is available. Human streaks will be much shorter. Revisit the multiplier cap after the first playtest (T2.18) with real data.
- **Next tuning candidates:** a slightly lower weight for `sq2` and the dot on open boards if they feel too generous, and a slightly higher weight for the big corners if players want more variety.
