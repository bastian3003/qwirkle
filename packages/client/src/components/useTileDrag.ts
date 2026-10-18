import type { Tile } from '@qwirkle/game';
import { type PointerEvent as ReactPointerEvent, useCallback, useRef, useState } from 'react';

/** Movement in px before a press counts as dragging instead of a tap. */
const DRAG_THRESHOLD = 8;
/** On touch screens the dragged tile floats this far above the finger, so it stays visible. */
export const TOUCH_LIFT = 56;

export interface DragState<S> {
  tile: Tile;
  source: S;
  /** Where the tile is drawn and where it will land, in client coordinates. */
  x: number;
  y: number;
}

/**
 * Drag a tile with finger or mouse. A press that barely moves stays a normal tap;
 * the click that follows a real drag is swallowed via `consumeClick`.
 */
export function useTileDrag<S>(onDrop: (tile: Tile, source: S, x: number, y: number) => void) {
  const [drag, setDrag] = useState<DragState<S> | null>(null);
  const dragged = useRef(false);
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  const press = useCallback((e: ReactPointerEvent, tile: Tile, source: S) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const id = e.pointerId;
    const startX = e.clientX;
    const startY = e.clientY;
    const lift = e.pointerType === 'mouse' ? 0 : TOUCH_LIFT;
    let active = false;
    dragged.current = false;

    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      if (!active && Math.hypot(ev.clientX - startX, ev.clientY - startY) > DRAG_THRESHOLD) {
        active = true;
        dragged.current = true;
      }
      if (active) {
        ev.preventDefault();
        setDrag({ tile, source, x: ev.clientX, y: ev.clientY - lift });
      }
    };
    const end = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      if (active && ev.type === 'pointerup') onDropRef.current(tile, source, ev.clientX, ev.clientY - lift);
      setDrag(null);
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }, []);

  /** True (once) if the click being handled is the tail of a drag and should be ignored. */
  const consumeClick = useCallback(() => {
    const was = dragged.current;
    dragged.current = false;
    return was;
  }, []);

  return { drag, press, consumeClick };
}
