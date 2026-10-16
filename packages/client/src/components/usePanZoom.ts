import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';

export interface View {
  x: number;
  y: number;
  scale: number;
}

export const MIN_SCALE = 0.3;
export const MAX_SCALE = 2.5;
/** Movement in px before a touch counts as dragging instead of a tap. */
const DRAG_THRESHOLD = 8;

const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

interface Point {
  x: number;
  y: number;
}

/**
 * One finger (or mouse) drags the board, two fingers pinch-zoom, the mouse wheel zooms.
 * A drag swallows the click that would follow, so moving the board never places a tile.
 */
export function usePanZoom(container: RefObject<HTMLElement | null>) {
  const [view, setViewState] = useState<View>({ x: 0, y: 0, scale: 1 });
  const viewRef = useRef(view);

  const setView = useCallback((v: View) => {
    viewRef.current = v;
    setViewState(v);
  }, []);

  /** Zooms by `factor` keeping the screen point `at` (container coordinates) fixed. */
  const zoomAt = useCallback(
    (factor: number, at: Point) => {
      const v = viewRef.current;
      const scale = clampScale(v.scale * factor);
      const k = scale / v.scale;
      setView({ scale, x: at.x - (at.x - v.x) * k, y: at.y - (at.y - v.y) * k });
    },
    [setView],
  );

  const zoomBy = useCallback(
    (factor: number) => {
      const el = container.current;
      if (el) zoomAt(factor, { x: el.clientWidth / 2, y: el.clientHeight / 2 });
    },
    [container, zoomAt],
  );

  useEffect(() => {
    const el = container.current;
    if (!el) return;

    const pointers = new Map<number, Point>();
    let start: Point | null = null;
    let last: Point | null = null;
    let dragged = false;
    let pinch: { dist: number; mid: Point; view: View } | null = null;

    const local = (e: PointerEvent | WheelEvent): Point => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const twoFingers = () => {
      const [a, b] = [...pointers.values()] as [Point, Point];
      return { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
    };

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const p = local(e);
      pointers.set(e.pointerId, p);
      if (pointers.size === 1) {
        start = p;
        last = p;
        dragged = false;
      } else if (pointers.size === 2) {
        dragged = true;
        pinch = { ...twoFingers(), view: viewRef.current };
      }
    };

    const onMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      const p = local(e);
      pointers.set(e.pointerId, p);

      if (pointers.size === 1 && start && last) {
        if (!dragged && Math.hypot(p.x - start.x, p.y - start.y) > DRAG_THRESHOLD) {
          dragged = true;
          el.setPointerCapture(e.pointerId);
        }
        if (dragged) {
          const v = viewRef.current;
          setView({ ...v, x: v.x + p.x - last.x, y: v.y + p.y - last.y });
        }
        last = p;
      } else if (pointers.size === 2 && pinch) {
        const { dist, mid } = twoFingers();
        const scale = clampScale((pinch.view.scale * dist) / pinch.dist);
        // Keep the board point that was under the fingers at the start under them now.
        const cx = (pinch.mid.x - pinch.view.x) / pinch.view.scale;
        const cy = (pinch.mid.y - pinch.view.y) / pinch.view.scale;
        setView({ scale, x: mid.x - cx * scale, y: mid.y - cy * scale });
      }
    };

    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      // Lifting one finger of a pinch: continue panning smoothly with the other one.
      if (pointers.size === 1) last = [...pointers.values()][0]!;
    };

    const onClickCapture = (e: MouseEvent) => {
      if (dragged) {
        e.stopPropagation();
        e.preventDefault();
        dragged = false;
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(Math.exp(-e.deltaY * 0.0015), local(e));
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('click', onClickCapture, true);
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('click', onClickCapture, true);
      el.removeEventListener('wheel', onWheel);
    };
  }, [container, setView, zoomAt]);

  return { view, setView, zoomBy };
}
