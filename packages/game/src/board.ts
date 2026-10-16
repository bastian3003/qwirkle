import type { Tile } from './tiles';

export interface Position {
  x: number;
  y: number;
}

/**
 * The board is unbounded, so it is stored sparsely: "x,y" -> tile.
 * A plain object keeps game state JSON-serializable for the server.
 */
export type Board = Readonly<Record<string, Tile>>;

export const EMPTY_BOARD: Board = {};

export function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function parseCellKey(key: string): Position {
  const [x, y] = key.split(',').map(Number);
  return { x: x!, y: y! };
}

export function getTile(board: Board, x: number, y: number): Tile | undefined {
  return board[cellKey(x, y)];
}

export function isBoardEmpty(board: Board): boolean {
  return Object.keys(board).length === 0;
}

export const NEIGHBOR_OFFSETS: readonly Position[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

export function hasNeighbor(board: Board, x: number, y: number): boolean {
  return NEIGHBOR_OFFSETS.some((d) => getTile(board, x + d.x, y + d.y) !== undefined);
}

/** All empty cells that touch at least one tile. On an empty board, only the origin. */
export function frontierCells(board: Board): Position[] {
  if (isBoardEmpty(board)) return [{ x: 0, y: 0 }];
  const seen = new Set<string>();
  const result: Position[] = [];
  for (const key of Object.keys(board)) {
    const { x, y } = parseCellKey(key);
    for (const d of NEIGHBOR_OFFSETS) {
      const nx = x + d.x;
      const ny = y + d.y;
      const k = cellKey(nx, ny);
      if (board[k] === undefined && !seen.has(k)) {
        seen.add(k);
        result.push({ x: nx, y: ny });
      }
    }
  }
  return result;
}
