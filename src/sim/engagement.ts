// =============================================================================
// engagement.ts — tunable model for how an audience reacts over a rehearsal.
//
// All signals (pulse / voice steadiness / audience attention / confidence) are
// SIMULATED for this concept demo. On real glasses these would come from
// sensors (pulse from PPG, voice from mic+ML, attention from camera/eye-gaze).
//
// Everything below is intentionally simple and deterministic given a seed so
// that the rehearsal timeline can be replayed identically in Insights.
// Tune the constants in TUNABLES to change the demo's "feel".
// =============================================================================

import type {
  AudienceConfig,
  TimelinePoint,
  Marker,
  MarkerKind,
} from '../state/types';

// ---- TUNABLES ---------------------------------------------------------------
export const TUNABLES = {
  sampleHz: 2,             // timeline samples per second
  basePulse: 78,           // resting pulse (bpm) before stage nerves
  openingNerveBpm: 26,     // bpm bump at the opening minute
  settlingHalfLifeSec: 60, // how fast the opening jitter calms
  pulseNoiseBpm: 4,        // small ongoing jitter
  baseVoiceSteadiness: 0.78,
  baseConfidence: 0.62,
  // How many "wobble" events to expect across a 4-minute talk; scaled by
  // (1 - warmth) so a skeptical room pushes more wobbles.
  wobblesPer4Min: 1.6,
  // How long a wobble lasts before recovery (seconds).
  wobbleSpanSec: 18,
  // How many "strong stretch" markers to drop, scaled by warmth.
  strongPer4Min: 1.4,
  strongSpanSec: 22,
};

// ---- Tiny seeded RNG (mulberry32) -------------------------------------------
export function makeRng(seedStr: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Smooth bell-shaped pulse around event center t0 with width w (seconds).
function bell(t: number, t0: number, w: number): number {
  const x = (t - t0) / w;
  return Math.exp(-x * x);
}

interface SimResult {
  timeline: TimelinePoint[];
  markers: Marker[];
}

/**
 * Generate a full simulated session timeline. Deterministic given the seed.
 *
 *   - Pulse: opening bump that decays, plus per-event spikes during wobbles
 *     and small ongoing noise. A skeptical / distracted room nudges baseline.
 *   - Voice steadiness: drops on wobbles, recovers smoothly.
 *   - Attention: starts near `audience.attention`, drifts and dips around
 *     wobbles, recovers stronger during strong stretches.
 *   - Confidence: composite that lags voice and pulse; the audience's mood
 *     pulls it up or down.
 */
export function simulate(
  audience: AudienceConfig,
  maxDurationSec: number,
  seed: string,
): SimResult {
  const rng = makeRng(seed);
  const n = Math.ceil(maxDurationSec * TUNABLES.sampleHz);
  const dt = 1 / TUNABLES.sampleHz;

  const warmthShift = audience.warmth - 0.5;        // -0.5..+0.5
  const attentionShift = audience.attention - 0.5;  // -0.5..+0.5

  // Plan wobble and strong-stretch events ahead of time so we can also
  // emit markers at recognisable timestamps for the Insights overlay.
  const scaleMin = maxDurationSec / (4 * 60);
  const wobbleCount = Math.max(
    1,
    Math.round(TUNABLES.wobblesPer4Min * scaleMin * (1 - warmthShift)),
  );
  const strongCount = Math.max(
    1,
    Math.round(TUNABLES.strongPer4Min * scaleMin * (1 + warmthShift)),
  );

  // Event placement. The session is pre-generated for up to MAX_SESSION_SEC
  // (8 min), but most users will rehearse a short demo. To guarantee that any
  // session beyond ~25s contains at least one weak and one strong marker, we
  // front-load one of each into the first quarter / first 40% respectively,
  // then scatter the rest across the rest of the talk.
  const events: { t0: number; kind: 'weak' | 'strong'; w: number }[] = [];

  // Guaranteed early weak (absolute seconds — survives short demo rehearsals).
  events.push({
    t0: 12 + rng() * 10, // [12, 22] sec
    kind: 'weak',
    w: TUNABLES.wobbleSpanSec / 2,
  });
  // Guaranteed early-mid strong
  events.push({
    t0: 20 + rng() * 12, // [20, 32] sec
    kind: 'strong',
    w: TUNABLES.strongSpanSec / 2,
  });

  // Remaining weak events scatter across the back half
  for (let i = 1; i < wobbleCount; i++) {
    const t0 = maxDurationSec * 0.35 + rng() * maxDurationSec * 0.55;
    events.push({ t0, kind: 'weak', w: TUNABLES.wobbleSpanSec / 2 });
  }
  // Remaining strong events scatter from mid-talk onward
  for (let i = 1; i < strongCount; i++) {
    const t0 = maxDurationSec * 0.4 + rng() * maxDurationSec * 0.5;
    events.push({ t0, kind: 'strong', w: TUNABLES.strongSpanSec / 2 });
  }
  events.sort((a, b) => a.t0 - b.t0);

  // Variety pool for the "attention" markers — each event picks one of these
  // kinds (deterministic via the rng) so a single session shows a few
  // different shapes of feedback, not five copies of "voice wavered".
  const attentionKinds: MarkerKind[] = [
    'pulseSpike',
    'voiceWavered',
    'longPause',
    'fillerWords',
    'lostAttention',
  ];
  const labelsByKind: Record<MarkerKind, string[]> = {
    pulseSpike: [
      'Heart rate jumped near the opening',
      'Pulse spiked — nerves moment',
      'Pulse climbed during this stretch',
    ],
    voiceWavered: [
      'Voice tightened here',
      'Voice wavered briefly',
      'Volume dipped at this beat',
    ],
    longPause: [
      'Long pause — you lost momentum',
      'A held silence — felt heavier than intended',
      'Quiet stretch — the room noticed',
    ],
    fillerWords: [
      "Filler cluster: a run of 'ums'",
      "A few 'you knows' bunched up here",
      'Filler words leaned heavy in this stretch',
    ],
    lostAttention: [
      'Audience drifted here',
      'You lost a few eyes',
      'Attention dipped — try a question or pause',
    ],
    strongMoment: [
      'Confident, steady stretch',
      'Audience leaned in',
      'You found your rhythm here',
      'Clear, calm delivery',
    ],
  };

  // Two stable counters per kind so we cycle labels evenly across one session.
  const cycle: Record<MarkerKind, number> = {
    pulseSpike: 0,
    voiceWavered: 0,
    longPause: 0,
    fillerWords: 0,
    lostAttention: 0,
    strongMoment: 0,
  };

  const markers: Marker[] = events.map((e) => {
    const kind: MarkerKind =
      e.kind === 'strong'
        ? 'strongMoment'
        : attentionKinds[Math.floor(rng() * attentionKinds.length)];
    const pool = labelsByKind[kind];
    const label = pool[cycle[kind] % pool.length];
    cycle[kind]++;
    return { t: e.t0, kind, label };
  });

  const timeline: TimelinePoint[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const t = i * dt;

    // Opening nerves: a half-life decay over the first minute or so.
    const settlingFactor = Math.pow(
      0.5,
      t / TUNABLES.settlingHalfLifeSec,
    );
    let pulse =
      TUNABLES.basePulse +
      TUNABLES.openingNerveBpm * settlingFactor -
      warmthShift * 4 -
      attentionShift * 3;

    let voice = TUNABLES.baseVoiceSteadiness + warmthShift * 0.05;
    let attention = audience.attention;
    let confidence =
      TUNABLES.baseConfidence + warmthShift * 0.1 + attentionShift * 0.05;

    // Apply each scheduled event's influence around its center.
    for (const ev of events) {
      const b = bell(t, ev.t0, ev.w);
      if (ev.kind === 'weak') {
        pulse += 14 * b;
        voice -= 0.22 * b;
        attention -= 0.18 * b;
        confidence -= 0.18 * b;
      } else {
        pulse -= 2 * b;
        voice += 0.10 * b;
        attention += 0.14 * b;
        confidence += 0.16 * b;
      }
    }

    // Tiny ongoing noise so curves look organic.
    pulse += (rng() - 0.5) * TUNABLES.pulseNoiseBpm;
    voice += (rng() - 0.5) * 0.04;
    attention += (rng() - 0.5) * 0.04;
    confidence += (rng() - 0.5) * 0.03;

    timeline[i] = {
      t,
      pulse: clamp(pulse, 55, 145),
      voiceSteadiness: clamp01(voice),
      attention: clamp01(attention),
      confidence: clamp01(confidence),
    };
  }

  return { timeline, markers };
}

function clamp(x: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, x));
}
function clamp01(x: number) {
  return clamp(x, 0, 1);
}
