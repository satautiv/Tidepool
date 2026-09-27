/**
 * Voyage special tiles (README §5, docs/PLAN.md §14.2).
 *
 * Each tile kind is a small `TileBehaviour`. The board asks it whether its cell blocks
 * placement or counts as filled for lines, and hands it the cell when a piece lands on it or
 * its line clears. The behaviour returns the cell's fate (cleared, unchanged or transformed)
 * plus any tile events. Endless boards have no tiles, so none of this changes Endless play.
 */
import type { Cell } from './board';

/** Special tile kinds (PLAN §14.2). Urchin and frozen are later (Sunken Ship). */
export const TILE_KINDS = ['pearl', 'coral', 'bubble', 'urchin', 'frozen'] as const;
export type TileKind = (typeof TILE_KINDS)[number];

export type TileState =
  | { readonly kind: 'pearl' }
  /** hp 2 = intact, 1 = cracked (D15). */
  | { readonly kind: 'coral'; readonly hp: 1 | 2 }
  | { readonly kind: 'bubble' }
  | { readonly kind: 'urchin' }
  | { readonly kind: 'frozen' };

/** What a tile did, for goals, visuals and audio. `index` is the board cell. */
export type TileEvent =
  | { readonly type: 'pearlCollected'; readonly index: number }
  | { readonly type: 'coralCracked'; readonly index: number }
  | { readonly type: 'coralBroken'; readonly index: number }
  | { readonly type: 'bubblePopped'; readonly index: number };

/** A cell's fate after a hook: the new cell and what happened. */
export interface TileOutcome {
  readonly cell: Cell;
  readonly events: readonly TileEvent[];
}

export interface LineClearContext {
  /** The cell's board index. */
  readonly index: number;
}

/**
 * How one tile kind behaves. Hooks receive a cell that carries this kind of tile.
 * Hooks left out fall back to plain glass: `onPlacedOver` never fires on blocking tiles,
 * and `onLineClear` defaults to clearing the cell.
 */
export interface TileBehaviour {
  blocksPlacement(cell: Cell): boolean;
  countsAsFilled(cell: Cell): boolean;
  /** A piece was placed on this (non-blocking) cell; `cell` already has the piece's colour. */
  onPlacedOver?(cell: Cell, index: number): TileOutcome;
  /** The cell is in a line that clears. Return an empty cell to clear it, or keep it. */
  onLineClear?(cell: Cell, ctx: LineClearContext): TileOutcome;
}

export const EMPTY_CELL: Cell = Object.freeze({ color: null });

/** Clears the cell with no tile events: plain glass behaviour. */
export const clearCell = (): TileOutcome => ({ cell: EMPTY_CELL, events: [] });

/** Structural rules for every kind (PLAN §14.2); the per-tile modules add the effects. */
const solid: TileBehaviour = { blocksPlacement: () => true, countsAsFilled: () => true };

const behaviours = new Map<string, TileBehaviour>([
  ['pearl', solid],
  ['coral', solid],
  // A bubble floats over a cell and never blocks it; the cell underneath decides the line.
  [
    'bubble',
    {
      blocksPlacement: (cell) => cell.color !== null,
      countsAsFilled: (cell) => cell.color !== null,
    },
  ],
  ['urchin', solid],
  ['frozen', solid],
]);

/** The behaviour for a tile, or undefined for an unknown kind. */
export function tileBehaviour(tile: { readonly kind: string }): TileBehaviour | undefined {
  return behaviours.get(tile.kind);
}

/**
 * Installs the behaviour for a tile kind (the tile modules use this, and tests use it for
 * dummy tiles). Returns a function that restores the previous behaviour.
 */
export function defineTile(kind: string, behaviour: TileBehaviour): () => void {
  const previous = behaviours.get(kind);
  behaviours.set(kind, behaviour);
  return () => {
    if (previous) behaviours.set(kind, previous);
    else behaviours.delete(kind);
  };
}
