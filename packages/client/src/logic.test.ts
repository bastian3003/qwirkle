import { type Board, type Tile, cellKey } from '@qwirkle/game';
import { describe, expect, it } from 'vitest';
import { bounds, legalSlots, previewMove, withPending } from './logic';
import { lastMoveText } from './texts';

const t = (color: Tile['color'], shape: Tile['shape'], n = 0): Tile => ({ id: `${color}-${shape}-${n}`, color, shape });
const keys = (cells: { x: number; y: number }[]) => cells.map((c) => cellKey(c.x, c.y)).sort();

describe('legalSlots', () => {
  it('offers only the origin on an empty board', () => {
    expect(legalSlots({}, [], t('red', 'circle'))).toEqual([{ x: 0, y: 0 }]);
  });

  it('offers only cells where the tile fits', () => {
    const board: Board = { [cellKey(0, 0)]: t('red', 'circle') };
    // A red square fits on all four sides of a red circle.
    expect(keys(legalSlots(board, [], t('red', 'square')))).toEqual(['-1,0', '0,-1', '0,1', '1,0']);
    // A blue square fits nowhere.
    expect(legalSlots(board, [], t('blue', 'square'))).toEqual([]);
  });

  it('leaves the direction open after one pending tile', () => {
    const board: Board = { [cellKey(0, 0)]: t('red', 'circle') };
    const pending = [{ x: 1, y: 0, tile: t('red', 'square') }];
    // Along the row, or above/below the pending square.
    expect(keys(legalSlots(board, pending, t('red', 'star')))).toEqual(['-1,0', '1,-1', '1,1', '2,0']);
  });

  it('keeps the next tile in line once two tiles are pending', () => {
    const board: Board = { [cellKey(0, 0)]: t('red', 'circle') };
    const pending = [
      { x: 1, y: 0, tile: t('red', 'square') },
      { x: 2, y: 0, tile: t('red', 'diamond') },
    ];
    expect(keys(legalSlots(board, pending, t('red', 'star')))).toEqual(['-1,0', '3,0']);
  });
});

describe('previewMove', () => {
  it('is null without pending tiles', () => {
    expect(previewMove({}, [])).toBeNull();
  });

  it('scores the pending tiles with the shared rules', () => {
    const board: Board = { [cellKey(0, 0)]: t('red', 'circle') };
    expect(previewMove(board, [{ x: 1, y: 0, tile: t('red', 'square') }])).toMatchObject({ ok: true, score: 2 });
  });
});

describe('withPending', () => {
  it('adds pending tiles without changing the board', () => {
    const board: Board = {};
    const next = withPending(board, [{ x: 2, y: 3, tile: t('red', 'circle') }]);
    expect(next[cellKey(2, 3)]).toBeDefined();
    expect(board).toEqual({});
  });
});

describe('bounds', () => {
  it('spans all cells', () => {
    expect(bounds([{ x: -2, y: 1 }, { x: 3, y: -4 }])).toEqual({ minX: -2, maxX: 3, minY: -4, maxY: 1 });
    expect(bounds([])).toBeNull();
  });
});

describe('lastMoveText', () => {
  const nameOf = (id: string) => (id === 'p1' ? 'Mama' : 'Gabi');

  it('describes moves in German, from the viewer’s side', () => {
    const tile = t('red', 'circle');
    expect(lastMoveText({ type: 'place', playerId: 'p2', placements: [{ x: 0, y: 0, tile }], score: 1, qwirkles: 0 }, nameOf, 'p1')).toBe(
      'Gabi hat 1 Stein gelegt: +1 Punkt',
    );
    expect(lastMoveText({ type: 'place', playerId: 'p1', placements: [], score: 12, qwirkles: 1 }, nameOf, 'p1')).toBe(
      'Du hast 0 Steine gelegt: +12 Punkte – Qwirkle!',
    );
    expect(lastMoveText({ type: 'swap', playerId: 'p2', count: 3 }, nameOf, 'p1')).toBe('Gabi hat 3 Steine getauscht.');
    expect(lastMoveText({ type: 'pass', playerId: 'p1' }, nameOf, 'p1')).toBe('Du hast gepasst.');
  });
});
