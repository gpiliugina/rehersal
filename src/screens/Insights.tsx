import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useStore, selectActiveEvent } from '../state/store';
import { AudiencePreview as Scene, type ScreenHead } from '../scene/AudiencePreview';
import { pickEmoji } from '../scene/audienceAnimation';
import { useDraggable } from '../lib/useDraggable';
import type { EmojiReaction } from '../lib/useAudienceEngagement';
import { MockVideoFrame } from '../components/MockVideoFrame';
import { LiveStatChip } from '../components/LiveStatChip';
import { TerminalFeed } from '../components/TerminalFeed';
import { useIsMobile } from '../lib/useIsMobile';
import { sampleTimeline } from '../scene/ReplayController';
import { ScreenTitle } from '../components/ScreenTitle';
import { Aura } from '../components/Aura';
import { CloseButton } from '../components/CloseButton';
import { mmss } from '../lib/format';
import { buildInsightCards } from '../lib/takeaways';
import type { InsightCard } from '../lib/takeaways';
import { SCORE_EXPLAINERS } from '../lib/scoring';
import type { TimelinePoint } from '../state/types';
import {
  getRecording,
  recordingStorageAvailable,
  hasSeenStorageNotice,
  markStorageNoticeSeen,
} from '../lib/recordings';

// Fallback used for older rehearsals (no recording) or when a real recording
// can't be loaded. Real recordings are object URLs created from IndexedDB.
const VIDEO_SRC = '/video-recording.mp4';

export function Insights() {
  const session = useStore((s) => s.activeSession);
  const activeEventId = useStore((s) => s.activeEventId);
  const event = useStore(selectActiveEvent);
  const goHome = useStore((s) => s.goHomeExpandingActiveEvent);
  const rehearseAgain = useStore((s) => s.rehearseAgain);
  const openProgress = useStore((s) => s.openProgress);

  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoOk, setVideoOk] = useState(true);
  // Object URL for this rehearsal's real recording, or null to use the mock.
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const recordingUrlRef = useRef<string | null>(null);
  recordingUrlRef.current = recordingUrl;
  // True once we've finished checking IndexedDB for this rehearsal's recording.
  const [recordingChecked, setRecordingChecked] = useState(false);
  const videoSrc = recordingUrl ?? VIDEO_SRC;
  // One-time "your recording is saved" notice, shown the first time Insights
  // ever loads with a real recording. `noticeClosing` drives the soft exit.
  const [showStorageNotice, setShowStorageNotice] = useState(false);
  const [noticeClosing, setNoticeClosing] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  // Tracks the user's audio preference. We initialise the video element as
  // muted on mount (so the seek-to-0.1 poster trick paints a still frame
  // before any user interaction), then sync to `isMuted` the moment the user
  // hits Play. After that the mute toggle button drives both this state and
  // `v.muted` directly.
  const [isMuted, setIsMuted] = useState(false);

  const isMobile = useIsMobile();
  // Mobile Shorts: brief center play/pause icon flash on tap, and a draggable
  // two-tone scrub bar.
  const [tapFlash, setTapFlash] = useState(false);
  const flashTimer = useRef<number | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const scrubbingRef = useRef(false);

  const cards = useMemo(
    () => (session ? buildInsightCards(session) : []),
    [session],
  );

  const durationForScrubber =
    videoOk && videoDuration > 0
      ? videoDuration
      : session?.durationSec ?? 0;

  const sessionPlayhead = (() => {
    if (!session) return 0;
    if (videoOk && videoDuration > 0) {
      return (currentTime / videoDuration) * session.durationSec;
    }
    return currentTime;
  })();

  function markerVideoT(sessionT: number): number {
    const v = videoRef.current;
    const sDur = session?.durationSec ?? 0;
    // WebM recordings can report duration === Infinity until seeked, so guard
    // for a finite value before mapping (otherwise we'd seek to Infinity).
    if (videoOk && v && Number.isFinite(v.duration) && v.duration > 0 && sDur > 0) {
      return (sessionT / sDur) * v.duration;
    }
    return sessionT;
  }

  // Pull this rehearsal's real recording (if any) from IndexedDB and expose it
  // as an object URL. Falls back silently to the mock for older/skipped
  // rehearsals or on any read error. Revokes the URL on unmount/session change.
  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;
    setVideoOk(true);
    setRecordingUrl(null);
    setRecordingChecked(false);
    if (session?.hasRecording && recordingStorageAvailable()) {
      getRecording(session.id)
        .then((rec) => {
          if (cancelled) return;
          if (rec) {
            createdUrl = URL.createObjectURL(rec.blob);
            setRecordingUrl(createdUrl);
          }
          setRecordingChecked(true);
        })
        .catch((e) => {
          console.warn('Could not load recording — using mock video', e);
          if (!cancelled) setRecordingChecked(true);
        });
    } else {
      setRecordingChecked(true);
    }
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [session?.id, session?.hasRecording]);

  // First-ever real recording → show the storage notice once, then never
  // again (the flag is set immediately, on show, not on dismiss).
  useEffect(() => {
    if (!recordingUrl || hasSeenStorageNotice()) return;
    markStorageNoticeSeen();
    setShowStorageNotice(true);
    const t = window.setTimeout(() => dismissStorageNotice(), 8000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordingUrl]);

  // Play the exit animation, then unmount.
  function dismissStorageNotice() {
    setNoticeClosing(true);
    window.setTimeout(() => {
      setShowStorageNotice(false);
      setNoticeClosing(false);
    }, 260);
  }

  // Reload the media element whenever the source changes (mock ⇄ recording).
  // Start muted so the seek-to-0.1 still-frame paints before any interaction.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;
    v.load();
  }, [videoSrc]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onLoaded = () => {
      if (Number.isFinite(v.duration)) setVideoDuration(v.duration);
    };
    const onLoadedData = () => {
      if (v.paused && v.currentTime === 0) {
        try {
          v.currentTime = 0.1;
        } catch {
          /* ignore */
        }
      }
    };
    const onTime = () => setCurrentTime(v.currentTime);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);
    const onError = () => {
      // A corrupt recording falls back to the mock video silently; the mock
      // itself failing falls back to the canvas MockVideoFrame.
      if (recordingUrlRef.current) {
        console.warn('Recording failed to play — falling back to mock video');
        URL.revokeObjectURL(recordingUrlRef.current);
        setRecordingUrl(null);
      } else {
        setVideoOk(false);
      }
    };
    v.addEventListener('loadedmetadata', onLoaded);
    v.addEventListener('loadeddata', onLoadedData);
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('ended', onEnded);
    v.addEventListener('error', onError);
    v.muted = true;
    return () => {
      v.removeEventListener('loadedmetadata', onLoaded);
      v.removeEventListener('loadeddata', onLoadedData);
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('ended', onEnded);
      v.removeEventListener('error', onError);
    };
  }, [videoOk, session?.id]);

  const fallbackRafRef = useRef<number | null>(null);
  const fallbackLastTickRef = useRef<number>(performance.now());
  useEffect(() => {
    if (videoOk) return;
    if (!isPlaying || !session) return;
    fallbackLastTickRef.current = performance.now();
    const tick = () => {
      const now = performance.now();
      const dt = (now - fallbackLastTickRef.current) / 1000;
      fallbackLastTickRef.current = now;
      setCurrentTime((prev) => {
        const next = prev + dt;
        if (next >= session.durationSec) {
          setIsPlaying(false);
          return session.durationSec;
        }
        return next;
      });
      fallbackRafRef.current = requestAnimationFrame(tick);
    };
    fallbackRafRef.current = requestAnimationFrame(tick);
    return () => {
      if (fallbackRafRef.current != null) {
        cancelAnimationFrame(fallbackRafRef.current);
      }
    };
  }, [isPlaying, videoOk, session?.id]);

  // REPLAY emoji — the marker timeline drives positive reactions too: when the
  // playhead crosses a strongMoment marker, float an earned emoji off a visible
  // avatar's head (projected via the same head-projection used live).
  // The whole right-side panel (audience + stat cards + insights) moves as ONE
  // unit, dragged by the top grip strip.
  const railDrag = useDraggable();
  const projection = useRef<ScreenHead[] | null>(null);
  const [replayEmojis, setReplayEmojis] = useState<EmojiReaction[]>([]);
  const emojiIdRef = useRef(0);
  const lastPhRef = useRef(0);
  useEffect(() => {
    const prev = lastPhRef.current;
    lastPhRef.current = sessionPlayhead;
    if (!session || sessionPlayhead <= prev) return;
    const crossed = session.markers.some(
      (m) => m.kind === 'strongMoment' && m.t > prev && m.t <= sessionPlayhead,
    );
    if (!crossed) return;
    const heads = (projection.current ?? []).filter((h) => h.visible);
    const at = heads.length
      ? heads[Math.floor(Math.random() * heads.length)]
      : { x: 0.5, y: 0.4 };
    const id = emojiIdRef.current++;
    const e: EmojiReaction = {
      id,
      char: pickEmoji(false),
      x: at.x,
      y: Math.max(0.04, at.y - 0.04),
    };
    setReplayEmojis((l) => [...l, e]);
    window.setTimeout(
      () => setReplayEmojis((l) => l.filter((x) => x.id !== id)),
      1800,
    );
  }, [sessionPlayhead, session]);

  if (!session) return null;

  const sample = sampleTimeline(session.timeline, sessionPlayhead);
  const attention = sample?.attention ?? session.audience.attention;
  const confidenceLive =
    (sample?.confidence ?? session.scores.confidence / 100) * 100;
  const pulseLive = sample?.pulse ?? 78;
  const calmLive = Math.max(0, Math.min(100, ((120 - pulseLive) / 60) * 100));

  const sparkSeries = recentSeries(session.timeline, sessionPlayhead, 14, 14);

  const ended =
    durationForScrubber > 0 && currentTime >= durationForScrubber - 0.01;

  function onTransport() {
    const v = videoRef.current;
    if (videoOk && v) {
      if (v.ended) v.currentTime = 0;
      if (v.paused) {
        // Match the user's audio preference. First play comes out of the
        // initial muted-for-still-frame state and lets audio out.
        v.muted = isMuted;
        v.play().catch(() => {});
      } else {
        v.pause();
      }
    } else {
      if (ended) setCurrentTime(0);
      setIsPlaying((p) => !p);
    }
  }

  // Keyboard parity: Space toggles play/pause on the Insights screen.
  // Inputs (e.g. a moment-card form, future search) opt out of the shortcut.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (document.activeElement?.tagName ?? '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        onTransport();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoOk, isMuted, isPlaying, currentTime, videoDuration]);

  function toggleMute() {
    const next = !isMuted;
    setIsMuted(next);
    const v = videoRef.current;
    if (v) v.muted = next;
  }

  function onRestart() {
    const v = videoRef.current;
    if (videoOk && v) {
      v.currentTime = 0;
      v.muted = isMuted;
      v.play().catch(() => {});
    } else {
      setCurrentTime(0);
      setIsPlaying(true);
    }
  }

  function onScrub(value: number) {
    const v = videoRef.current;
    if (videoOk && v) {
      v.currentTime = value;
    } else {
      setCurrentTime(value);
    }
  }

  function onSeekToCard(c: InsightCard) {
    const target = markerVideoT(c.t);
    const v = videoRef.current;
    if (videoOk && v) {
      v.currentTime = target;
      v.play().catch(() => {});
    } else {
      setCurrentTime(target);
      setIsPlaying(true);
    }
  }

  const transportLabel = isPlaying ? 'Pause' : ended ? 'Replay' : 'Play';

  // ===========================================================================
  // MOBILE — YouTube Shorts–style: full-bleed vertical video, tap to play/pause,
  // one timed insight overlay at a time, a thin two-tone scrub bar, end overlay.
  // Desktop layout (everything below this block) is untouched.
  // ===========================================================================
  if (isMobile) {
    const playedFrac =
      durationForScrubber > 0
        ? Math.min(currentTime, durationForScrubber) / durationForScrubber
        : 0;

    const onTapVideo = () => {
      onTransport();
      setTapFlash(true);
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setTapFlash(false), 460);
    };

    const barFrac = (clientX: number) => {
      const el = barRef.current;
      if (!el) return 0;
      const r = el.getBoundingClientRect();
      return Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    };
    const onBarDown = (e: React.PointerEvent) => {
      scrubbingRef.current = true;
      onScrub(barFrac(e.clientX) * (durationForScrubber || 0));
      const move = (ev: PointerEvent) => {
        if (scrubbingRef.current) {
          onScrub(barFrac(ev.clientX) * (durationForScrubber || 0));
        }
      };
      const up = () => {
        scrubbingRef.current = false;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    };

    return (
      <div className="shorts settle-in">
        {videoOk ? (
          <video
            ref={videoRef}
            className="shorts__video"
            src={videoSrc}
            poster={session.posterDataUrl ?? '/video-poster.jpg'}
            playsInline
            preload="metadata"
            controls={false}
            onClick={onTapVideo}
          />
        ) : (
          <div className="shorts__video shorts__video--mock" onClick={onTapVideo}>
            <MockVideoFrame t={sessionPlayhead} warmth={session.audience.warmth} />
          </div>
        )}

        {/* Header matches every other mobile page: the ● rehearsal wordmark
            (app shell) sits on its own line at top, the page title stacks below
            it via the shared <ScreenTitle>. The × is pinned top-right. */}
        <CloseButton onClick={goHome} />
        <ScreenTitle>{event ? `Insights · ${event.name}` : 'Insights'}</ScreenTitle>

        {/* Center play/pause flash */}
        {(tapFlash || !isPlaying) && (
          <div className={`shorts__flash${tapFlash ? ' is-flash' : ''}`} aria-hidden>
            <svg viewBox="0 0 24 24" width="34" height="34">
              {isPlaying ? (
                <g fill="#fff">
                  <rect x="6" y="5" width="4" height="14" rx="1" />
                  <rect x="14" y="5" width="4" height="14" rx="1" />
                </g>
              ) : (
                <path d="M8 5 L19 12 L8 19 Z" fill="#fff" />
              )}
            </svg>
          </div>
        )}

        {/* Stacking timed insight feed — bottom-anchored, newest at the base,
            older cards pushed up + blurred/faded by depth. */}
        <ShortsFeed cards={cards} playhead={sessionPlayhead} />

        {/* End overlay — a calm "what next" over a soft cream scrim (so the
            ink-deep stroked buttons stay legible). Tapping the scrim restarts
            playback + hides the overlay, like tapping the video. */}
        {ended && (
          <div className="shorts__end" onClick={onRestart}>
            <button
              className="btn btn--secondary"
              onClick={(e) => {
                e.stopPropagation();
                onRestart();
              }}
            >
              <svg
                className="shorts__end-ico"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M20 11a8 8 0 1 1 -2.3 -5.6L20 8" />
                <path d="M20 4v4h-4" />
              </svg>
              Watch again
            </button>
            {activeEventId && (
              <>
                <button
                  className="btn btn--secondary"
                  onClick={(e) => {
                    e.stopPropagation();
                    rehearseAgain(activeEventId);
                  }}
                >
                  Rehearse again
                </button>
                <button
                  className="btn btn--secondary"
                  onClick={(e) => {
                    e.stopPropagation();
                    openProgress(activeEventId);
                  }}
                >
                  See progress
                </button>
              </>
            )}
          </div>
        )}

        {/* Thin two-tone scrub bar — the only control */}
        <div
          className="shorts__bar"
          ref={barRef}
          onPointerDown={onBarDown}
          role="slider"
          aria-label="Scrub"
          aria-valuemin={0}
          aria-valuemax={Math.round(durationForScrubber)}
          aria-valuenow={Math.round(currentTime)}
        >
          <div className="shorts__bar-track">
            <div
              className="shorts__bar-played"
              style={{ width: `${playedFrac * 100}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="insights-screen settle-in">
      <div className="insights-screen__video">
        <Aura className="aura--purple-pink aura--insights" />
        {videoOk ? (
          <video
            ref={videoRef}
            className="insights-screen__videoel"
            src={videoSrc}
            poster={session.posterDataUrl ?? '/video-poster.jpg'}
            playsInline
            preload="metadata"
            controls={false}
            onClick={onTransport}
          />
        ) : (
          <MockVideoFrame t={sessionPlayhead} warmth={session.audience.warmth} />
        )}

        <CloseButton onClick={goHome} />
        {/* Shared glass-pill title (Progress etalon); no subtitle. */}
        <ScreenTitle>{event ? `Insights · ${event.name}` : 'Insights'}</ScreenTitle>

        {/* Center play button — only while paused/ended */}
        {!isPlaying && (
          <button
            className="play-center"
            onClick={onTransport}
            aria-label={transportLabel}
          >
            <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden>
              {ended ? (
                <path
                  d="M20 12a8 8 0 1 1 -2.343 -5.657l2.343 2.343M14 8h6V2"
                  stroke="#1F1A2E"
                  strokeWidth={2}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : (
                <path d="M8 5 L19 12 L8 19 Z" fill="#1F1A2E" />
              )}
            </svg>
          </button>
        )}

        {/* Right rail — moves as ONE unit; the top grip strip is the drag handle. */}
        <aside className="rail" ref={railDrag.ref} style={railDrag.style}>
          <div
            className={`rail__grip rail__drag-handle${railDrag.dragging ? ' is-dragging' : ''}`}
            {...railDrag.handleProps}
            aria-label="Move panel"
            role="button"
          />
          <div
            className={`rail__panel rail__panel--audience rail__drag-handle${railDrag.dragging ? ' is-dragging' : ''}`}
            {...railDrag.handleProps}
          >
            <div className="rail__label">AUDIENCE</div>
            <div className="rail__audience-scene">
              <Scene
                roomType={session.roomType}
                size={session.audience.size}
                warmth={session.audience.warmth}
                attention={attention}
                cameraMode="firstPerson"
                markers={session.markers}
                playheadSec={sessionPlayhead}
                projection={projection}
              />
              {replayEmojis.length > 0 && (
                <div className="reaction-layer" aria-hidden>
                  {replayEmojis.map((e) => (
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
          </div>

          <div className="rail__plaques">
            <LiveStatChip
              label="Calm"
              value={calmLive}
              hint={SCORE_EXPLAINERS.calm}
              series={sparkSeries.calm}
              showSpark={false}
            />
            <LiveStatChip
              label="Audience held"
              value={attention * 100}
              unit="%"
              hint={SCORE_EXPLAINERS.audienceHeld}
              series={sparkSeries.audience}
              showSpark={false}
            />
            <LiveStatChip
              label="Confidence"
              value={confidenceLive}
              hint={SCORE_EXPLAINERS.confidence}
              series={sparkSeries.confidence}
              showSpark={false}
            />
          </div>

          <div className="rail__panel rail__panel--feed">
            <div className="rail__label">INSIGHTS</div>
            <div className="rail__feed-scroll">
              <TerminalFeed
                cards={cards}
                sessionPlayhead={sessionPlayhead}
                timeline={session.timeline}
                onSeek={onSeekToCard}
              />
            </div>
          </div>
        </aside>
      </div>

      {/* Bottom bar — clean scrubber, no dots */}
      <div className="insights-screen__controls">
        <button
          className="btn-icon"
          onClick={onTransport}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M7 4 L20 12 L7 20 Z" fill="currentColor" />
            </svg>
          )}
        </button>
        <button
          className="btn-icon"
          onClick={onRestart}
          aria-label="Restart from the beginning"
          title="Restart"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M20 11a8 8 0 1 1 -2.3 -5.6L20 8" />
            <path d="M20 4v4h-4" />
          </svg>
        </button>
        <button
          className="btn-icon"
          onClick={toggleMute}
          aria-label={isMuted ? 'Unmute' : 'Mute'}
          title={isMuted ? 'Unmute' : 'Mute'}
          aria-pressed={isMuted}
        >
          {isMuted ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M6 15h-2a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1h2l3.5 -4.5a.8 .8 0 0 1 1.5 .5v14a.8 .8 0 0 1 -1.5 .5l-3.5 -4.5" />
              <path d="M16 10l4 4m0 -4l-4 4" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M15 8a5 5 0 0 1 0 8" />
              <path d="M17.7 5a9 9 0 0 1 0 14" />
              <path d="M6 15h-2a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1h2l3.5 -4.5a.8 .8 0 0 1 1.5 .5v14a.8 .8 0 0 1 -1.5 .5l-3.5 -4.5" />
            </svg>
          )}
        </button>
        <input
          className="scrub-input"
          type="range"
          min={0}
          max={durationForScrubber || 0.1}
          step={0.05}
          value={Math.min(currentTime, durationForScrubber || 0)}
          style={{
            '--fill': `${
              durationForScrubber > 0
                ? (Math.min(currentTime, durationForScrubber) / durationForScrubber) * 100
                : 0
            }%`,
          } as React.CSSProperties}
          onChange={(e) => onScrub(Number(e.target.value))}
        />
        <span className="timecode timecode--inline">
          {mmss(currentTime)} / {mmss(durationForScrubber)}
        </span>
        {activeEventId && (
          <div className="insights-screen__cta-group">
            <button
              className="btn btn--ghost btn--pill"
              onClick={() => openProgress(activeEventId)}
            >
              See progress
            </button>
            <button
              className="btn btn--pill"
              onClick={() => rehearseAgain(activeEventId)}
            >
              Rehearse again
            </button>
          </div>
        )}
      </div>

      {showStorageNotice && (
        <div
          className={`glass-toast ${noticeClosing ? 'is-closing' : ''}`}
          role="status"
        >
          <button
            className="glass-toast__close"
            onClick={dismissStorageNotice}
            aria-label="Dismiss"
          >
            ×
          </button>
          <div className="glass-toast__title">Your recording is saved</div>
          <div className="glass-toast__body">
            <span>A copy is in your Downloads folder.</span>
            <span>Another stays in this browser so you can watch it back here.</span>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// ShortsFeed — the mobile stacking timed insight feed. Cards show their FULL
// text (wrap to any height), newest at the base; older ones are pushed up by
// the MEASURED height of the cards below them (+ a gap) so they never overlap
// as they blur/fade. Derived purely from the playhead, so scrubbing the bar
// rebuilds the whole stack for free.
// =============================================================================

const FEED_CAP = 6;
const FEED_GAP = 8; // px between stacked cards
const DEPTH_OPACITY = [1, 0.68, 0.4, 0.18, 0];
const DEPTH_BLUR = [0, 1.5, 3, 5, 7];
const cardKey = (c: InsightCard) => `${c.kind}-${c.t}`;

function ShortsFeed({ cards, playhead }: { cards: InsightCard[]; playhead: number }) {
  // Newest at the base (depth 0); cap the rendered count.
  const feed = cards
    .filter((c) => c.t <= playhead)
    .slice(-FEED_CAP)
    .map((c, i, arr) => ({ card: c, depth: arr.length - 1 - i }));

  // Measured card heights, keyed by card. Re-measured every commit; converges
  // (we only set state when a height actually changes) and runs before paint.
  const refs = useRef(new Map<string, HTMLDivElement>());
  const [heights, setHeights] = useState<Record<string, number>>({});
  useLayoutEffect(() => {
    let changed = false;
    const next = { ...heights };
    for (const { card } of feed) {
      const el = refs.current.get(cardKey(card));
      if (el) {
        const h = el.offsetHeight;
        if (next[cardKey(card)] !== h) {
          next[cardKey(card)] = h;
          changed = true;
        }
      }
    }
    if (changed) setHeights(next);
  });

  // Bottom offset for a card at depth d = sum of (height + gap) of every card
  // below it (depth < d). Fall back to an estimate until a card is measured.
  const offsets = new Map<string, number>();
  let acc = 0;
  for (const { card } of [...feed].sort((a, b) => a.depth - b.depth)) {
    offsets.set(cardKey(card), acc);
    acc += (heights[cardKey(card)] ?? 46) + FEED_GAP;
  }

  return (
    <div className="shorts__feed" aria-live="polite">
      {feed.map(({ card, depth }) => {
        const k = Math.min(depth, DEPTH_OPACITY.length - 1);
        return (
          <div
            key={cardKey(card)}
            ref={(el) => {
              if (el) refs.current.set(cardKey(card), el);
              else refs.current.delete(cardKey(card));
            }}
            className={`shorts__fcard shorts__fcard--${
              card.kind === 'strongMoment' ? 'positive' : 'attention'
            }${depth === 0 ? ' is-base' : ''}`}
            style={{
              bottom: `${offsets.get(cardKey(card)) ?? 0}px`,
              opacity: DEPTH_OPACITY[k],
              filter: `blur(${DEPTH_BLUR[k]}px)`,
              transform: `scale(${1 - depth * 0.03})`,
            }}
          >
            <span className="shorts__fdot" aria-hidden />
            <span className="shorts__ftime">{mmss(card.t)}</span>
            <span className="shorts__ftext">{card.detail}</span>
          </div>
        );
      })}
    </div>
  );
}

function recentSeries(
  timeline: TimelinePoint[],
  nowSessionT: number,
  lookbackSec: number,
  samples: number,
): { calm: number[]; audience: number[]; confidence: number[] } {
  const start = Math.max(0, nowSessionT - lookbackSec);
  const span = Math.max(0.001, nowSessionT - start);
  const step = span / Math.max(1, samples - 1);
  const calm: number[] = [];
  const audience: number[] = [];
  const confidence: number[] = [];
  for (let i = 0; i < samples; i++) {
    const t = start + i * step;
    const p = sampleTimeline(timeline, t);
    if (!p) continue;
    calm.push(Math.max(0, Math.min(100, ((120 - p.pulse) / 60) * 100)));
    audience.push(p.attention * 100);
    confidence.push(p.confidence * 100);
  }
  return { calm, audience, confidence };
}
