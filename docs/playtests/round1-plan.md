# Playtest round #1: plan

This is the plan for [T2.18](https://github.com/satautiv/Tidepool/issues/44), the first human playtest. It checks the core Endless loop and the game feel with real people before the web release work (M3). The findings go into `docs/playtests/2026-10-round1.md`.

## Goals

- Check whether new players understand the game with no explanation.
- Measure how calm, fair and fun the game feels.
- Decide the open tuning questions (PLAN §22):
  - magnet assist on or off
  - 4-cell L/J shapes (`config.shapes.includeL4`) on or off
  - generator weight tweaks
  - animation timing tweaks in `feel.ts`

## Phase 0: prepare the build (done)

The playtest build is the normal web build. It is deployed to GitHub Pages on every push to `main` (`.github/workflows/pages.yml`) at <https://satautiv.github.io/Tidepool/>. Playtest mode is switched on with URL parameters. It stays on for that device until `?playtest=0`.

| Link | Use |
|---|---|
| `…/Tidepool/?playtest=1` | Turn on playtest mode (magnet on, no 4-cell L/J shapes). |
| `…/Tidepool/?playtest=1&magnet=0` | Variant with magnet assist off. |
| `…/Tidepool/?magnet=1` | Back to magnet on (playtest mode is remembered). |
| `…/Tidepool/?l4=1` | Add the 4-cell L/J shapes to new runs (`?l4=0` removes them). |
| `…/Tidepool/?clearlog=1` | Empty the log before the next tester on the same device. |
| `…/Tidepool/?playtest=0` | Turn playtest mode off. |

- The variant choice is remembered, so reopening the game (the resume check) keeps the tester on the same variant. A `?playtest=1` link always starts from the default variant (magnet on, no 4-cell L/J shapes), apart from switches in the same link.
- The 4-cell shape switch applies from the next new run. A run in progress keeps its shape set.
- **Export:** Settings → **Export playtest log** downloads `tidepool-playtest-<date>-<time>.json`. On a phone, the file lands in Downloads (Android) or Files (iPhone). Rename it `tester-N.json`.
- **What the log holds:**
  - `page_open`: build, variant, device and viewport, at each page load
  - `session_start` / `session_end`
  - `run_start` / `run_end`: score, placed, lines, duration
  - `placement`: shape, lines, points and board fullness, for every move
  - `invalid_drop`: a piece dropped over the board where it doesn't fit
  - `first_clear`: play time and move count until the first clear
  - `perf_fallback` and `error`
- Nothing leaves the device. The log stays in the browser's storage until it is cleared.

## Phase 1: recruit testers

- 5–8 people with a range of ages and gaming habits:
  - at least 2 who rarely play games
  - at least 2 who play block puzzles
- About half on phones (Android and iPhone) and half on desktop.
- About 30 minutes each, in person or on a video call with screen sharing.
- Give each tester a number (`tester-1`, `tester-2`, …). Don't record names in the repo.

## Phase 2: session script (about 25 minutes)

| Time | What happens | What the observer does |
|---|---|---|
| 0–2 min | Hand over the link with no explanation. | Watch silently and don't help. Note: do they find Play? Do they understand dragging? Does the hint hand help? When is the first clear? |
| 2–12 min | Free play, 2–3 runs. | Note confusion, sighs, smiles and "unfair" comments. Count drops that snap back to the tray. |
| 12–17 min | Switch the variant. Odd-numbered testers start with magnet on, even-numbered with `?magnet=0`, then swap. | Ask which felt better, without naming the difference. |
| 17–22 min | Open Settings, change something, pause, close the tab and reopen it. | Check that the run resumes and the settings stick. |
| 22–25 min | Questionnaire, then export the log. | Save the log as `tester-N.json`. |

If time allows, give block-puzzle players one extra run with `?l4=1` and ask whether the pieces felt more varied.

## Phase 3: questionnaire

1. How fun was it? (1–5)
2. How calm or relaxing was it? (1–5)
3. When you lost, did it feel like your fault or the game's? (my fault / unfair / not sure)
4. Which moment felt best?
5. What was confusing?
6. Did anything feel slow, twitchy or annoying (animations, sounds, dragging)?
7. Would you play again tomorrow? (yes / maybe / no)
8. Did you notice a difference between the two variants? Which one did you prefer?

## Observer note template

Copy one per tester:

```
Tester: N          Device / browser:            Gamer? (none / casual / block puzzles)
Variant order: magnet on→off | off→on          L4 run: yes / no

First 2 minutes
- Found Play:            yes / no / needed help
- Understood dragging:   yes / no — time:
- Hint hand noticed:     yes / no
- Time to first clear:

Free play
- Runs / scores:
- Invalid drops (tally):
- Moments of confusion:
- Moments of delight:
- "Unfair" comments:

Settings / resume
- Resume after reopening worked: yes / no
- Settings persisted:            yes / no

Questionnaire answers: 1 __  2 __  3 __  4 __  5 __  6 __  7 __  8 __
Bugs seen:
```

## Phase 4: decisions

| Question | Decide by |
|---|---|
| Magnet assist | Keep it on if invalid drops fall noticeably with it on, and testers prefer it or don't notice it. |
| 4-cell L/J shapes | Turn them on if testers call the pieces repetitive and `npm run sim` still shows healthy run lengths. |
| Generator weights | If most testers answer "unfair" to question 3, retune the weights with the simulator and record the results in `docs/tuning.md`. |
| Animation timing | Change the `feel.ts` values for anything that more than one tester called slow or twitchy. |

## Output

- The report in `docs/playtests/2026-10-round1.md`: tester summary (no names), metrics per tester, questionnaire results, decisions and reasons.
- The tuning changes merged into `config.ts` and `feel.ts`, and PLAN updated where a decision changed.
- Follow-up GitHub issues for bugs and anything else found.
