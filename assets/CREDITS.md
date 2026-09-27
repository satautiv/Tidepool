# Asset credits

Every asset in Tidepool is listed here with its source and licence.

## Audio

All sound effects and the ambient loop are **original and generated in code** by
`src/services/audio/synth.ts` (Web Audio buffers built from sine partials and filtered noise at
runtime). They are not downloaded files, so they add nothing to the download size.

| Sound | Used for | Source | Licence |
|---|---|---|---|
| `lift` | picking up a piece | generated (`synth.ts`) | original, part of this project |
| `clink` | placing a piece (pitched per colour) | generated | original |
| `bloop` | invalid drop | generated | original |
| `whoosh` | line clear (pitched by streak) | generated | original |
| `chime0`–`chime2` | multi-line arpeggio, streak up | generated | original |
| `flourish` | clean board | generated | original |
| `shuffle` | new tray | generated | original |
| `gameOver` | game over | generated | original |
| `uiTick` | button press | generated | original |
| `ambient` | water and pad loop (T2.10) | generated | original |

## Graphics

All graphics (glass blocks, particles, sand, caustics) are drawn in code in `src/render/`.
