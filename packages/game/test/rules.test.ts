import { describe, expect, it } from 'vitest';
import { EMPTY_BOARD } from '../src/board';
import {
  type Placement,
  evaluatePlacement,
  hasAnyValidPlacement,
  isValidLine,
  longestStartLine,
} from '../src/rules';
import { board, tile } from './helpers';

function at(x: number, y: number, t: ReturnType<typeof tile>): Placement {
  return { x, y, tile: t };
}

function scoreOf(result: ReturnType<typeof evaluatePlacement>): number {
  if (!result.ok) throw new Error(`Expected a valid move, got ${result.error}`);
  return result.score;
}

describe('isValidLine', () => {
  it('accepts one color with different shapes', () => {
    expect(isValidLine([tile('red', 'circle'), tile('red', 'square'), tile('red', 'star')])).toBe(true);
  });

  it('accepts one shape with different colors', () => {
    expect(isValidLine([tile('red', 'star'), tile('blue', 'star'), tile('green', 'star')])).toBe(true);
  });

  it('accepts a single tile', () => {
    expect(isValidLine([tile('red', 'star')])).toBe(true);
  });

  it('rejects the same tile twice', () => {
    expect(isValidLine([tile('red', 'star'), tile('red', 'star')])).toBe(false);
  });

  it('rejects a repeated shape within one color', () => {
    expect(isValidLine([tile('red', 'star'), tile('red', 'circle'), tile('red', 'star')])).toBe(false);
  });

  it('rejects mixed colors and shapes', () => {
    expect(isValidLine([tile('red', 'star'), tile('blue', 'circle')])).toBe(false);
  });

  it('rejects a line that shares color with one tile and shape with another', () => {
    expect(isValidLine([tile('red', 'star'), tile('red', 'circle'), tile('blue', 'circle')])).toBe(false);
  });

  it('accepts all six shapes of one color', () => {
    const line = (['circle', 'square', 'diamond', 'star', 'clover', 'cross'] as const).map((s) => tile('blue', s));
    expect(isValidLine(line)).toBe(true);
  });
});

describe('evaluatePlacement: validity', () => {
  const b = board([0, 0, tile('red', 'circle')], [1, 0, tile('red', 'square')]);

  it('rejects an empty move', () => {
    expect(evaluatePlacement(b, [])).toEqual({ ok: false, error: 'EMPTY_MOVE' });
  });

  it('rejects two tiles on the same cell', () => {
    const r = evaluatePlacement(b, [at(2, 0, tile('red', 'star')), at(2, 0, tile('red', 'cross'))]);
    expect(r).toEqual({ ok: false, error: 'DUPLICATE_CELL' });
  });

  it('rejects a cell that is already taken', () => {
    expect(evaluatePlacement(b, [at(0, 0, tile('red', 'star'))])).toEqual({ ok: false, error: 'CELL_OCCUPIED' });
  });

  it('rejects tiles that are not in one row or column', () => {
    const r = evaluatePlacement(b, [at(2, 0, tile('red', 'star')), at(2, 1, tile('red', 'cross')), at(3, 1, tile('red', 'clover'))]);
    expect(r).toEqual({ ok: false, error: 'NOT_IN_LINE' });
  });

  it('rejects a row with an empty gap', () => {
    const r = evaluatePlacement(b, [at(2, 0, tile('red', 'star')), at(4, 0, tile('red', 'cross'))]);
    expect(r).toEqual({ ok: false, error: 'GAP_IN_LINE' });
  });

  it('rejects tiles that touch nothing on the board', () => {
    expect(evaluatePlacement(b, [at(5, 5, tile('red', 'star'))])).toEqual({ ok: false, error: 'NOT_CONNECTED' });
  });

  it('rejects a move that breaks the main line', () => {
    expect(evaluatePlacement(b, [at(2, 0, tile('blue', 'star'))])).toEqual({ ok: false, error: 'INVALID_LINE' });
  });

  it('rejects a move that is fine along its row but breaks a crossing column', () => {
    // Row y=1 would be valid on its own, but (0,1) sits under the red circle.
    const r = evaluatePlacement(b, [at(0, 1, tile('blue', 'star')), at(1, 1, tile('green', 'star'))]);
    expect(r).toEqual({ ok: false, error: 'INVALID_LINE' });
  });

  it('rejects a line longer than six', () => {
    const shapes = ['circle', 'square', 'diamond', 'star', 'clover', 'cross'] as const;
    const full = board(...shapes.map((s, i) => [i, 0, tile('red', s)] as [number, number, ReturnType<typeof tile>]));
    expect(evaluatePlacement(full, [at(6, 0, tile('red', 'circle'))])).toEqual({ ok: false, error: 'INVALID_LINE' });
  });

  it('rejects a duplicate tile placed in the same move', () => {
    const r = evaluatePlacement(b, [at(2, 0, tile('red', 'star')), at(3, 0, tile('red', 'star'))]);
    expect(r).toEqual({ ok: false, error: 'INVALID_LINE' });
  });

  it('allows a gap that is filled by a tile already on the board', () => {
    // New tiles at -1 and 2, the existing red circle and square fill 0 and 1.
    const r = evaluatePlacement(b, [at(-1, 0, tile('red', 'star')), at(2, 0, tile('red', 'cross'))]);
    expect(scoreOf(r)).toBe(4);
  });
});

describe('evaluatePlacement: scoring', () => {
  it('scores 1 for a single tile on an empty board', () => {
    expect(scoreOf(evaluatePlacement(EMPTY_BOARD, [at(0, 0, tile('red', 'circle'))]))).toBe(1);
  });

  it('counts the shared line of a multi-tile move only once', () => {
    const r = evaluatePlacement(EMPTY_BOARD, [
      at(0, 0, tile('red', 'circle')),
      at(1, 0, tile('red', 'square')),
      at(2, 0, tile('red', 'star')),
    ]);
    expect(scoreOf(r)).toBe(3);
  });

  it('counts the tiles already in a line that is extended', () => {
    const b = board([0, 0, tile('red', 'circle')], [1, 0, tile('red', 'square')]);
    expect(scoreOf(evaluatePlacement(b, [at(2, 0, tile('red', 'star'))]))).toBe(3);
  });

  it('counts a tile that sits in two lines twice', () => {
    // Red circle to the left, red square below: the red diamond joins both.
    const b = board([0, 0, tile('red', 'circle')], [1, 1, tile('red', 'square')]);
    const r = evaluatePlacement(b, [at(1, 0, tile('red', 'diamond'))]);
    expect(scoreOf(r)).toBe(4);
    if (r.ok) expect(r.lines.map((l) => l.direction).sort()).toEqual(['horizontal', 'vertical']);
  });

  it('does not count a direction in which the tile has no neighbor', () => {
    const b = board([0, 0, tile('red', 'circle')]);
    const r = evaluatePlacement(b, [at(0, 1, tile('blue', 'circle'))]);
    expect(scoreOf(r)).toBe(2);
    if (r.ok) expect(r.lines).toHaveLength(1);
  });

  it('adds every crossing line of a multi-tile move', () => {
    //  y=0:  R●  R■
    //  y=1:  B●  B■   <- placed
    const b = board([0, 0, tile('red', 'circle')], [1, 0, tile('red', 'square')]);
    const r = evaluatePlacement(b, [at(0, 1, tile('blue', 'circle')), at(1, 1, tile('blue', 'square'))]);
    // row B●B■ = 2, column R●B● = 2, column R■B■ = 2
    expect(scoreOf(r)).toBe(6);
  });

  it('scores tiles placed on both sides of an existing tile as one line', () => {
    const b = board([0, 0, tile('red', 'circle')]);
    const r = evaluatePlacement(b, [at(-1, 0, tile('red', 'star')), at(1, 0, tile('red', 'cross'))]);
    expect(scoreOf(r)).toBe(3);
  });

  it('gives 12 points for completing a Qwirkle', () => {
    const shapes = ['circle', 'square', 'diamond', 'star', 'clover'] as const;
    const b = board(...shapes.map((s, i) => [i, 0, tile('green', s)] as [number, number, ReturnType<typeof tile>]));
    const r = evaluatePlacement(b, [at(5, 0, tile('green', 'cross'))]);
    expect(scoreOf(r)).toBe(12);
    if (r.ok) expect(r.qwirkles).toBe(1);
  });

  it('gives 12 points for a Qwirkle laid in one move from scratch', () => {
    const colors = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'] as const;
    const r = evaluatePlacement(EMPTY_BOARD, colors.map((c, i) => at(0, i, tile(c, 'star'))));
    expect(scoreOf(r)).toBe(12);
  });

  it('adds a Qwirkle bonus for each completed line', () => {
    // A row of 5 orange tiles and a column of 5 clovers both end next to (5,5).
    const shapes = ['circle', 'square', 'diamond', 'star', 'cross'] as const;
    const colors = ['red', 'yellow', 'green', 'blue', 'purple'] as const;
    const cells: [number, number, ReturnType<typeof tile>][] = [
      ...shapes.map((s, i) => [i, 5, tile('orange', s)] as [number, number, ReturnType<typeof tile>]),
      ...colors.map((c, i) => [5, i, tile(c, 'clover')] as [number, number, ReturnType<typeof tile>]),
    ];
    const r = evaluatePlacement(board(...cells), [at(5, 5, tile('orange', 'clover'))]);
    expect(scoreOf(r)).toBe(24);
    if (r.ok) expect(r.qwirkles).toBe(2);
  });

  it('does not give a bonus for a line of five', () => {
    const shapes = ['circle', 'square', 'diamond', 'star'] as const;
    const b = board(...shapes.map((s, i) => [i, 0, tile('green', s)] as [number, number, ReturnType<typeof tile>]));
    expect(scoreOf(evaluatePlacement(b, [at(4, 0, tile('green', 'cross'))]))).toBe(5);
  });
});

describe('hasAnyValidPlacement', () => {
  it('is true on an empty board with tiles in hand', () => {
    expect(hasAnyValidPlacement(EMPTY_BOARD, [tile('red', 'circle')])).toBe(true);
  });

  it('is false with an empty hand', () => {
    expect(hasAnyValidPlacement(EMPTY_BOARD, [])).toBe(false);
  });

  it('finds a fitting tile', () => {
    const b = board([0, 0, tile('red', 'circle')]);
    expect(hasAnyValidPlacement(b, [tile('blue', 'square'), tile('red', 'star')])).toBe(true);
  });

  it('is false when nothing fits', () => {
    const b = board([0, 0, tile('red', 'circle')]);
    expect(hasAnyValidPlacement(b, [tile('blue', 'square'), tile('red', 'circle')])).toBe(false);
  });
});

describe('longestStartLine', () => {
  it('finds the most different shapes of one color', () => {
    const hand = [tile('red', 'circle'), tile('red', 'square'), tile('red', 'star'), tile('blue', 'circle'), tile('green', 'cross'), tile('yellow', 'clover')];
    expect(longestStartLine(hand)).toBe(3);
  });

  it('finds the most different colors of one shape', () => {
    const hand = [tile('red', 'star'), tile('blue', 'star'), tile('green', 'star'), tile('purple', 'star'), tile('red', 'circle'), tile('green', 'cross')];
    expect(longestStartLine(hand)).toBe(4);
  });

  it('ignores duplicates', () => {
    const hand = [tile('red', 'star'), tile('red', 'star'), tile('red', 'star'), tile('blue', 'circle'), tile('green', 'cross'), tile('yellow', 'clover')];
    expect(longestStartLine(hand)).toBe(1);
  });
});
