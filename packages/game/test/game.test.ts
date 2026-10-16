import { describe, expect, it } from 'vitest';
import { cellKey } from '../src/board';
import { type GameState, applyAction, createGame, getPlayerView } from '../src/game';
import { seededRng } from '../src/random';
import { longestStartLine } from '../src/rules';
import { board, makeState, tile } from './helpers';

const rng = seededRng(1);
const players = [
  { id: 'p1', name: 'Mama' },
  { id: 'p2', name: 'Freundin' },
];

function ok(result: ReturnType<typeof applyAction>): GameState {
  if (!result.ok) throw new Error(`Expected success, got ${result.error}`);
  return result.state;
}

/** Five filler tiles that do not fit next to a red circle on their own. */
function filler(): ReturnType<typeof tile>[] {
  return [tile('blue', 'square'), tile('green', 'diamond'), tile('yellow', 'star'), tile('purple', 'clover'), tile('orange', 'cross')];
}

describe('createGame', () => {
  it('deals 6 tiles to each player and leaves 96 in the bag', () => {
    const g = createGame(players, seededRng(42));
    expect(g.players.map((p) => p.hand.length)).toEqual([6, 6]);
    expect(g.bag).toHaveLength(96);
    const ids = [...g.bag, ...g.players.flatMap((p) => p.hand)].map((t) => t.id);
    expect(new Set(ids).size).toBe(108);
  });

  it('lets the player with the longest possible line start, and requires that many tiles', () => {
    for (let seed = 0; seed < 200; seed++) {
      const g = createGame(players, seededRng(seed));
      const lengths = g.players.map((p) => longestStartLine(p.hand));
      expect(lengths[g.currentPlayerIndex]).toBe(Math.max(...lengths));
      expect(g.minTilesFirstMove).toBe(Math.max(...lengths));
    }
  });

  it('breaks ties at random', () => {
    const startersOnTie = new Set<number>();
    for (let seed = 0; seed < 500; seed++) {
      const g = createGame(players, seededRng(seed));
      const [a, b] = g.players.map((p) => longestStartLine(p.hand));
      if (a === b) startersOnTie.add(g.currentPlayerIndex);
    }
    expect(startersOnTie).toEqual(new Set([0, 1]));
  });

  it('rejects too few players and duplicate ids', () => {
    expect(() => createGame([players[0]!], rng)).toThrow();
    expect(() => createGame([players[0]!, players[0]!], rng)).toThrow();
  });
});

describe('turn checks', () => {
  const rc = tile('red', 'circle');
  const state = makeState({ hands: [[rc], [tile('blue', 'circle')]], bag: filler() });

  it('rejects moves by the player whose turn it is not', () => {
    expect(applyAction(state, 'p2', { type: 'place', placements: [] }, rng)).toEqual({ ok: false, error: 'NOT_YOUR_TURN' });
  });

  it('rejects unknown players', () => {
    expect(applyAction(state, 'x', { type: 'pass' }, rng)).toEqual({ ok: false, error: 'UNKNOWN_PLAYER' });
  });

  it('rejects tiles that are not in the hand', () => {
    const r = applyAction(state, 'p1', { type: 'place', placements: [{ x: 0, y: 0, tileId: 'nope' }] }, rng);
    expect(r).toEqual({ ok: false, error: 'TILE_NOT_IN_HAND' });
  });

  it("rejects the opponent's tiles", () => {
    const opponentTile = state.players[1]!.hand[0]!.id;
    const r = applyAction(state, 'p1', { type: 'place', placements: [{ x: 0, y: 0, tileId: opponentTile }] }, rng);
    expect(r).toEqual({ ok: false, error: 'TILE_NOT_IN_HAND' });
  });

  it('rejects using the same tile twice', () => {
    const r = applyAction(
      state,
      'p1',
      { type: 'place', placements: [{ x: 0, y: 0, tileId: rc.id }, { x: 1, y: 0, tileId: rc.id }] },
      rng,
    );
    expect(r).toEqual({ ok: false, error: 'DUPLICATE_TILE' });
  });

  it('rejects any action after the game has finished', () => {
    const finished: GameState = { ...state, status: 'finished' };
    expect(applyAction(finished, 'p1', { type: 'pass' }, rng)).toEqual({ ok: false, error: 'GAME_FINISHED' });
  });
});

describe('first move', () => {
  const hand = [tile('red', 'circle'), tile('red', 'square'), tile('red', 'star'), tile('blue', 'cross'), tile('green', 'clover'), tile('yellow', 'diamond')];
  const state = makeState({ hands: [hand, filler()], bag: filler(), minTilesFirstMove: 3 });

  it('must contain at least as many tiles as the longest start line', () => {
    const r = applyAction(
      state,
      'p1',
      { type: 'place', placements: [{ x: 0, y: 0, tileId: hand[0]!.id }, { x: 1, y: 0, tileId: hand[1]!.id }] },
      rng,
    );
    expect(r).toEqual({ ok: false, error: 'FIRST_MOVE_TOO_SHORT' });
  });

  it('cannot be a swap', () => {
    expect(applyAction(state, 'p1', { type: 'swap', tileIds: [hand[0]!.id] }, rng)).toEqual({
      ok: false,
      error: 'FIRST_MOVE_MUST_PLACE',
    });
  });

  it('is scored normally and lifts the requirement', () => {
    const next = ok(
      applyAction(
        state,
        'p1',
        {
          type: 'place',
          placements: [0, 1, 2].map((i) => ({ x: i, y: 0, tileId: hand[i]!.id })),
        },
        rng,
      ),
    );
    expect(next.players[0]!.score).toBe(3);
    expect(next.minTilesFirstMove).toBe(0);
  });
});

describe('placing', () => {
  const rc = tile('red', 'circle');
  const rs = tile('red', 'square');
  const bag = filler();
  const state = makeState({
    hands: [[rs, ...filler()], filler()],
    bag,
    board: board([0, 0, rc]),
    scores: [10, 0],
  });

  const next = ok(applyAction(state, 'p1', { type: 'place', placements: [{ x: 1, y: 0, tileId: rs.id }] }, rng));

  it('puts the tile on the board and adds the points', () => {
    expect(next.board[cellKey(1, 0)]).toEqual(rs);
    expect(next.players[0]!.score).toBe(12);
  });

  it('refills the hand from the bag', () => {
    expect(next.players[0]!.hand).toHaveLength(6);
    expect(next.players[0]!.hand).toContainEqual(bag[0]);
    expect(next.bag).toHaveLength(bag.length - 1);
  });

  it('passes the turn on and records the move', () => {
    expect(next.currentPlayerIndex).toBe(1);
    expect(next.lastMove).toMatchObject({ type: 'place', playerId: 'p1', score: 2 });
  });

  it('does not change the original state', () => {
    expect(state.board[cellKey(1, 0)]).toBeUndefined();
    expect(state.players[0]!.hand).toContain(rs);
    expect(state.bag).toHaveLength(bag.length);
  });

  it('passes placement errors through', () => {
    const r = applyAction(state, 'p1', { type: 'place', placements: [{ x: 5, y: 5, tileId: rs.id }] }, rng);
    expect(r).toEqual({ ok: false, error: 'NOT_CONNECTED' });
  });

  it('draws only what is left in the bag', () => {
    const tiny = makeState({ hands: [[rs, ...filler()], filler()], bag: [tile('red', 'cross')], board: board([0, 0, rc]) });
    const r = ok(applyAction(tiny, 'p1', { type: 'place', placements: [{ x: 1, y: 0, tileId: rs.id }] }, rng));
    expect(r.players[0]!.hand).toHaveLength(6);
    expect(r.bag).toHaveLength(0);
  });
});

describe('swapping', () => {
  const hand = filler();
  const bag = [tile('red', 'circle', 0), tile('red', 'circle', 1), tile('red', 'circle', 2)];
  const state = makeState({ hands: [hand, filler()], bag, board: board([0, 0, tile('red', 'star')]) });

  it('swaps tiles without points and keeps the bag size', () => {
    const next = ok(applyAction(state, 'p1', { type: 'swap', tileIds: [hand[0]!.id, hand[1]!.id] }, rng));
    const newHand = next.players[0]!.hand;
    expect(newHand).toHaveLength(5);
    expect(newHand).not.toContainEqual(hand[0]);
    expect(newHand).not.toContainEqual(hand[1]);
    expect(newHand.filter((t) => t.color === 'red')).toHaveLength(2);
    expect(next.bag).toHaveLength(3);
    expect(next.bag).toContainEqual(hand[0]);
    expect(next.players[0]!.score).toBe(0);
    expect(next.currentPlayerIndex).toBe(1);
    expect(next.lastMove).toEqual({ type: 'swap', playerId: 'p1', count: 2 });
  });

  it('allows at most as many tiles as the bag holds', () => {
    const r = applyAction(state, 'p1', { type: 'swap', tileIds: hand.slice(0, 4).map((t) => t.id) }, rng);
    expect(r).toEqual({ ok: false, error: 'SWAP_TOO_MANY' });
  });

  it('is impossible with an empty bag', () => {
    const empty = { ...state, bag: [] };
    expect(applyAction(empty, 'p1', { type: 'swap', tileIds: [hand[0]!.id] }, rng)).toEqual({
      ok: false,
      error: 'SWAP_TOO_MANY',
    });
  });

  it('needs at least one tile', () => {
    expect(applyAction(state, 'p1', { type: 'swap', tileIds: [] }, rng)).toEqual({ ok: false, error: 'SWAP_EMPTY' });
  });
});

describe('end of game', () => {
  it('gives 6 bonus points and ends the game when the last tile is placed with an empty bag', () => {
    const rs = tile('red', 'square');
    const state = makeState({ hands: [[rs], filler()], board: board([0, 0, tile('red', 'circle')]), scores: [0, 5] });
    const next = ok(applyAction(state, 'p1', { type: 'place', placements: [{ x: 1, y: 0, tileId: rs.id }] }, rng));
    expect(next.players[0]!.score).toBe(2 + 6);
    expect(next.status).toBe('finished');
    expect(next.endReason).toBe('hand_emptied');
    expect(next.winnerIds).toEqual(['p1']);
  });

  it('does not end the game when the hand is emptied while the bag still has tiles', () => {
    const rs = tile('red', 'square');
    const state = makeState({ hands: [[rs], filler()], bag: filler(), board: board([0, 0, tile('red', 'circle')]) });
    const next = ok(applyAction(state, 'p1', { type: 'place', placements: [{ x: 1, y: 0, tileId: rs.id }] }, rng));
    expect(next.status).toBe('playing');
    expect(next.players[0]!.score).toBe(2);
  });
});

describe('passing', () => {
  // Only a red circle on the board; neither hand has a tile that fits.
  const stuckHands = () => [[tile('blue', 'square'), tile('red', 'circle')], [tile('green', 'star')]];
  const b = board([0, 0, tile('red', 'circle')]);

  it('is not allowed while the bag has tiles', () => {
    const state = makeState({ hands: stuckHands(), bag: filler(), board: b });
    expect(applyAction(state, 'p1', { type: 'pass' }, rng)).toEqual({ ok: false, error: 'PASS_NOT_ALLOWED' });
  });

  it('is not allowed when a tile could be placed', () => {
    const state = makeState({ hands: [[tile('red', 'star')], [tile('green', 'star')]], board: b });
    expect(applyAction(state, 'p1', { type: 'pass' }, rng)).toEqual({ ok: false, error: 'PASS_NOT_ALLOWED' });
  });

  it('ends the game without bonus when everyone passes in a row', () => {
    const state = makeState({ hands: stuckHands(), board: b, scores: [7, 7] });
    const afterFirst = ok(applyAction(state, 'p1', { type: 'pass' }, rng));
    expect(afterFirst.status).toBe('playing');
    expect(afterFirst.currentPlayerIndex).toBe(1);

    const afterSecond = ok(applyAction(afterFirst, 'p2', { type: 'pass' }, rng));
    expect(afterSecond.status).toBe('finished');
    expect(afterSecond.endReason).toBe('blocked');
    expect(afterSecond.players.map((p) => p.score)).toEqual([7, 7]);
    expect(afterSecond.winnerIds).toEqual(['p1', 'p2']);
  });

  it('starts counting again after a placement', () => {
    const rs = tile('red', 'square');
    const state = makeState({ hands: [[tile('blue', 'square')], [rs, tile('blue', 'cross')]], board: b });
    const afterPass = ok(applyAction(state, 'p1', { type: 'pass' }, rng));
    const afterPlace = ok(applyAction(afterPass, 'p2', { type: 'place', placements: [{ x: 1, y: 0, tileId: rs.id }] }, rng));
    expect(afterPlace.consecutivePasses).toBe(0);
    expect(afterPlace.status).toBe('playing');
  });
});

describe('getPlayerView', () => {
  it("never contains the opponent's hand or the bag", () => {
    const g = createGame(players, seededRng(7));
    const view = getPlayerView(g, 'p1');
    const json = JSON.stringify(view);
    for (const t of [...g.players[1]!.hand, ...g.bag]) {
      expect(json).not.toContain(t.id);
    }
    expect(view.you.hand).toEqual(g.players[0]!.hand);
    expect(view.players.find((p) => p.id === 'p2')).toEqual({ id: 'p2', name: 'Freundin', score: 0, handCount: 6 });
    expect(view.bagCount).toBe(96);
  });

  it('says whose turn it is', () => {
    const g = createGame(players, seededRng(7));
    const current = g.players[g.currentPlayerIndex]!.id;
    const other = current === 'p1' ? 'p2' : 'p1';
    expect(getPlayerView(g, current).isYourTurn).toBe(true);
    expect(getPlayerView(g, other).isYourTurn).toBe(false);
  });
});
