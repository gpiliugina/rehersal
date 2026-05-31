// =============================================================================
// MobileSheet — reusable bottom sheet for phone-portrait. Full-width, anchored
// to the bottom, rounded top corners, locked surface styling, respects the home
// indicator (--safe-bottom), scrolls internally if it overflows, and has an
// optional drag-down-to-dismiss handle. Groundwork: will replace the floating
// glass cards on mobile screens. Portaled to <body>.
// =============================================================================

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const DISMISS_PX = 90; // drag the handle down past this → dismiss

interface Props {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Show the grab handle + enable drag-down-to-dismiss (default true). */
  dragToDismiss?: boolean;
  labelledBy?: string;
}

export function MobileSheet({
  open,
  onClose,
  children,
  dragToDismiss = true,
  labelledBy,
}: Props) {
  const drag = useRef<{ startY: number } | null>(null);
  const [dragY, setDragY] = useState(0);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const onDown = (e: React.PointerEvent) => {
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    drag.current = { startY: e.clientY };
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setDragY(Math.max(0, e.clientY - drag.current.startY)); // downward only
  };
  const onUp = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dy = e.clientY - drag.current.startY;
    drag.current = null;
    setDragY(0);
    if (dy > DISMISS_PX) onClose();
  };

  return createPortal(
    <div className="msheet-root" role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
      <div className="msheet-backdrop" onClick={onClose} aria-hidden />
      <div
        className="msheet"
        style={dragY ? { transform: `translateY(${dragY}px)`, transition: 'none' } : undefined}
      >
        {dragToDismiss && (
          <div
            className="msheet__handle"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            role="button"
            aria-label="Drag down to dismiss"
          >
            <span className="msheet__grip" aria-hidden />
          </div>
        )}
        <div className="msheet__body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
