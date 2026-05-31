// =============================================================================
// useAudienceEngagement.ts — turn the speaker's LIVE voice into one global
// ENGAGEMENT value (the spine), plus momentary audience REACTIONS and earned
// EMOJI. Extends the existing animation engine: discrete reactions are emitted
// as SYNTHETIC MARKERS so the avatars play them through the same participation /
// stagger path the Insights replay uses.
//
// Taps the EXISTING mic MediaStream (never re-requesting the device); the
// AudioContext is created + resumed from the Start click gesture via prime().
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Marker, MarkerKind } from '../state/types';
import { pickEmoji } from '../scene/audienceAnimation';
import type { ScreenHead } from '../scene/AudiencePreview';

// ---- Tunable constants (all in one place) ----------------------------------
// Audio → energy/dynamics
const ENERGY_GAIN = 4; // rms → energy scale
const ENERGY_ATTACK = 0.45;
const ENERGY_RELEASE = 0.08;
const RMS_WINDOW_SEC = 3;
const DYN_FULL = 0.05; // stddev of windowed RMS mapping to dynamics = 1

// Engagement spine (fast-ish rise, slow fall):
const ENGAGE_HIGH = 0.95;
const ENGAGE_LOW = 0.1;
const ENGAGE_RISE = 0.55; // toward high (fast)
const ENGAGE_FALL = 0.14; // toward low (slow)
const ENGAGE_DRIFT = 0.1; // toward room baseline when neutral
const STATE_PUSH_MS = 90; // commit engagement to React state at ~11Hz

// What counts as expressive vs flat:
const ENGAGE_ENERGY = 0.16; // sustained delivery
const ENGAGE_DYN = 0.1; // ...with variation
const SILENCE_RMS = 0.012;
const SILENCE_SEC = 3; // long pause
const QUIET_ENERGY = 0.06;
const QUIET_SEC = 5;
const MONOTONE_DYN = 0.12;
const MONOTONE_SEC = 7;

// Discrete reaction triggers (rate-limited per kind):
const PEAK_ENERGY = 0.4; // emphasis peak (strongMoment)
const BIG_PEAK_ENERGY = 0.6; // big peak — fire 🔥 + 2-emoji burst eligible
const PEAK_GAP_MS = 1800;
const DISENGAGE_GAP_MS = 3500; // lostAttention / fillerWords cadence
const WAVER_FROM = 0.3; // was at least this loud...
const WAVER_DROP = 0.45; // ...then fell below this fraction (mid-sentence drop)
const WAVER_GAP_MS = 4000;
const NOD_GAP_MS = 4500; // periodic nods while sustained-high
const PAUSE_RESET_RMS = 0.02; // sound returning re-arms the long-pause trigger

// Emoji (positive only, earned):
const EMOJI_ENGAGE_MIN = 0.55; // only spawn while engagement is sustained high
const EMOJI_GAP_MS = 2500; // at most ~1 / 2.5s
const EMOJI_LIFETIME_MS = 1800;
// Fallback crowd band if no projected heads are available.
const SPAWN_X = [0.18, 0.82] as const;
const SPAWN_Y = [0.3, 0.58] as const;

export interface EmojiReaction {
  id: number;
  char: string;
  x: number;
  y: number;
}

interface Args {
  getStream: () => MediaStream | null;
  active: boolean;
  baseAttention: number;
  getElapsed: () => number; // rehearsal seconds — synthetic marker timestamps
  projection: React.MutableRefObject<ScreenHead[] | null>;
}

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const MARKER_LABEL: Record<MarkerKind, string> = {
  strongMoment: 'Strong moment',
  longPause: 'Long pause',
  fillerWords: 'Filler / drift',
  lostAttention: 'Lost the room',
  voiceWavered: 'Voice wavered',
  pulseSpike: '',
};

export function useAudienceEngagement({
  getStream,
  active,
  baseAttention,
  getElapsed,
  projection,
}: Args) {
  const [engagement, setEngagement] = useState(baseAttention);
  const [liveMarkers, setLiveMarkers] = useState<Marker[]>([]);
  const [emojis, setEmojis] = useState<EmojiReaction[]>([]);
  const [hasMic, setHasMic] = useState(false);
  const idRef = useRef(0);
  const markersRef = useRef<Marker[]>([]);

  const audio = useRef<{
    ctx: AudioContext | null;
    source: MediaStreamAudioSourceNode | null;
    analyser: AnalyserNode | null;
    buf: Uint8Array<ArrayBuffer> | null;
  }>({ ctx: null, source: null, analyser: null, buf: null });

  const live = useRef({
    energy: 0,
    recentMax: 0,
    engagement: baseAttention,
    rmsBuf: [] as { t: number; v: number }[],
    silenceSec: 0,
    quietSec: 0,
    monotoneSec: 0,
    pauseArmed: true,
    last: {} as Record<string, number>,
    lastPushAt: 0,
    lastTime: 0,
  });

  // --- spawn one emoji at a (visible) avatar head, or the crowd band ---------
  const spawnEmoji = useCallback(
    (bigPeak: boolean) => {
      const heads = (projection.current ?? []).filter((h) => h.visible);
      const at = heads.length
        ? heads[Math.floor(Math.random() * heads.length)]
        : { x: rand(SPAWN_X[0], SPAWN_X[1]), y: rand(SPAWN_Y[0], SPAWN_Y[1]) };
      const id = idRef.current++;
      const e: EmojiReaction = {
        id,
        char: pickEmoji(bigPeak),
        x: at.x,
        // nudge slightly above the head so it reads as floating off the top
        y: Math.max(0.04, at.y - 0.04),
      };
      setEmojis((list) => [...list, e]);
      window.setTimeout(
        () => setEmojis((list) => list.filter((x) => x.id !== id)),
        EMOJI_LIFETIME_MS,
      );
    },
    [projection],
  );

  // --- emit a synthetic marker (reuses the reaction engine on a subset) ------
  const emitMarker = useCallback(
    (kind: MarkerKind) => {
      const m: Marker = { t: getElapsed(), kind, label: MARKER_LABEL[kind] };
      markersRef.current = [...markersRef.current, m];
      setLiveMarkers(markersRef.current);
    },
    [getElapsed],
  );

  // Create + RESUME the AudioContext from a user gesture (the Start click).
  const prime = useCallback(() => {
    const A = audio.current;
    if (A.analyser && A.ctx) {
      void A.ctx.resume();
      return;
    }
    const stream = getStream();
    const track = stream?.getAudioTracks()[0];
    if (!stream || !track || track.readyState !== 'live') return;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;
    try {
      const ctx = new AudioCtx();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0;
      source.connect(analyser);
      void ctx.resume();
      const buf = new Uint8Array(new ArrayBuffer(analyser.fftSize));
      audio.current = { ctx, source, analyser, buf };
      const L = live.current;
      L.engagement = baseAttention;
      L.lastTime = performance.now();
      setHasMic(true);
      ctx.resume().then(() => console.log('[engagement] AudioContext:', ctx.state));
    } catch (e) {
      console.warn('[engagement] setup failed', e);
    }
  }, [getStream, baseAttention]);

  // --- per-frame analysis + engagement + reaction/emoji emission ------------
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let stopped = false;

    const loop = (now: number) => {
      if (stopped) return;
      const A = audio.current;
      const L = live.current;
      if (A.analyser && A.ctx && A.buf) {
        if (A.ctx.state === 'suspended') void A.ctx.resume();
        const dt = Math.min(0.1, Math.max(0, (now - L.lastTime) / 1000));
        L.lastTime = now;
        const gap = (key: string, ms: number) => {
          if (now - (L.last[key] ?? -1e9) < ms) return false;
          L.last[key] = now;
          return true;
        };

        // RMS → energy (fast attack, slow release)
        A.analyser.getByteTimeDomainData(A.buf);
        let sum = 0;
        for (let i = 0; i < A.buf.length; i++) {
          const d = (A.buf[i] - 128) / 128;
          sum += d * d;
        }
        const rms = Math.sqrt(sum / A.buf.length);
        const target = Math.min(1, rms * ENERGY_GAIN);
        L.energy += (target - L.energy) * (target > L.energy ? ENERGY_ATTACK : ENERGY_RELEASE);
        const prevMax = L.recentMax;
        L.recentMax = Math.max(L.energy, L.recentMax - dt * 0.4); // decaying peak

        // dynamics = stddev of windowed RMS, scaled
        L.rmsBuf.push({ t: now, v: rms });
        const cutoff = now - RMS_WINDOW_SEC * 1000;
        while (L.rmsBuf.length && L.rmsBuf[0].t < cutoff) L.rmsBuf.shift();
        let mean = 0;
        for (const s of L.rmsBuf) mean += s.v;
        mean /= L.rmsBuf.length || 1;
        let varc = 0;
        for (const s of L.rmsBuf) varc += (s.v - mean) ** 2;
        varc /= L.rmsBuf.length || 1;
        const dynamics = Math.min(1, Math.sqrt(varc) / DYN_FULL);

        // timers
        const silent = rms < SILENCE_RMS;
        L.silenceSec = silent ? L.silenceSec + dt : 0;
        L.quietSec = L.energy < QUIET_ENERGY ? L.quietSec + dt : 0;
        L.monotoneSec = !silent && dynamics < MONOTONE_DYN ? L.monotoneSec + dt : 0;
        if (rms > PAUSE_RESET_RMS) L.pauseArmed = true;

        const expressive = L.energy > ENGAGE_ENERGY && dynamics > ENGAGE_DYN;
        const flat = L.silenceSec > SILENCE_SEC || L.quietSec > QUIET_SEC || L.monotoneSec > MONOTONE_SEC;

        // --- engagement spine (fast rise, slow fall) ---
        let eTarget: number;
        let rate: number;
        if (expressive) {
          eTarget = ENGAGE_HIGH;
          rate = ENGAGE_RISE;
        } else if (flat) {
          eTarget = ENGAGE_LOW;
          rate = ENGAGE_FALL;
        } else {
          eTarget = baseAttention;
          rate = ENGAGE_DRIFT;
        }
        L.engagement += (eTarget - L.engagement) * rate * dt * 3;
        L.engagement = Math.max(0, Math.min(1, L.engagement));

        // --- discrete reactions (synthetic markers) ---
        // Emphasis peak → strongMoment burst.
        if (
          prevMax < PEAK_ENERGY &&
          L.energy >= PEAK_ENERGY &&
          dynamics > ENGAGE_DYN &&
          gap('peak', PEAK_GAP_MS)
        ) {
          emitMarker('strongMoment');
        }
        // Sustained high engagement → occasional approving nod.
        if (L.engagement > 0.8 && gap('nod', NOD_GAP_MS)) emitMarker('strongMoment');
        // EMOJI — earned: while engagement is sustained high, ~1 / 2.5s; a big,
        // energetic peak adds a second (burst) and unlocks 🔥.
        if (L.engagement > EMOJI_ENGAGE_MIN && gap('emoji', EMOJI_GAP_MS)) {
          const big = L.energy >= BIG_PEAK_ENERGY && dynamics > ENGAGE_DYN;
          spawnEmoji(big);
          if (big) window.setTimeout(() => spawnEmoji(true), 220);
        }
        // Long pause → look-down / lean-back ripple (once per pause).
        if (L.silenceSec > SILENCE_SEC && L.pauseArmed) {
          L.pauseArmed = false;
          emitMarker('longPause');
        }
        // Sustained monotone / quiet → gradual disengage (fidget / glance away).
        if (
          (L.monotoneSec > MONOTONE_SEC || L.quietSec > QUIET_SEC) &&
          gap('disengage', DISENGAGE_GAP_MS)
        ) {
          emitMarker(Math.random() < 0.5 ? 'lostAttention' : 'fillerWords');
        }
        // Sudden mid-sentence energy drop → a couple of skeptical tilts.
        if (
          prevMax > WAVER_FROM &&
          L.energy < prevMax * WAVER_DROP &&
          !silent &&
          gap('waver', WAVER_GAP_MS)
        ) {
          emitMarker('voiceWavered');
        }

        // commit engagement to state (throttled)
        if (now - L.lastPushAt > STATE_PUSH_MS) {
          L.lastPushAt = now;
          setEngagement(L.engagement);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
    };
  }, [active, baseAttention, emitMarker, spawnEmoji]);

  // Tear down the AudioContext on unmount.
  useEffect(
    () => () => {
      const A = audio.current;
      try {
        A.source?.disconnect();
        A.analyser?.disconnect();
        void A.ctx?.close();
      } catch {
        /* ignore */
      }
      audio.current = { ctx: null, source: null, analyser: null, buf: null };
    },
    [],
  );

  return { engagement, liveMarkers, emojis, hasMic, prime };
}
