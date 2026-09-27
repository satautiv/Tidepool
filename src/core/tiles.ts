/**
 * Voyage special tiles (README §5, docs/PLAN.md §14.2).
 * Only the type is reserved for now; the tile engine and behaviours arrive in T4.02.
 */
/** Special tile kinds (PLAN §14.2). Urchin and frozen are later (Sunken Ship). */
export const TILE_KINDS = ['pearl', 'coral', 'bubble', 'urchin', 'frozen'] as const;
export type TileKind = (typeof TILE_KINDS)[number];

export interface TileState {
  readonly kind: TileKind;
  /** Coral hit points: 2 intact, 1 cracked. */
  readonly hp?: number;
}

/** Something a tile did during a clear (e.g. a pearl collected). Emitted from T4.02 on. */
export interface TileEffect {
  readonly kind: string;
  /** Board cell index where it happened. */
  readonly index: number;
}
