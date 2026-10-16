import {
  type Board,
  type Position,
  cellKey,
  frontierCells,
  getTile,
  hasNeighbor,
  isBoardEmpty,
} from './board';
import { MAX_LINE_LENGTH, type Tile } from './tiles';

export interface Placement {
  x: number;
  y: number;
  tile: Tile;
}

export type PlacementError =
  | 'EMPTY_MOVE'
  | 'DUPLICATE_CELL'
  | 'CELL_OCCUPIED'
  | 'NOT_IN_LINE'
  | 'GAP_IN_LINE'
  | 'NOT_CONNECTED'
  | 'INVALID_LINE';

export interface ScoredLine {
  direction: 'horizontal' | 'vertical';
  cells: Position[];
  tiles: Tile[];
  /** Line length, plus the Qwirkle bonus if the line has 6 tiles. */
  points: number;
  isQwirkle: boolean;
}

export type PlacementResult =
  | { ok: true; score: number; lines: ScoredLine[]; qwirkles: number }
  | { ok: false; error: PlacementError };

export const QWIRKLE_BONUS = 6;

/**
 * A line is valid if it shares one attribute and every tile differs in the other:
 * same color with all-different shapes, or same shape with all-different colors.
 * That also rules out duplicates and caps the length at 6.
 */
export function isValidLine(tiles: readonly Tile[]): boolean {
  if (tiles.length <= 1) return true;
  if (tiles.length > MAX_LINE_LENGTH) return false;
  const colors = new Set(tiles.map((t) => t.color));
  const shapes = new Set(tiles.map((t) => t.shape));
  const sameColorDistinctShapes = colors.size === 1 && shapes.size === tiles.length;
  const sameShapeDistinctColors = shapes.size === 1 && colors.size === tiles.length;
  return sameColorDistinctShapes || sameShapeDistinctColors;
}

/** The maximal run of tiles through (x, y) along one axis, including (x, y) itself. */
function runThrough(board: Board, x: number, y: number, dx: number, dy: number): Position[] {
  let sx = x;
  let sy = y;
  while (getTile(board, sx - dx, sy - dy) !== undefined) {
    sx -= dx;
    sy -= dy;
  }
  const cells: Position[] = [];
  let cx = sx;
  let cy = sy;
  while (getTile(board, cx, cy) !== undefined) {
    cells.push({ x: cx, y: cy });
    cx += dx;
    cy += dy;
  }
  return cells;
}

/**
 * Checks a placement against the board and scores it. Pure: the board is not changed.
 * Does not know about hands or turn order; see game.ts for that.
 */
export function evaluatePlacement(board: Board, placements: readonly Placement[]): PlacementResult {
  if (placements.length === 0) return { ok: false, error: 'EMPTY_MOVE' };

  const newKeys = new Set<string>();
  for (const p of placements) {
    const key = cellKey(p.x, p.y);
    if (newKeys.has(key)) return { ok: false, error: 'DUPLICATE_CELL' };
    if (board[key] !== undefined) return { ok: false, error: 'CELL_OCCUPIED' };
    newKeys.add(key);
  }

  const first = placements[0]!;
  const horizontal = placements.every((p) => p.y === first.y);
  const vertical = placements.every((p) => p.x === first.x);
  if (!horizontal && !vertical) return { ok: false, error: 'NOT_IN_LINE' };

  const next: Record<string, Tile> = { ...board };
  for (const p of placements) next[cellKey(p.x, p.y)] = p.tile;

  // All new tiles must form one unbroken line; gaps may be filled by tiles already on the board.
  if (placements.length > 1) {
    const coords = placements.map((p) => (horizontal ? p.x : p.y));
    const min = Math.min(...coords);
    const max = Math.max(...coords);
    for (let c = min; c <= max; c++) {
      const tile = horizontal ? getTile(next, c, first.y) : getTile(next, first.x, c);
      if (tile === undefined) return { ok: false, error: 'GAP_IN_LINE' };
    }
  }

  if (!isBoardEmpty(board) && !placements.some((p) => hasNeighbor(board, p.x, p.y))) {
    return { ok: false, error: 'NOT_CONNECTED' };
  }

  // Collect every line that runs through a new tile. A line is identified by its
  // direction and first cell, so the shared line of a multi-tile move counts once.
  const lines: ScoredLine[] = [];
  const seenLines = new Set<string>();
  for (const p of placements) {
    for (const [direction, dx, dy] of [
      ['horizontal', 1, 0],
      ['vertical', 0, 1],
    ] as const) {
      const cells = runThrough(next, p.x, p.y, dx, dy);
      // A tile without a neighbor in this direction forms no line here.
      if (cells.length < 2) continue;
      const id = `${direction}:${cellKey(cells[0]!.x, cells[0]!.y)}`;
      if (seenLines.has(id)) continue;
      seenLines.add(id);
      const tiles = cells.map((c) => getTile(next, c.x, c.y)!);
      if (!isValidLine(tiles)) return { ok: false, error: 'INVALID_LINE' };
      const isQwirkle = tiles.length === MAX_LINE_LENGTH;
      lines.push({
        direction,
        cells,
        tiles,
        points: tiles.length + (isQwirkle ? QWIRKLE_BONUS : 0),
        isQwirkle,
      });
    }
  }

  // Only a single tile on an empty board forms no line at all; it scores 1 point.
  const score = lines.length === 0 ? 1 : lines.reduce((sum, l) => sum + l.points, 0);
  const qwirkles = lines.filter((l) => l.isQwirkle).length;
  return { ok: true, score, lines, qwirkles };
}

/**
 * True if at least one tile of the hand can be placed somewhere.
 * Checking single tiles is enough: any valid multi-tile move contains a tile next to
 * the board that would also be valid on its own, since every sub-run of a valid line
 * is itself valid.
 */
export function hasAnyValidPlacement(board: Board, hand: readonly Tile[]): boolean {
  if (hand.length === 0) return false;
  if (isBoardEmpty(board)) return true;
  for (const cell of frontierCells(board)) {
    for (const tile of hand) {
      if (evaluatePlacement(board, [{ x: cell.x, y: cell.y, tile }]).ok) return true;
    }
  }
  return false;
}

/**
 * Size of the longest valid line that can be built from this hand alone:
 * the most distinct shapes of one color, or the most distinct colors of one shape.
 * Used to decide who starts and how many tiles the first move needs.
 */
export function longestStartLine(hand: readonly Tile[]): number {
  const shapesByColor = new Map<string, Set<string>>();
  const colorsByShape = new Map<string, Set<string>>();
  for (const t of hand) {
    if (!shapesByColor.has(t.color)) shapesByColor.set(t.color, new Set());
    shapesByColor.get(t.color)!.add(t.shape);
    if (!colorsByShape.has(t.shape)) colorsByShape.set(t.shape, new Set());
    colorsByShape.get(t.shape)!.add(t.color);
  }
  let best = 0;
  for (const s of [...shapesByColor.values(), ...colorsByShape.values()]) {
    best = Math.max(best, s.size);
  }
  return best;
}
