/**
 * Keyboard play (README §12, docs/PLAN.md §8, T2.17): 1/2/3 pick a tray piece, which appears
 * at the valid spot nearest the board's centre; arrows move it to the next valid spot in that
 * direction; Enter/Space place it; Esc puts it back. Pure logic: the app maps keys to these
 * calls and draws the selection like a drag.
 */
import { BOARD_SIZE } from '../core/config';
import type { Shape } from '../core/shapes';
import type { PlaceIntent } from './DragController';

export interface KeyboardHost {
  pieceOf(slot: number): Shape | null;
  canPlace(slot: number, row: number, col: number): boolean;
}

export interface KeySelection {
  readonly slot: number;
  readonly row: number;
  readonly col: number;
}

export class KeyboardController {
  private selection: KeySelection | null = null;

  constructor(private readonly host: KeyboardHost) {}

  get state(): KeySelection | null {
    return this.selection;
  }

  /**
   * Picks up a tray piece at the valid position closest to the board centre. Returns false
   * (and keeps any current selection) when the slot is empty or the piece fits nowhere.
   */
  select(slot: number): boolean {
    const shape = this.host.pieceOf(slot);
    if (!shape) return false;
    const centre = (BOARD_SIZE - 1) / 2;
    let best: KeySelection | null = null;
    let bestDist = Infinity;
    for (let row = 0; row + shape.height <= BOARD_SIZE; row++) {
      for (let col = 0; col + shape.width <= BOARD_SIZE; col++) {
        if (!this.host.canPlace(slot, row, col)) continue;
        const dr = row + (shape.height - 1) / 2 - centre;
        const dc = col + (shape.width - 1) / 2 - centre;
        const dist = dr * dr + dc * dc;
        if (dist < bestDist) {
          bestDist = dist;
          best = { slot, row, col };
        }
      }
    }
    if (!best) return false;
    this.selection = best;
    return true;
  }

  /**
   * Moves one step in a direction, skipping spots where the piece doesn't fit: first straight
   * along the row or column, then the nearest valid spot in the rows/columns beyond.
   */
  move(dRow: number, dCol: number): boolean {
    const sel = this.selection;
    const shape = sel && this.host.pieceOf(sel.slot);
    if (!sel || !shape) return false;
    const fits = (row: number, col: number) =>
      row >= 0 &&
      col >= 0 &&
      row + shape.height <= BOARD_SIZE &&
      col + shape.width <= BOARD_SIZE &&
      this.host.canPlace(sel.slot, row, col);

    // Straight along the row or column first, jumping over spots where it doesn't fit…
    for (let k = 1; k < BOARD_SIZE; k++) {
      const row = sel.row + dRow * k;
      const col = sel.col + dCol * k;
      if (fits(row, col)) return this.go(sel.slot, row, col);
    }
    // …then the nearest spot beyond, fanning out sideways line by line.
    for (let k = 1; k < BOARD_SIZE; k++) {
      for (let side = 1; side < BOARD_SIZE; side++) {
        for (const s of [-side, side]) {
          const row = sel.row + dRow * k + (dRow === 0 ? s : 0);
          const col = sel.col + dCol * k + (dCol === 0 ? s : 0);
          if (fits(row, col)) return this.go(sel.slot, row, col);
        }
      }
    }
    return false;
  }

  private go(slot: number, row: number, col: number): true {
    this.selection = { slot, row, col };
    return true;
  }

  /** The placement for the current selection, which is then cleared. */
  confirm(): PlaceIntent | null {
    const sel = this.selection;
    this.selection = null;
    if (!sel || !this.host.canPlace(sel.slot, sel.row, sel.col)) return null;
    return sel;
  }

  cancel(): KeySelection | null {
    const sel = this.selection;
    this.selection = null;
    return sel;
  }
}
