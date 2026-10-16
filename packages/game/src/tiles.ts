import { type Rng, shuffle } from './random';

export const COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'] as const;
export const SHAPES = ['circle', 'square', 'diamond', 'star', 'clover', 'cross'] as const;
export const COPIES_PER_TILE = 3;
export const HAND_SIZE = 6;
/** A line can never be longer than this, because no tile may appear twice in it. */
export const MAX_LINE_LENGTH = 6;

export type Color = (typeof COLORS)[number];
export type Shape = (typeof SHAPES)[number];

export interface Tile {
  /** Unique per physical tile, e.g. "red-circle-2". */
  id: string;
  color: Color;
  shape: Shape;
}

/** All 108 tiles: 6 colors x 6 shapes x 3 copies. */
export function createAllTiles(): Tile[] {
  const tiles: Tile[] = [];
  for (const color of COLORS) {
    for (const shape of SHAPES) {
      for (let copy = 0; copy < COPIES_PER_TILE; copy++) {
        tiles.push({ id: `${color}-${shape}-${copy}`, color, shape });
      }
    }
  }
  return tiles;
}

export function createBag(rng: Rng): Tile[] {
  return shuffle(createAllTiles(), rng);
}

/** True if both tiles look the same (same color and shape), regardless of copy. */
export function sameKind(a: Tile, b: Tile): boolean {
  return a.color === b.color && a.shape === b.shape;
}
