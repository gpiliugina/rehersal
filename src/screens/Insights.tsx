import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, selectActiveEvent } from '../state/store';
import { AudiencePreview as Scene } from '../scene/AudiencePreview';
import { MockVideoFrame } from '../components/MockVideoFrame';
import { LiveStatChip } from '../components/LiveStatChip';
import { TerminalFeed } from '../components/TerminalFeed';
import { sampleTimeline } from '../scene/ReplayController';
import { ScreenTitle } from '../components/ScreenTitle';
import { mmss } from '../lib/format';
import { buildInsightCards } from '../lib/takeaways';
import type { InsightCard } from '../lib/takeaways';
import { SCORE_EXPLAINERS } from '../lib/scoring';
import type { TimelinePoint } from '../state/types';

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
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  // Tracks the user's audio preference. We initialise the video element as
  // muted on mount (so the seek-to-0.1 poster trick paints a still frame
  // before any user interaction), then sync to `isMuted` the moment the user
  // hits Play. After that the mute toggle button drives both this state and
  // `v.muted` directly.
  const [isMuted, setIsMuted] = useState(false);

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
    if (videoOk && v && v.duration > 0 && sDur > 0) {
      return (sessionT / sDur) * v.duration;
    }
    return sessionT;
  }

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
    const onError = () => setVideoOk(false);
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

  return (
    <div className="insights-screen">
      <div className="insights-screen__video">
        {videoOk ? (
          <video
            ref={videoRef}
            className="insights-screen__videoel"
            src={VIDEO_SRC}
            poster="/video-poster.jpg"
            playsInline
            preload="metadata"
            controls={false}
            onClick={onTransport}
          />
        ) : (
          <MockVideoFrame t={sessionPlayhead} warmth={session.audience.warmth} />
        )}

        <div className="insights-screen__top">
          <button className="btn btn--quiet" onClick={goHome}>← Back</button>
        </div>
        <ScreenTitle overlay>Insights</ScreenTitle>
        {/* Quiet header line, top-left under the back button. Sessions are
            stored newest-first so attempt# = total - index. */}
        {event && (() => {
          const idx = event.sessions.findIndex((s) => s.id === session.id);
          const attempt =
            idx >= 0 ? event.sessions.length - idx : event.sessions.length;
          return (
            <div className="header-line">
              <span className="header-line__name">{event.name}</span>
              <span className="header-line__dim"> · rehearsal {attempt}</span>
            </div>
          );
        })()}

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
                  stroke="#1f2230"
                  strokeWidth={2}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : (
                <path d="M8 5 L19 12 L8 19 Z" fill="#1f2230" />
              )}
            </svg>
          </button>
        )}

        {/* Right rail — audience preview locked, stats locked, scrollable feed */}
        <aside className="rail">
          <div className="rail__panel rail__panel--audience">
            <div className="rail__label">AUDIENCE</div>
            <div className="rail__audience-scene">
              <Scene
                roomType={session.roomType}
                size={session.audience.size}
                warmth={session.audience.warmth}
                attention={attention}
                cameraMode="firstPerson"
              />
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
