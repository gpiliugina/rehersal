import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { AudiencePreview as Scene } from '../scene/AudiencePreview';
import { ConfirmDialog } from '../components/Modal';
import { ScreenTitle } from '../components/ScreenTitle';
import { CloseButton } from '../components/CloseButton';
import { sampleTimeline } from '../scene/ReplayController';
import { mmss } from '../lib/format';
import { useRecorder, getRecordingDecision } from '../lib/useRecorder';
import { useAudienceEngagement } from '../lib/useAudienceEngagement';
import type { ScreenHead } from '../scene/AudiencePreview';
import { useGlowWash } from '../components/Ripple';

type Phase = 'idle' | 'live' | 'paused';

export function Rehearsing() {
  const session = useStore((s) => s.activeSession);
  const endRehearsal = useStore((s) => s.endRehearsal);
  const cancelRehearsal = useStore((s) => s.cancelRehearsal);
  const { layer: gateGlow, spawn: spawnGateGlow } = useGlowWash();

  const [phase, setPhase] = useState<Phase>('idle');
  // Keeps the Start gate mounted briefly after Start so it can fade out while
  // the room blurs into focus, rather than vanishing instantly.
  const [gateLeaving, setGateLeaving] = useState(false);

  // --- recording ----------------------------------------------------------
  const recorder = useRecorder();
  // Small inline hint under the Start gate when proceeding without a recording.
  const [inlineNote, setInlineNote] = useState<string | null>(null);
  // Bin button → confirm before discarding the current recording.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Guards the async finish path so we only stop+save once.
  const finishingRef = useRef(false);
  const recorderRef = useRef(recorder);
  recorderRef.current = recorder;

  // Every rehearsal OFFERS recording at the Start gate (record vs practice).
  // Here we only pre-warm the stream silently if access was already granted, so
  // "Start rehearsal" records instantly; otherwise the gate's button prompts.
  useEffect(() => {
    const r = recorderRef.current;
    if (!r.supported) {
      setInlineNote('Recording not supported here');
      return;
    }
    if (getRecordingDecision() === 'granted') {
      r.requestAccess();
    }
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
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        if (phase === 'idle') startRecording();
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

  // --- LIVE voice → audience engagement -----------------------------------
  // While live, the real voice drives one global engagement value + momentary
  // reactions (synthetic markers) + earned emoji. The AudioContext is primed
  // (resumed) from the Start click in begin(). No mic → marker timeline below.
  const elapsedRef = useRef(elapsed);
  elapsedRef.current = elapsed;
  const projection = useRef<ScreenHead[] | null>(null);
  const audience = useAudienceEngagement({
    getStream: recorder.getStream,
    active: phase === 'live',
    baseAttention: session?.audience.attention ?? 0.5,
    getElapsed: () => elapsedRef.current,
    projection,
  });
  const useVoice = phase === 'live' && audience.hasMic;

  if (!session) return null;

  // Begin the rehearsal. `record` = capture video/audio this run (the stream
  // must already be acquired); false = practice only.
  function beginRehearsal(record: boolean) {
    bankedSecRef.current = 0;
    setElapsed(0);
    lastResumeRef.current = performance.now();
    // start() checks the live stream itself; don't gate on the `status` state —
    // right after requestAccess() that state hasn't propagated to the ref yet,
    // which previously skipped recording entirely (Insights fell back to demo).
    if (record) {
      recorderRef.current.start();
    }
    // Resume the audio analysis context WITHIN this click gesture (otherwise it
    // stays suspended and no audio flows).
    audience.prime();
    setPhase('live');
    // Fade the gate out over ~450ms (matches the .start-gate transition), then
    // unmount it. The scene unblurs in parallel via the is-blurred toggle.
    setGateLeaving(true);
    window.setTimeout(() => setGateLeaving(false), 500);
  }

  // Start gate — record: acquire the mic/camera (prompts if needed) then begin.
  async function startRecording(e?: React.MouseEvent) {
    if (e) spawnGateGlow(e);
    const r = recorderRef.current;
    let ok = r.status === 'ready';
    if (!ok && r.supported) ok = await r.requestAccess();
    if (!ok) setInlineNote('No recording this time');
    beginRehearsal(ok);
  }

  // Start gate — skip: practice with NO recording, bypassing any permission prompt.
  function startPractice(e: React.MouseEvent) {
    spawnGateGlow(e);
    recorderRef.current.skip();
    beginRehearsal(false);
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

  const sample = sampleTimeline(session.timeline, elapsed);
  // LIVE with a mic → real-voice ENGAGEMENT drives gaze/attention. Otherwise
  // (idle, or live without a mic) → the pre-rolled timeline / slider baseline.
  const attention =
    phase === 'idle'
      ? session.audience.attention
      : useVoice
        ? audience.engagement
        : sample?.attention ?? session.audience.attention;
  // Couple warmth to engagement so high reads as a LEAN-IN and low as a
  // lean-back (warmth drives the existing posture lean).
  const warmth = useVoice
    ? Math.max(
        0,
        Math.min(
          1,
          session.audience.warmth +
            (audience.engagement - session.audience.attention) * 0.6,
        ),
      )
    : session.audience.warmth;

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
          warmth={warmth}
          attention={attention}
          cameraMode="firstPerson"
          markers={
            phase === 'idle'
              ? undefined
              : useVoice
                ? audience.liveMarkers
                : session.markers
          }
          playheadSec={elapsed}
          projection={projection}
        />
        {/* Live emoji reactions — float up from a reacting avatar's head. */}
        {audience.emojis.length > 0 && (
          <div className="reaction-layer" aria-hidden>
            {audience.emojis.map((e) => (
              <span
                key={e.id}
                className="reaction-emoji"
                style={{ left: `${e.x * 100}%`, top: `${e.y * 100}%` }}
              >
                {e.char}
              </span>
            ))}
          </div>
        )}
      </div>

      <ScreenTitle>Rehearsing</ScreenTitle>

      {/* Close (×) — exit the rehearsal while it's still on the Start gate. */}
      {phase === 'idle' && <CloseButton onClick={cancelRehearsal} />}

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
              <button
                className="btn-icon btn-icon--on-light"
                onClick={() => setConfirmingDelete(true)}
                aria-label="Delete recording"
                title="Delete recording"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M4 7h16" />
                  <path d="M10 11v6M14 11v6" />
                  <path d="M5 7l1 13h12l1 -13" />
                  <path d="M9 7V4h6v3" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>

      {(phase === 'idle' || gateLeaving) && (
        <div
          className={`start-gate ${gateLeaving ? 'is-leaving' : ''}`}
          aria-live="polite"
        >
          <div className="start-gate__cta-wrap">
            {gateGlow}
            <button
              className="start-gate__cta"
              onClick={startRecording}
              disabled={recorder.status === 'requesting'}
              aria-label="Start rehearsal and record"
            >
              {recorder.status === 'requesting' ? '…' : 'Start'}
            </button>
          </div>
          <p className="start-gate__sub">
            We’ll record so you can watch it back — the video stays on your device.
          </p>
          {/* Clear SKIP path — practice with no recording, no permission prompt. */}
          <button
            className="btn btn--ghost btn--pill start-gate__skip"
            onClick={startPractice}
          >
            Practice without recording
          </button>
          {inlineNote && <p className="start-gate__note">{inlineNote}</p>}
        </div>
      )}

      {confirmingDelete && (
        <ConfirmDialog
          title="Delete this recording?"
          body="This rehearsal’s recording will be discarded. This can’t be undone."
          confirmLabel="Delete"
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={() => {
            setConfirmingDelete(false);
            cancelRehearsal(); // discards the in-progress recording + exits
          }}
        />
      )}
    </div>
  );
}
