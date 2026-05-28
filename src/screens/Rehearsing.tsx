import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { AudiencePreview as Scene } from '../scene/AudiencePreview';
import { AttentionMeter } from '../components/AttentionMeter';
import { ScreenTitle } from '../components/ScreenTitle';
import { sampleTimeline } from '../scene/ReplayController';
import { mmss } from '../lib/format';

type Phase = 'idle' | 'live' | 'paused';

export function Rehearsing() {
  const session = useStore((s) => s.activeSession);
  const endRehearsal = useStore((s) => s.endRehearsal);
  const cancelRehearsal = useStore((s) => s.cancelRehearsal);

  const [phase, setPhase] = useState<Phase>('idle');
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  // Elapsed-time accounting that survives pause. Banked = seconds completed
  // before the current run segment; the live segment adds wall-clock delta.
  const lastResumeRef = useRef<number>(performance.now());
  const bankedSecRef = useRef<number>(0);
  const [elapsed, setElapsed] = useState(0);

  // Live elapsed-time ticking. Halts while paused or idle.
  useEffect(() => {
    if (phase !== 'live') return;
    lastResumeRef.current = performance.now();
    const id = window.setInterval(() => {
      const delta = (performance.now() - lastResumeRef.current) / 1000;
      setElapsed(bankedSecRef.current + delta);
    }, 250);
    return () => window.clearInterval(id);
  }, [phase]);

  // Keyboard parity:
  //   Space → begin (idle) or pause/resume (live/paused)
  //   Escape → on Start gate, exits the rehearsal (no save)
  // The cancel-confirm modal handles its own Escape (close = "Keep rehearsing").
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (document.activeElement?.tagName ?? '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        if (phase === 'idle') begin();
        else togglePause();
      } else if (e.key === 'Escape' && phase === 'idle') {
        e.preventDefault();
        cancelRehearsal();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  if (!session) return null;

  if (phase === 'live' && elapsed >= session.durationSec) {
    endRehearsal(session.durationSec);
    return null;
  }

  function begin() {
    bankedSecRef.current = 0;
    setElapsed(0);
    lastResumeRef.current = performance.now();
    setPhase('live');
  }

  function togglePause() {
    if (phase === 'paused') {
      setPhase('live');
    } else if (phase === 'live') {
      bankedSecRef.current = elapsed;
      setPhase('paused');
    }
  }

  // Close handler is phase-aware: on the Start gate nothing has started yet,
  // so we bail immediately. During a live or paused rehearsal we ask first.
  function onClose() {
    if (phase === 'idle') {
      cancelRehearsal();
    } else {
      setConfirmingCancel(true);
    }
  }

  const sample = sampleTimeline(session.timeline, elapsed);
  const attention =
    phase === 'idle'
      ? session.audience.attention
      : sample?.attention ?? session.audience.attention;

  return (
    <div className="screen screen--full rehearsing">
      <div
        className={`rehearsing__scene ${phase === 'idle' ? 'is-blurred' : ''}`}
      >
        <Scene
          roomType={session.roomType}
          size={session.audience.size}
          warmth={session.audience.warmth}
          attention={attention}
          cameraMode="firstPerson"
        />
      </div>

      <button
        className="rehearsing__close btn-icon"
        onClick={onClose}
        aria-label="Close rehearsal"
        title="Close"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M18 6 L6 18" />
          <path d="M6 6 L18 18" />
        </svg>
      </button>

      <ScreenTitle overlay>Rehearsing</ScreenTitle>

      <div className="rehearsing__hud">
        <div className="rehearsing__top">
          {phase !== 'idle' && (
            <span className="tag rehearsing__phase-tag">
              {phase === 'paused' ? 'paused' : 'live'} · simulated
            </span>
          )}
        </div>

        {phase !== 'idle' && (
          <div className="rehearsing__center-bottom">
            <div className="hud-pill">
              <AttentionMeter value={attention} />
              <div className="hud-timer">{mmss(elapsed)}</div>
              <button
                className="btn-icon btn-icon--on-light"
                onClick={togglePause}
                aria-label={phase === 'paused' ? 'Resume' : 'Pause'}
                title={phase === 'paused' ? 'Resume' : 'Pause'}
              >
                {phase === 'paused' ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M8 5 L20 12 L8 19 Z" />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <rect x="6" y="5" width="4" height="14" rx="1" />
                    <rect x="14" y="5" width="4" height="14" rx="1" />
                  </svg>
                )}
              </button>
              <button
                className="btn-icon btn-icon--on-light btn-icon--end"
                onClick={() => endRehearsal(elapsed)}
                aria-label="End rehearsal"
                title="End"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>

      {phase === 'idle' && (
        <div className="start-gate" aria-live="polite">
          <button
            className="start-gate__cta"
            onClick={begin}
            aria-label="Start rehearsal"
          >
            Start
          </button>
          <p className="start-gate__sub">When you’re ready.</p>
        </div>
      )}

      {confirmingCancel && (
        <CancelConfirmModal
          onKeep={() => setConfirmingCancel(false)}
          onCancel={() => {
            setConfirmingCancel(false);
            cancelRehearsal();
          }}
        />
      )}
    </div>
  );
}

function CancelConfirmModal({
  onKeep,
  onCancel,
}: {
  onKeep: () => void;
  onCancel: () => void;
}) {
  const keepRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    keepRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onKeep();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onKeep]);

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={onKeep}
    >
      <div
        className="modal-card modal-card--confirm"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="modal-card__title">Cancel this rehearsal?</h2>
        <p className="modal-card__sub muted">Nothing will be saved.</p>
        <div className="modal-card__actions">
          <button
            ref={keepRef}
            className="btn btn--ghost btn--pill"
            onClick={onKeep}
          >
            Keep rehearsing
          </button>
          <button className="btn btn--pill" onClick={onCancel}>
            Cancel rehearsal
          </button>
        </div>
      </div>
    </div>
  );
}
