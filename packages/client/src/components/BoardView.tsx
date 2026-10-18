import { type Board, type Placement, type Position, cellKey, parseCellKey } from '@qwirkle/game';
import {
  type MouseEvent,
  type PointerEvent,
  type Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from 'react';
import { bounds } from '../logic';
import { TileFace, tileLabel } from './TileView';
import { MAX_SCALE, MIN_SCALE, usePanZoom } from './usePanZoom';

/** Size of one board cell in px at zoom 1. */
export const CELL = 60;
/** Fitting never zooms in further than this, so a near-empty board does not look huge. */
const FIT_MAX_SCALE = 1.2;

export interface BoardHandle {
  /** The board cell under a screen point, or null if the point is outside the board. */
  cellAt: (clientX: number, clientY: number) => Position | null;
}

interface Props {
  handle: Ref<BoardHandle>;
  board: Board;
  pending: readonly Placement[];
  /** Cells of the last move, drawn with a marker. */
  highlight: ReadonlySet<string>;
  /** Where a dragged tile would land; drawn as a faint outline under the finger. */
  dropTarget: Position | null;
  /** Pending tile currently being dragged; drawn faded at its old place. */
  draggingFrom: Position | null;
  /** A tap on a free cell. */
  onEmptyCellTap: (cell: Position) => void;
  onPendingTap: (cell: Position) => void;
  /** Pressing a pending tile, which may turn into a drag. */
  onPendingPress: (e: PointerEvent, placement: Placement) => void;
  /** The board re-centers whenever this value changes. */
  fitKey: string | number;
}

export function BoardView(props: Props) {
  const { handle, board, pending, highlight, dropTarget, draggingFrom, onEmptyCellTap, onPendingTap, onPendingPress, fitKey } =
    props;
  const container = useRef<HTMLDivElement>(null);
  const { view, setView, zoomBy } = usePanZoom(container);

  const latest = useRef({ board, pending, view });
  latest.current = { board, pending, view };

  const cellAt = useCallback((clientX: number, clientY: number): Position | null => {
    const el = container.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) return null;
    const { view: v } = latest.current;
    return {
      x: Math.floor((clientX - r.left - v.x) / v.scale / CELL),
      y: Math.floor((clientY - r.top - v.y) / v.scale / CELL),
    };
  }, []);

  useImperativeHandle(handle, () => ({ cellAt }), [cellAt]);

  /** Zooms and centers so that every tile (plus a one-cell margin) is visible. */
  const fit = useCallback(() => {
    const el = container.current;
    if (!el || el.clientWidth === 0) return;
    const cells = [...Object.keys(latest.current.board).map(parseCellKey), ...latest.current.pending];
    const b = bounds(cells) ?? { minX: 0, maxX: 0, minY: 0, maxY: 0 };
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

  /** Taps on the empty board (not on a tile or a button) place the selected tile. */
  function onBoardClick(e: MouseEvent) {
    if ((e.target as HTMLElement).closest('button, .cell')) return;
    const cell = cellAt(e.clientX, e.clientY);
    if (cell && !board[cellKey(cell.x, cell.y)] && !pending.some((p) => p.x === cell.x && p.y === cell.y)) {
      onEmptyCellTap(cell);
    }
  }

  const place = (p: Position) => ({ left: p.x * CELL, top: p.y * CELL, width: CELL, height: CELL });
  const cellPx = CELL * view.scale;

  return (
    <div
      className="board"
      ref={container}
      data-testid="board"
      onClick={onBoardClick}
      // Faint dots on the cell corners move and scale with the board, so cells are easy to aim at.
      style={{ backgroundSize: `${cellPx}px ${cellPx}px`, backgroundPosition: `${view.x}px ${view.y}px` }}
    >
      <div className="board-inner" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
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
        {pending.map((p) => {
          const lifted = draggingFrom?.x === p.x && draggingFrom.y === p.y;
          return (
            <button
              key={cellKey(p.x, p.y)}
              className={`cell tile pending${lifted ? ' lifted' : ''}`}
              style={place(p)}
              data-x={p.x}
              data-y={p.y}
              data-draggable
              aria-label={`${tileLabel(p.tile)} – antippen zum Zurücknehmen`}
              onPointerDown={(e) => onPendingPress(e, p)}
              onClick={() => onPendingTap(p)}
            >
              <TileFace tile={p.tile} />
            </button>
          );
        })}
        {dropTarget && <div className="cell drop-target" style={place(dropTarget)} data-testid="drop-target" />}
      </div>
      <div className="board-controls">
        <button onClick={() => zoomBy(1.25)} aria-label="Vergrößern">+</button>
        <button onClick={() => zoomBy(0.8)} aria-label="Verkleinern">−</button>
        <button onClick={fit} aria-label="Ganzes Brett zeigen">⤢</button>
      </div>
    </div>
  );
}
