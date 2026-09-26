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

export const PALETTES: Readonly<Record<string, Palette>> = { [TIDEPOOL.id]: TIDEPOOL };

export function validatePalette(p: Palette): void {
  if (p.glass.length !== COLOR_COUNT) {
    throw new Error(`Palette ${p.id} needs ${COLOR_COUNT} glass colours, has ${p.glass.length}`);
  }
}
