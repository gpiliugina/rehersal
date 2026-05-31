import { ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';

// =============================================================================
// Modal — the ONE shell every dialog in the app renders through. Portals a dim
// backdrop (z50) + a card layer (z60) to <body>; the +New glow wash (z55) can
// sit between them. Centering, padding, title size and button style all come
// from the shared `.modal-*` classes — no modal sets its own. Pass `onClose`
// to allow backdrop-click / Escape dismissal; omit it for gates that must be
// answered explicitly.
// =============================================================================

export function Modal({
  children,
  onClose,
  labelledBy,
  cardClassName,
}: {
  children: ReactNode;
  onClose?: () => void;
  labelledBy?: string;
  cardClassName?: string;
}) {
  useEffect(() => {
    if (!onClose) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose!();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <>
      <div className="modal-backdrop" aria-hidden onClick={onClose} />
      <div className="modal-cardlayer">
        <div
          className={`modal-card${cardClassName ? ` ${cardClassName}` : ''}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelledBy}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </>,
    document.body,
  );
}

// =============================================================================
// ConfirmDialog — title + optional body + (ghost cancel · primary confirm).
// Used for every "are you sure?" prompt so they're pixel-identical.
// =============================================================================

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: {
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal onClose={onCancel}>
      <h2 className="modal-title">{title}</h2>
      {body && <p className="modal-body">{body}</p>}
      <div className="modal-actions">
        <button className="btn btn--ghost btn--pill" onClick={onCancel}>
          {cancelLabel}
        </button>
        <button className="btn btn--pill" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
