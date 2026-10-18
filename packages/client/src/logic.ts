import {
  type Board,
  type Placement,
  type PlacementResult,
  type Position,
  type Tile,
  cellKey,
  evaluatePlacement,
} from '@qwirkle/game';

/** The board including tiles the player has put down but not yet confirmed. */
export function withPending(board: Board, pending: readonly Placement[]): Board {
  if (pending.length === 0) return board;
  const next: Record<string, Tile> = { ...board };
  for (const p of pending) next[cellKey(p.x, p.y)] = p.tile;
  return next;
}

/** Checks the pending move with the shared rules. Only called when the player confirms. */
export function checkMove(board: Board, pending: readonly Placement[]): PlacementResult {
  return evaluatePlacement(board, pending);
}

/** Bounding box of the given cells, or null if there are none. */
export function bounds(cells: readonly Position[]): { minX: number; maxX: number; minY: number; maxY: number } | null {
  if (cells.length === 0) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const c of cells) {
    minX = Math.min(minX, c.x);
    maxX = Math.max(maxX, c.x);
    minY = Math.min(minY, c.y);
    maxY = Math.max(maxY, c.y);
  }
  return { minX, maxX, minY, maxY };
}
