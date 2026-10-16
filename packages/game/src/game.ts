import { type Board, EMPTY_BOARD, cellKey, isBoardEmpty } from './board';
import { type Rng, shuffle } from './random';
import {
  type Placement,
  type PlacementError,
  evaluatePlacement,
  hasAnyValidPlacement,
  longestStartLine,
} from './rules';
import { HAND_SIZE, type Tile, createBag } from './tiles';

/** Bonus for the player who empties their hand once the bag is empty. */
export const END_BONUS = 6;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;

export interface PlayerState {
  id: string;
  name: string;
  hand: Tile[];
  score: number;
}

export type LastMove =
  | { type: 'place'; playerId: string; placements: Placement[]; score: number; qwirkles: number }
  | { type: 'swap'; playerId: string; count: number }
  | { type: 'pass'; playerId: string };

export type EndReason = 'hand_emptied' | 'blocked';

/** Full server-side state. Never send this to a client; use getPlayerView. */
export interface GameState {
  players: PlayerState[];
  bag: Tile[];
  board: Board;
  currentPlayerIndex: number;
  status: 'playing' | 'finished';
  /** How many tiles the opening move needs; 0 once the first move is made. */
  minTilesFirstMove: number;
  consecutivePasses: number;
  lastMove: LastMove | null;
  endReason: EndReason | null;
  /** Several ids on a tie. Empty while the game runs. */
  winnerIds: string[];
}

export type Action =
  | { type: 'place'; placements: { x: number; y: number; tileId: string }[] }
  | { type: 'swap'; tileIds: string[] }
  | { type: 'pass' };

export type GameError =
  | PlacementError
  | 'GAME_FINISHED'
  | 'UNKNOWN_PLAYER'
  | 'NOT_YOUR_TURN'
  | 'TILE_NOT_IN_HAND'
  | 'DUPLICATE_TILE'
  | 'FIRST_MOVE_TOO_SHORT'
  | 'FIRST_MOVE_MUST_PLACE'
  | 'SWAP_EMPTY'
  | 'SWAP_TOO_MANY'
  | 'PASS_NOT_ALLOWED';

export type ActionResult = { ok: true; state: GameState } | { ok: false; error: GameError };

function fail(error: GameError): ActionResult {
  return { ok: false, error };
}

/**
 * Deals 6 tiles to each player and picks who starts: the player with the longest
 * possible line in hand. Ties are broken at random.
 */
export function createGame(players: readonly { id: string; name: string }[], rng: Rng): GameState {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    throw new Error(`A game needs ${MIN_PLAYERS} to ${MAX_PLAYERS} players`);
  }
  if (new Set(players.map((p) => p.id)).size !== players.length) {
    throw new Error('Player ids must be unique');
  }

  let bag = createBag(rng);
  const playerStates: PlayerState[] = players.map((p) => {
    const hand = bag.slice(0, HAND_SIZE);
    bag = bag.slice(HAND_SIZE);
    return { id: p.id, name: p.name, hand, score: 0 };
  });

  const lengths = playerStates.map((p) => longestStartLine(p.hand));
  const best = Math.max(...lengths);
  const candidates = lengths.flatMap((len, i) => (len === best ? [i] : []));
  const starter = shuffle(candidates, rng)[0]!;

  return {
    players: playerStates,
    bag,
    board: EMPTY_BOARD,
    currentPlayerIndex: starter,
    status: 'playing',
    minTilesFirstMove: best,
    consecutivePasses: 0,
    lastMove: null,
    endReason: null,
    winnerIds: [],
  };
}

/** Validates and applies one action. Returns a new state; the input is not mutated. */
export function applyAction(state: GameState, playerId: string, action: Action, rng: Rng): ActionResult {
  if (state.status === 'finished') return fail('GAME_FINISHED');
  const index = state.players.findIndex((p) => p.id === playerId);
  if (index === -1) return fail('UNKNOWN_PLAYER');
  if (index !== state.currentPlayerIndex) return fail('NOT_YOUR_TURN');

  switch (action.type) {
    case 'place':
      return place(state, index, action.placements);
    case 'swap':
      return swap(state, index, action.tileIds, rng);
    case 'pass':
      return pass(state, index);
  }
}

/** Looks up the given tile ids in a hand. Fails on unknown or repeated ids. */
function takeFromHand(
  hand: readonly Tile[],
  tileIds: readonly string[],
): { ok: true; tiles: Tile[]; rest: Tile[] } | { ok: false; error: GameError } {
  if (new Set(tileIds).size !== tileIds.length) return { ok: false, error: 'DUPLICATE_TILE' };
  const tiles: Tile[] = [];
  for (const id of tileIds) {
    const tile = hand.find((t) => t.id === id);
    if (!tile) return { ok: false, error: 'TILE_NOT_IN_HAND' };
    tiles.push(tile);
  }
  const rest = hand.filter((t) => !tileIds.includes(t.id));
  return { ok: true, tiles, rest };
}

function place(state: GameState, index: number, input: Extract<Action, { type: 'place' }>['placements']): ActionResult {
  const player = state.players[index]!;
  const taken = takeFromHand(
    player.hand,
    input.map((p) => p.tileId),
  );
  if (!taken.ok) return fail(taken.error);

  if (isBoardEmpty(state.board) && input.length < state.minTilesFirstMove) {
    return fail('FIRST_MOVE_TOO_SHORT');
  }

  const placements: Placement[] = input.map((p, i) => ({ x: p.x, y: p.y, tile: taken.tiles[i]! }));
  const result = evaluatePlacement(state.board, placements);
  if (!result.ok) return fail(result.error);

  const board: Record<string, Tile> = { ...state.board };
  for (const p of placements) board[cellKey(p.x, p.y)] = p.tile;

  const drawCount = Math.min(HAND_SIZE - taken.rest.length, state.bag.length);
  const hand = [...taken.rest, ...state.bag.slice(0, drawCount)];
  const bag = state.bag.slice(drawCount);

  const emptiedHand = hand.length === 0 && bag.length === 0;
  const score = player.score + result.score + (emptiedHand ? END_BONUS : 0);
  const players = state.players.map((p, i) => (i === index ? { ...p, hand, score } : p));

  const next: GameState = {
    ...state,
    players,
    bag,
    board,
    minTilesFirstMove: 0,
    consecutivePasses: 0,
    lastMove: {
      type: 'place',
      playerId: player.id,
      placements,
      score: result.score,
      qwirkles: result.qwirkles,
    },
  };
  return { ok: true, state: emptiedHand ? finish(next, 'hand_emptied') : advance(next) };
}

function swap(state: GameState, index: number, tileIds: readonly string[], rng: Rng): ActionResult {
  if (isBoardEmpty(state.board)) return fail('FIRST_MOVE_MUST_PLACE');
  if (tileIds.length === 0) return fail('SWAP_EMPTY');
  const player = state.players[index]!;
  const taken = takeFromHand(player.hand, tileIds);
  if (!taken.ok) return fail(taken.error);
  if (tileIds.length > state.bag.length) return fail('SWAP_TOO_MANY');

  // Draw first, then return the swapped tiles, so nobody draws back their own tiles.
  const drawn = state.bag.slice(0, tileIds.length);
  const bag = shuffle([...state.bag.slice(tileIds.length), ...taken.tiles], rng);
  const players = state.players.map((p, i) => (i === index ? { ...p, hand: [...taken.rest, ...drawn] } : p));

  return {
    ok: true,
    state: advance({
      ...state,
      players,
      bag,
      consecutivePasses: 0,
      lastMove: { type: 'swap', playerId: player.id, count: tileIds.length },
    }),
  };
}

/** Passing is only allowed when the bag is empty and no tile in hand fits anywhere. */
export function canPass(state: GameState, playerId: string): boolean {
  const player = state.players.find((p) => p.id === playerId);
  if (!player || state.status !== 'playing') return false;
  return state.bag.length === 0 && !hasAnyValidPlacement(state.board, player.hand);
}

function pass(state: GameState, index: number): ActionResult {
  const player = state.players[index]!;
  if (!canPass(state, player.id)) return fail('PASS_NOT_ALLOWED');
  const next: GameState = {
    ...state,
    consecutivePasses: state.consecutivePasses + 1,
    lastMove: { type: 'pass', playerId: player.id },
  };
  // Everyone passed in a row: nobody can move any more.
  const blocked = next.consecutivePasses >= state.players.length;
  return { ok: true, state: blocked ? finish(next, 'blocked') : advance(next) };
}

function advance(state: GameState): GameState {
  return { ...state, currentPlayerIndex: (state.currentPlayerIndex + 1) % state.players.length };
}

function finish(state: GameState, endReason: EndReason): GameState {
  const top = Math.max(...state.players.map((p) => p.score));
  return {
    ...state,
    status: 'finished',
    endReason,
    winnerIds: state.players.filter((p) => p.score === top).map((p) => p.id),
  };
}

/** What one player may see: their own hand, but only the size of everyone else's and of the bag. */
export interface PlayerView {
  board: Board;
  bagCount: number;
  you: PlayerState;
  players: { id: string; name: string; score: number; handCount: number }[];
  currentPlayerId: string;
  isYourTurn: boolean;
  canPass: boolean;
  status: GameState['status'];
  minTilesFirstMove: number;
  lastMove: LastMove | null;
  endReason: EndReason | null;
  winnerIds: string[];
}

export function getPlayerView(state: GameState, playerId: string): PlayerView {
  const you = state.players.find((p) => p.id === playerId);
  if (!you) throw new Error(`Unknown player ${playerId}`);
  const currentPlayerId = state.players[state.currentPlayerIndex]!.id;
  return {
    board: state.board,
    bagCount: state.bag.length,
    you: { ...you, hand: [...you.hand] },
    players: state.players.map((p) => ({ id: p.id, name: p.name, score: p.score, handCount: p.hand.length })),
    currentPlayerId,
    isYourTurn: currentPlayerId === playerId && state.status === 'playing',
    canPass: currentPlayerId === playerId && canPass(state, playerId),
    status: state.status,
    minTilesFirstMove: state.minTilesFirstMove,
    lastMove: state.lastMove,
    endReason: state.endReason,
    winnerIds: state.winnerIds,
  };
}
