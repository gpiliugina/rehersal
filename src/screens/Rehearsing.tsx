import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { AudiencePreview as Scene } from '../scene/AudiencePreview';
import { AttentionMeter } from '../components/AttentionMeter';
import { ScreenTitle } from '../components/ScreenTitle';
import { sampleTimeline } from '../scene/ReplayController';
import { mmss } from '../lib/format';
import { useRecorder, getRecordingDecision } from '../lib/useRecorder';

type Phase = 'idle' | 'live' | 'paused';

export function Rehearsing() {
  const session = useStore((s) => s.activeSession);
  const endRehearsal = useStore((s) => s.endRehearsal);
  const cancelRehearsal = useStore((s) => s.cancelRehearsal);

  const [phase, setPhase] = useState<Phase>('idle');

  // --- recording ----------------------------------------------------------
  const recorder = useRecorder();
  const [showPermModal, setShowPermModal] = useState(false);
  // Small inline hint under the Start gate when we're proceeding without a
  // recording (denied / skipped / unsupported). Toast handles "busy".
  const [inlineNote, setInlineNote] = useState<string | null>(null);
  const [busyToast, setBusyToast] = useState(false);
  // Guards the async finish path so we only stop+save once.
  const finishingRef = useRef(false);
  const recorderRef = useRef(recorder);
  recorderRef.current = recorder;

  // Decide up front whether to prompt. Runs once on entering Rehearsing,
  // before the Start gate matters. Honors a remembered per-session choice so
  // we never re-prompt; only shows the modal when access is genuinely unknown.
  useEffect(() => {
    let cancelled = false;
    async function init() {
      const r = recorderRef.current;
      if (!r.supported) {
        setInlineNote('Recording not supported here');
        return;
      }
      const decision = getRecordingDecision();
      if (decision === 'granted') {
        // Re-acquire the stream silently (the browser won't re-prompt).
        await r.requestAccess();
        return;
      }
      if (decision === 'denied' || decision === 'skipped') {
        setInlineNote('No recording this time');
        return;
      }
      // Unknown — peek at the permission state to avoid a needless modal for
      // users who already granted camera access in a previous visit.
      let perm: PermissionState | null = null;
      try {
        const res = await navigator.permissions.query({
          name: 'camera' as PermissionName,
        });
        perm = res.state;
      } catch {
        perm = null; // not all browsers can query camera — fall through to modal
      }
      if (cancelled) return;
      if (perm === 'granted') {
        await r.requestAccess();
      } else if (perm === 'denied') {
        setInlineNote('No recording this time');
      } else {
        setShowPermModal(true);
      }
    }
    init();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Auto-end when the rehearsal reaches the pre-generated max duration. Runs
  // through the same finish path as the End button so the recording is saved.
  useEffect(() => {
    if (phase === 'live' && session && elapsed >= session.durationSec) {
      finish(session.durationSec);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, elapsed, session]);

  // Keyboard parity:
  //   Space → begin (idle) or pause/resume (live/paused)
  //   Escape → on Start gate, exits the rehearsal (no save)
  // The cancel-confirm modal handles its own Escape (close = "Keep rehearsing").
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (document.activeElement?.tagName ?? '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      // While the permission modal is up, keys shouldn't drive the rehearsal.
      if (showPermModal) return;
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
  }, [phase, showPermModal]);

  if (!session) return null;

  function begin() {
    bankedSecRef.current = 0;
    setElapsed(0);
    lastResumeRef.current = performance.now();
    // Start capturing immediately if we have a live stream ready.
    if (recorderRef.current.status === 'ready') {
      recorderRef.current.start();
    }
    setPhase('live');
  }

  function togglePause() {
    if (phase === 'paused') {
      recorderRef.current.resume();
      setPhase('live');
    } else if (phase === 'live') {
      bankedSecRef.current = elapsed;
      recorderRef.current.pause();
      setPhase('paused');
    }
  }

  // Single end path: stop+save the recording (if any), then finalize. Awaiting
  // IndexedDB is non-blocking, so the UI doesn't freeze.
  async function finish(sec: number) {
    if (finishingRef.current) return;
    finishingRef.current = true;
    const r = recorderRef.current;
    const wasRecording = r.status === 'recording' || r.status === 'paused';
    let saved = false;
    let poster: string | null = null;
    if (wasRecording) {
      const result = await r.stopAndSave(session!.id);
      saved = result.saved;
      poster = result.poster;
    }
    endRehearsal(sec, saved, poster ?? undefined);
  }

  async function onAllow() {
    const ok = await recorderRef.current.requestAccess();
    if (ok) {
      setShowPermModal(false);
      setBusyToast(false);
    } else if (recorderRef.current.status === 'busy') {
      // Keep the modal open so the user can retry or skip.
      setBusyToast(true);
    } else {
      // Denied — proceed without recording.
      setShowPermModal(false);
      setInlineNote('No recording this time');
    }
  }

  function onSkip() {
    recorderRef.current.skip();
    setShowPermModal(false);
    setInlineNote('No recording this time');
  }

  const sample = sampleTimeline(session.timeline, elapsed);
  const attention =
    phase === 'idle'
      ? session.audience.attention
      : sample?.attention ?? session.audience.attention;

  const isRecording = recorder.status === 'recording';
  const isRecPaused = recorder.status === 'paused';

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
          markers={phase === 'idle' ? undefined : session.markers}
          playheadSec={elapsed}
        />
      </div>

      <ScreenTitle>Rehearsing</ScreenTitle>

      {/* Subtle recording indicator, top-left, frosted scrim. */}
      {(isRecording || isRecPaused) && (
        <div className="rec-indicator" aria-live="polite">
          <span
            className={`rec-indicator__dot ${isRecPaused ? 'is-paused' : ''}`}
            aria-hidden
          />
          {isRecPaused ? 'paused' : 'recording'}
        </div>
      )}

      <div className="rehearsing__hud">
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
                onClick={() => finish(elapsed)}
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

      {phase === 'idle' && !showPermModal && (
        <div className="start-gate" aria-live="polite">
          <button
            className="start-gate__cta"
            onClick={begin}
            aria-label="Start rehearsal"
          >
            Start
          </button>
          <p className="start-gate__sub">When you’re ready.</p>
          {inlineNote && <p className="start-gate__note">{inlineNote}</p>}
        </div>
      )}

      {showPermModal && (
        <PermissionModal
          busy={busyToast}
          requesting={recorder.status === 'requesting'}
          onAllow={onAllow}
          onSkip={onSkip}
        />
      )}
    </div>
  );
}

// =============================================================================
// Permission modal — shown once before the Start gate when camera/mic access
// is unknown. Allowing records the rehearsal; skipping proceeds without it.
// =============================================================================

function PermissionModal({
  busy,
  requesting,
  onAllow,
  onSkip,
}: {
  busy: boolean;
  requesting: boolean;
  onAllow: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-card__title">
          <ScreenTitle>Allow camera and microphone</ScreenTitle>
        </div>
        <p className="modal-card__sub muted">
          We’ll record your rehearsal so you can watch it back. The recording
          stays on your device — nothing is uploaded.
        </p>
        {busy && (
          <p className="modal-card__sub modal-card__sub--warn">
            Camera busy — it may be in use by another app. Try again, or skip.
          </p>
        )}
        <button
          className="btn modal-card__cta"
          onClick={onAllow}
          disabled={requesting}
        >
          {requesting ? 'Requesting…' : busy ? 'Try again' : 'Allow access'}
        </button>
        <button className="modal-card__skip-link" onClick={onSkip}>
          Skip this time
        </button>
      </div>
    </div>
  );
}
