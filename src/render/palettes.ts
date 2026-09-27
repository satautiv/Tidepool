/** Colour palettes as data (docs/PLAN.md §7.3). Cosmetic themes (T6.05) add entries here. */
import { COLOR_COUNT } from '../core/config';

export interface Palette {
  readonly id: string;
  /** Exactly COLOR_COUNT sea-glass colours, indexed by piece colour. */
  readonly glass: readonly string[];
  /** Page background gradient, top to bottom. */
  readonly background: readonly [top: string, bottom: string];
  readonly board: {
    /** The rounded panel the grid sits on. */
    readonly panel: string;
    readonly panelEdge: string;
    readonly shadow: string;
    /** Empty "sand well" cells. */
    readonly well: string;
    readonly wellShade: string;
  };
  /** Ghost preview outline and would-clear highlight. */
  readonly highlight: string;
  /** Per-colour glyphs on the blocks are always on (colour-blind palettes). */
  readonly glyphs?: boolean;
}

export const TIDEPOOL: Palette = {
  id: 'tidepool',
  glass: [
    '#7FD8BE', // seafoam
    '#4FC3E8', // aqua
    '#FF8A80', // coral pink
    '#F2C66D', // sand gold
    '#B39DDB', // lavender
    '#26808C', // deep teal
  ],
  background: ['#F6EBD9', '#CDEBF2'],
  board: {
    panel: '#EAD9BD',
    panelEdge: '#D9C29C',
    shadow: '#8A6F48',
    well: '#F3E6CF',
    wellShade: '#DCC7A3',
  },
  highlight: '#FFFFFF',
};

/**
 * Colour-blind friendly (T2.14): based on the Okabe–Ito set, which stays distinguishable under
 * deuteranopia, protanopia and tritanopia, softened towards sea glass and spread in lightness
 * so neighbours differ in brightness as well as hue. Glyphs are always on.
 */
export const COLORBLIND: Palette = {
  ...TIDEPOOL,
  id: 'colorblind',
  // Okabe–Ito hues, nudged (a constrained search) so every pair stays ≥ 23 ΔE apart in normal
  // vision and under all three simulated deficiencies (palettes.test.ts).
  glass: [
    '#56BEF9', // sky blue
    '#E38E00', // orange
    '#00946B', // bluish green
    '#F3EB41', // yellow
    '#0B57A5', // deep blue
    '#C778AD', // reddish purple
  ],
  glyphs: true,
};

export const PALETTES: Readonly<Record<string, Palette>> = {
  [TIDEPOOL.id]: TIDEPOOL,
  [COLORBLIND.id]: COLORBLIND,
};

export function validatePalette(p: Palette): void {
  if (p.glass.length !== COLOR_COUNT) {
    throw new Error(`Palette ${p.id} needs ${COLOR_COUNT} glass colours, has ${p.glass.length}`);
  }
}
