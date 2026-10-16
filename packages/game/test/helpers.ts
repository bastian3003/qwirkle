import { type Board, cellKey } from '../src/board';
import type { GameState, PlayerState } from '../src/game';
import type { Color, Shape, Tile } from '../src/tiles';

let counter = 0;

/** A tile with a unique id; pass copy to get a predictable id. */
export function tile(color: Color, shape: Shape, copy?: number): Tile {
  return { id: `${color}-${shape}-${copy ?? `t${counter++}`}`, color, shape };
}

/** Builds a board from [x, y, tile] triples. */
export function board(...cells: [number, number, Tile][]): Board {
  const b: Record<string, Tile> = {};
  for (const [x, y, t] of cells) b[cellKey(x, y)] = t;
  return b;
}

/** A hand-built game state for testing specific situations. */
export function makeState(opts: {
  hands: Tile[][];
  bag?: Tile[];
  board?: Board;
  current?: number;
  scores?: number[];
  minTilesFirstMove?: number;
}): GameState {
  const players: PlayerState[] = opts.hands.map((hand, i) => ({
    id: `p${i + 1}`,
    name: `Spielerin ${i + 1}`,
    hand,
    score: opts.scores?.[i] ?? 0,
  }));
  return {
    players,
    bag: opts.bag ?? [],
    board: opts.board ?? {},
    currentPlayerIndex: opts.current ?? 0,
    status: 'playing',
    minTilesFirstMove: opts.minTilesFirstMove ?? 0,
    consecutivePasses: 0,
    lastMove: null,
    endReason: null,
    winnerIds: [],
  };
}
