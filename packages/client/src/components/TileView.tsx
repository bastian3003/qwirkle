import type { Color, Shape, Tile } from '@qwirkle/game';
import type { ReactElement } from 'react';
import { COLOR_NAMES, SHAPE_NAMES } from '../texts';

/** Bright, clearly different colors on a dark tile, like the real game. */
export const TILE_COLORS: Record<Color, string> = {
  red: '#ff3b30',
  orange: '#ff8a00',
  yellow: '#ffd60a',
  green: '#30d158',
  blue: '#0a84ff',
  purple: '#c86bfa',
};

function starPoints(spikes: number, outer: number, inner: number): string {
  const points: string[] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI * i) / spikes - Math.PI / 2;
    points.push(`${(50 + r * Math.cos(a)).toFixed(1)},${(50 + r * Math.sin(a)).toFixed(1)}`);
  }
  return points.join(' ');
}

const STAR = starPoints(8, 36, 17);

const SHAPES: Record<Shape, ReactElement> = {
  circle: <circle cx="50" cy="50" r="29" />,
  square: <rect x="23" y="23" width="54" height="54" rx="4" />,
  diamond: <polygon points="50,14 86,50 50,86 14,50" />,
  star: <polygon points={STAR} />,
  clover: (
    <g>
      <circle cx="50" cy="31" r="16" />
      <circle cx="50" cy="69" r="16" />
      <circle cx="31" cy="50" r="16" />
      <circle cx="69" cy="50" r="16" />
      <circle cx="50" cy="50" r="14" />
    </g>
  ),
  cross: (
    <g transform="rotate(45 50 50)">
      <rect x="41" y="13" width="18" height="74" rx="3" />
      <rect x="13" y="41" width="74" height="18" rx="3" />
    </g>
  ),
};

export function tileLabel(tile: Tile): string {
  return `${SHAPE_NAMES[tile.shape]}, ${COLOR_NAMES[tile.color]}`;
}

/** The tile face as SVG. Size comes from the surrounding element. */
export function TileFace({ tile }: { tile: Tile }) {
  return (
    <svg viewBox="0 0 100 100" className="tile-face" aria-hidden="true">
      <rect x="2" y="2" width="96" height="96" rx="14" fill="#1d1d22" />
      <g fill={TILE_COLORS[tile.color]}>{SHAPES[tile.shape]}</g>
    </svg>
  );
}
