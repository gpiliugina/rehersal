// =============================================================================
// useDraggable — make a panel repositionable by a header-strip handle.
//
// On pointerdown on the handle we capture the pointer and attach pointermove +
// pointerup to WINDOW (so a fast drag never drops if the cursor leaves the thin
// strip), translate the wrapper via transform from one piece of state, commit
// in requestAnimationFrame (no layout thrash), and clamp so the handle can't
// leave the viewport. Only `onPointerDown` lives on the handle — everything
// interactive inside the panel is untouched, so its controls keep working.
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';

const EDGE_MARGIN = 56; // px of the panel that must stay on screen

export function useDraggable() {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  const posRef = useRef(pos);
  posRef.current = pos;
  const drag = useRef<{ px: number; py: number; bx: number; by: number } | null>(null);
  const raf = useRef<number | null>(null);
  const pending = useRef<{ x: number; y: number } | null>(null);

  const clamp = useCallback((nx: number, ny: number): { x: number; y: number } => {
    const el = ref.current;
    if (!el) return { x: nx, y: ny };
    const r = el.getBoundingClientRect();
    const naturalLeft = r.left - posRef.current.x;
    const naturalTop = r.top - posRef.current.y;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const x = Math.max(
      EDGE_MARGIN - r.width - naturalLeft,
      Math.min(vw - EDGE_MARGIN - naturalLeft, nx),
    );
    const y = Math.max(
      -naturalTop, // the handle strip can't leave the top of the viewport
      Math.min(vh - EDGE_MARGIN - naturalTop, ny),
    );
    return { x, y };
  }, []);

  const onMove = useCallback(
    (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      pending.current = clamp(d.bx + (e.clientX - d.px), d.by + (e.clientY - d.py));
      if (raf.current == null) {
        raf.current = requestAnimationFrame(() => {
          raf.current = null;
          if (pending.current) setPos(pending.current);
        });
      }
    },
    [clamp],
  );

  const onUp = useCallback(() => {
    drag.current = null;
    setDragging(false);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
  }, [onMove]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      drag.current = {
        px: e.clientX,
        py: e.clientY,
        bx: posRef.current.x,
        by: posRef.current.y,
      };
      setDragging(true);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    },
    [onMove, onUp],
  );

  useEffect(
    () => () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (raf.current != null) cancelAnimationFrame(raf.current);
    },
    [onMove, onUp],
  );

  return {
    ref,
    dragging,
    style: { transform: `translate(${pos.x}px, ${pos.y}px)` } as React.CSSProperties,
    // Only pointerdown on the handle; move/up are on window (see above).
    handleProps: { onPointerDown },
  };
}
