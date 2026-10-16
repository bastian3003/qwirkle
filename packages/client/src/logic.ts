import {
  type Board,
  type Placement,
  type PlacementResult,
  type Position,
  type Tile,
  cellKey,
  evaluatePlacement,
  frontierCells,
} from '@qwirkle/game';

/** The board including tiles the player has put down but not yet confirmed. */
export function withPending(board: Board, pending: readonly Placement[]): Board {
  if (pending.length === 0) return board;
  const next: Record<string, Tile> = { ...board };
  for (const p of pending) next[cellKey(p.x, p.y)] = p.tile;
  return next;
}

/**
 * Cells where `tile` can go next, given the tiles already pending this turn.
 * Uses the same rules as the server, so the player only sees spots that are allowed.
 */
export function legalSlots(board: Board, pending: readonly Placement[], tile: Tile): Position[] {
  return frontierCells(withPending(board, pending)).filter(
    (cell) => evaluatePlacement(board, [...pending, { x: cell.x, y: cell.y, tile }]).ok,
  );
}

/** Previews the pending move. null when nothing is pending. */
export function previewMove(board: Board, pending: readonly Placement[]): PlacementResult | null {
  return pending.length === 0 ? null : evaluatePlacement(board, pending);
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
