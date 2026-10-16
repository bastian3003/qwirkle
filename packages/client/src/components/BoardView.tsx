import { type Board, type Placement, type Position, cellKey, parseCellKey } from '@qwirkle/game';
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { bounds } from '../logic';
import { TileFace, tileLabel } from './TileView';
import { MAX_SCALE, MIN_SCALE, usePanZoom } from './usePanZoom';

/** Size of one board cell in px at zoom 1. */
export const CELL = 60;
/** Fitting never zooms in further than this, so a near-empty board does not look huge. */
const FIT_MAX_SCALE = 1.2;

interface Props {
  board: Board;
  pending: readonly Placement[];
  /** Empty cells where the selected tile may go. */
  slots: readonly Position[];
  /** Cells of the last move, drawn with a marker. */
  highlight: ReadonlySet<string>;
  onSlotTap: (cell: Position) => void;
  onPendingTap: (cell: Position) => void;
  /** The board re-centers whenever this value changes. */
  fitKey: string | number;
}

export function BoardView({ board, pending, slots, highlight, onSlotTap, onPendingTap, fitKey }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const { view, setView, zoomBy } = usePanZoom(container);

  const tileCells = Object.keys(board).map(parseCellKey);
  const latest = useRef({ tileCells, pending });
  latest.current = { tileCells, pending };

  /** Zooms and centers so that every tile (plus a one-cell margin) is visible. */
  const fit = useCallback(() => {
    const el = container.current;
    if (!el || el.clientWidth === 0) return;
    const b = bounds([...latest.current.tileCells, ...latest.current.pending]) ?? { minX: 0, maxX: 0, minY: 0, maxY: 0 };
    const cols = b.maxX - b.minX + 3;
    const rows = b.maxY - b.minY + 3;
    const scale = Math.max(
      MIN_SCALE,
      Math.min(FIT_MAX_SCALE, MAX_SCALE, el.clientWidth / (cols * CELL), el.clientHeight / (rows * CELL)),
    );
    const cx = ((b.minX + b.maxX + 1) / 2) * CELL;
    const cy = ((b.minY + b.maxY + 1) / 2) * CELL;
    setView({ scale, x: el.clientWidth / 2 - cx * scale, y: el.clientHeight / 2 - cy * scale });
  }, [setView]);

  useLayoutEffect(fit, [fit, fitKey]);

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const observer = new ResizeObserver(() => fit());
    observer.observe(el);
    return () => observer.disconnect();
  }, [fit]);

  const place = (p: Position) => ({ left: p.x * CELL, top: p.y * CELL, width: CELL, height: CELL });

  return (
    <div className="board" ref={container} data-testid="board">
      <div
        className="board-inner"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
      >
        {Object.entries(board).map(([key, tile]) => {
          const p = parseCellKey(key);
          return (
            <div
              key={key}
              className={`cell tile${highlight.has(key) ? ' last' : ''}`}
              style={place(p)}
              data-x={p.x}
              data-y={p.y}
              role="img"
              aria-label={tileLabel(tile)}
            >
              <TileFace tile={tile} />
            </div>
          );
        })}
        {pending.map((p) => (
          <button
            key={cellKey(p.x, p.y)}
            className="cell tile pending"
            style={place(p)}
            data-x={p.x}
            data-y={p.y}
            aria-label={`${tileLabel(p.tile)} – antippen zum Zurücknehmen`}
            onClick={() => onPendingTap(p)}
          >
            <TileFace tile={p.tile} />
          </button>
        ))}
        {slots.map((s) => (
          <button
            key={cellKey(s.x, s.y)}
            className="cell slot"
            style={place(s)}
            data-x={s.x}
            data-y={s.y}
            data-testid="slot"
            aria-label="Hier legen"
            onClick={() => onSlotTap(s)}
          />
        ))}
      </div>
      <div className="board-controls">
        <button onClick={() => zoomBy(1.25)} aria-label="Vergrößern">+</button>
        <button onClick={() => zoomBy(0.8)} aria-label="Verkleinern">−</button>
        <button onClick={fit} aria-label="Ganzes Brett zeigen">⤢</button>
      </div>
    </div>
  );
}
