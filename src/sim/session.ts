// =============================================================================
// session.ts — build a finished Session from a draft (room + audience).
// Calls into engagement.ts for the timeline and scoring.ts for the scores.
// =============================================================================

import { makeRng, simulate } from './engagement';
import { scoreTimeline } from '../lib/scoring';
import { newSessionId } from '../lib/storage';
import type {
  AudienceConfig,
  Diagnostics,
  GestureLevel,
  HeadTurnLevel,
  Marker,
  MarkerKind,
  RoomType,
  Session,
  SwayLevel,
  TimelinePoint,
} from '../state/types';

// Pre-generate up to this many seconds; rehearsal truncates to elapsed time.
export const MAX_SESSION_SEC = 8 * 60;

// Demo rehearsals (and the mock video) are short (~5s). The live preview uses
// a marker arc compressed into this window so the audience visibly reacts
// during the clip instead of spacing events out as if for a multi-minute talk.
export const DEMO_DURATION_SEC = 5;

// Clips at or under this length get the compressed demo arc (see
// spreadMarkers); longer rehearsals keep the original even-spread logic.
const DEMO_MAX_SEC = 10;

interface BuildArgs {
  roomType: RoomType;
  audience: AudienceConfig;
}

/**
 * Pre-generate the full simulation deterministically from a fresh id.
 * Rehearsing plays through it in real time; if the user ends early we
 * slice the timeline and markers to the elapsed seconds before saving.
 *
 * NOTE: diagnostics are recomputed at `finalizeSession` once the actual
 * duration is known. Here we attach a placeholder so the type is satisfied.
 */
export function buildSession({ roomType, audience }: BuildArgs): Session {
  const id = newSessionId();
  const { timeline } = simulate(audience, MAX_SESSION_SEC, id);
  // The live Rehearsing scene reads these markers, so compress them into the
  // short demo window — otherwise the pre-rolled events sit minutes apart and
  // never fire during a ~5s demo. finalizeSession re-places them to the actual
  // rehearsed duration for the Insights replay.
  const markers = spreadMarkers(DEMO_DURATION_SEC, id);
  return {
    id,
    createdAt: Date.now(),
    roomType,
    audience,
    durationSec: MAX_SESSION_SEC,
    timeline,
    markers,
    scores: scoreTimeline(timeline, markers),
    diagnostics: computeDiagnostics(id, MAX_SESSION_SEC, audience, timeline, markers),
  };
}

/**
 * Truncate a fully-generated session to the actually-rehearsed duration
 * AND redistribute markers so the final session has 4–7 well-spaced moments
 * across [0, elapsed]. Markers from the pre-generated pool weren't designed
 * for arbitrary cut-offs (early ones cluster), so we re-place them once we
 * know the real duration.
 */
export function finalizeSession(
  session: Session,
  elapsedSec: number,
): Session {
  const cutoff = Math.max(5, Math.min(session.durationSec, elapsedSec));
  const timeline = session.timeline.filter((p) => p.t <= cutoff);
  const markers = spreadMarkers(cutoff, session.id);
  return {
    ...session,
    durationSec: cutoff,
    timeline,
    markers,
    scores: scoreTimeline(timeline, markers),
    diagnostics: computeDiagnostics(session.id, cutoff, session.audience, timeline, markers),
  };
}

// ---- diagnostics -----------------------------------------------------------
// All values derived from the timeline + markers that already exist. The
// movement signals (grounded%, sway, gestures, head turns) aren't modelled
// in the simulation, so we synthesise them deterministically per session id
// + the audience config so they tell a coherent story across attempts.
export function computeDiagnostics(
  sessionId: string,
  durationSec: number,
  audience: AudienceConfig,
  timeline: TimelinePoint[],
  markers: Marker[],
): Diagnostics {
  // ---- BODY ----
  let peakPulse = 0;
  for (const p of timeline) if (p.pulse > peakPulse) peakPulse = p.pulse;
  peakPulse = Math.round(peakPulse);

  // Settling = first time the pulse drops to within ~5 bpm of the late-talk
  // average AND stays that way for at least 5 seconds.
  let settleTimeSec = durationSec;
  if (timeline.length > 8) {
    const lateStart = Math.floor(timeline.length * 0.66);
    let lateSum = 0, lateCount = 0;
    for (let i = lateStart; i < timeline.length; i++) {
      lateSum += timeline[i].pulse;
      lateCount++;
    }
    const lateAvg = lateSum / Math.max(1, lateCount);
    const threshold = lateAvg + 5;
    for (let i = 0; i < timeline.length; i++) {
      if (timeline[i].t < 6) continue;
      if (timeline[i].pulse > threshold) continue;
      // Check it stays under threshold for 5s
      const tEnd = timeline[i].t + 5;
      let held = true;
      for (let j = i + 1; j < timeline.length && timeline[j].t < tEnd; j++) {
        if (timeline[j].pulse > threshold + 3) { held = false; break; }
      }
      if (held) {
        settleTimeSec = timeline[i].t;
        break;
      }
    }
  }

  // ---- VOICE ----
  const fillerMarkerCount = markers.filter((m) => m.kind === 'fillerWords').length;
  const longPauses = markers.filter((m) => m.kind === 'longPause').length;
  // Each filler-marker represents a cluster of ~4-7 'um's based on session-stable rng.
  const fillerRng = makeRng(sessionId + ':fillers');
  const perCluster = 4 + Math.floor(fillerRng() * 4);
  const totalFillers = fillerMarkerCount * perCluster;
  const fillersPerMin = Math.round((totalFillers / Math.max(15, durationSec)) * 60);
  let voiceSum = 0;
  for (const p of timeline) voiceSum += p.voiceSteadiness;
  const toneSteadiness = timeline.length > 0 ? voiceSum / timeline.length : 0.7;

  // ---- ROOM ----
  const lostAttentionTimes = markers
    .filter((m) => m.kind === 'lostAttention')
    .map((m) => Math.round(m.t));

  // ---- MOVEMENT (synthesised) ----
  const movement = synthesizeMovement(sessionId, audience, durationSec, markers);

  return {
    peakPulse,
    settleTimeSec: Math.round(settleTimeSec),
    fillersPerMin,
    longPauses,
    toneSteadiness,
    lostAttentionTimes,
    ...movement,
  };
}

function synthesizeMovement(
  sessionId: string,
  audience: AudienceConfig,
  durationSec: number,
  markers: Marker[],
): Pick<Diagnostics, 'groundedPct' | 'swayLevel' | 'handGestures' | 'headTurns'> {
  const rng = makeRng(sessionId + ':movement');
  // Warmer + more attentive audience → speaker more comfortable → more grounded.
  // Lots of "weak" markers (attention-type) drag groundedness down a touch.
  const attentionScore =
    markers.length === 0
      ? 0
      : markers.filter((m) => m.kind !== 'strongMoment').length /
        markers.length;
  const base = 56 + audience.warmth * 26 + audience.attention * 10;
  const penalty = attentionScore * 12;
  const jitter = (rng() - 0.5) * 14;
  const groundedPct = Math.round(
    Math.max(38, Math.min(96, base - penalty + jitter)),
  );

  const swayLevel: SwayLevel =
    groundedPct > 80 ? 'Steady' : groundedPct > 62 ? 'Light' : 'Restless';
  const headTurns: HeadTurnLevel =
    groundedPct > 78 ? 'Forward' : groundedPct > 60 ? 'Scanning' : 'Restless';
  // Hand gestures are less correlated to grounded%; pick a deterministic bucket.
  const handChoices: GestureLevel[] = ['Still', 'Measured', 'Active', 'Busy'];
  const handIdx = Math.floor(rng() * handChoices.length);
  const handGestures = handChoices[handIdx];

  // durationSec is unused above but kept on the signature so the API reads
  // like the others when we wire in a duration-sensitive signal later.
  void durationSec;

  return { groundedPct, swayLevel, handGestures, headTurns };
}

// ---- marker spread ---------------------------------------------------------

const ATTENTION_KINDS: MarkerKind[] = [
  'pulseSpike',
  'voiceWavered',
  'longPause',
  'fillerWords',
  'lostAttention',
];

const LABELS: Record<MarkerKind, string[]> = {
  pulseSpike: [
    'Heart rate jumped',
    'Pulse spiked',
    'Pulse climbed here',
  ],
  voiceWavered: [
    'Voice tightened here',
    'Voice wavered',
    'Volume dipped',
  ],
  longPause: [
    'Long pause — lost momentum',
    'Held silence — felt heavy',
    'Quiet stretch',
  ],
  fillerWords: [
    'Filler cluster',
    'Run of fillers',
    'Filler words bunched up',
  ],
  lostAttention: [
    'Audience drifted here',
    'Lost a few eyes',
    'Attention dipped',
  ],
  strongMoment: [
    'Confident, steady stretch',
    'Audience leaned in',
    'Found your rhythm',
    'Clear, calm delivery',
  ],
};

/**
 * Distribute 4–7 markers across [0, duration] with a balanced mix of kinds.
 *
 * Each marker sits roughly in its own segment so they aren't clustered. Two
 * strong moments are sprinkled in to keep the tone constructive; the rest
 * rotate through the attention pool without repeats back-to-back.
 *
 * Deterministic given the same seed so replays surface identical moments.
 */
// A varied, evenly-spaced reaction arc for short demo clips: a strong moment,
// a filler dip, a long pause, a lost-attention drift, a voice wobble (and a
// second strong moment for the longest clips). Hand-ordered so the crowd shows
// its full range; deterministic, so the live preview and replay match.
const DEMO_ARC: MarkerKind[] = [
  'strongMoment',
  'fillerWords',
  'longPause',
  'lostAttention',
  'voiceWavered',
  'strongMoment',
];

function spreadMarkersShort(duration: number): Marker[] {
  const count = clamp(Math.round(duration), 4, 6);
  const labelCycle: Partial<Record<MarkerKind, number>> = {};
  const out: Marker[] = [];
  for (let i = 0; i < count; i++) {
    const kind = DEMO_ARC[i];
    // Even interior spacing: e.g. a 5s/5-marker clip lands ~0.8s apart across
    // [0.8s … 4.2s], so reactions play through the whole demo.
    const t = (duration * (i + 1)) / (count + 1);
    const labels = LABELS[kind];
    const idx = (labelCycle[kind] ?? 0) % labels.length;
    labelCycle[kind] = (labelCycle[kind] ?? 0) + 1;
    out.push({ t, kind, label: labels[idx] });
  }
  return out;
}

function spreadMarkers(duration: number, seed: string): Marker[] {
  if (duration <= DEMO_MAX_SEC) {
    return spreadMarkersShort(duration);
  }
  const rng = makeRng(seed + ':markers');
  // 4 markers for very short demos, 7 for longer rehearsals.
  const count = clamp(Math.round(duration / 10), 4, 7);
  // Pick two well-placed "strong" slots out of N — never both at the very
  // start or very end, spread out from each other.
  const strongAt = new Set<number>();
  if (count >= 4) {
    strongAt.add(Math.floor(count * 0.35));
    strongAt.add(Math.floor(count * 0.78));
  }

  // Rotate through attention kinds with a shuffled starting offset, so the
  // session feels varied without showing the same kind twice in a row.
  const pool = [...ATTENTION_KINDS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  let poolIdx = 0;
  const labelCycle: Partial<Record<MarkerKind, number>> = {};

  const margin = Math.min(duration * 0.08, 4);
  const usable = Math.max(1, duration - margin * 2);
  const segDur = usable / count;

  const out: Marker[] = [];
  for (let i = 0; i < count; i++) {
    const center = margin + (i + 0.5) * segDur;
    const jitter = (rng() - 0.5) * segDur * 0.45;
    const t = clamp(center + jitter, margin, duration - margin);
    const kind: MarkerKind = strongAt.has(i)
      ? 'strongMoment'
      : pool[poolIdx++ % pool.length];
    const labels = LABELS[kind];
    const idx = (labelCycle[kind] ?? 0) % labels.length;
    labelCycle[kind] = (labelCycle[kind] ?? 0) + 1;
    out.push({ t, kind, label: labels[idx] });
  }
  return out;
}

function clamp(x: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, x));
}
