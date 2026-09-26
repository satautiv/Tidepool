/**
 * Voyage special tiles (README §5, docs/PLAN.md §14.2).
 * Only the type is reserved for now; the tile engine and behaviours arrive in T4.02.
 */
export interface TileState {
  readonly kind: string;
}
