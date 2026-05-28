// =============================================================================
// scoring.ts — derive plain-language scores from a simulated timeline.
// These are tunable. See block comment on each metric for the intent.
// =============================================================================

import { markerPolarity } from '../state/types';
import type { Marker, Scores, TimelinePoint } from '../state/types';

/**
 * CALM — how steady the speaker stayed.
 *
 * Lower pulse variability and a lower average pulse both raise this score.
 * Mapped against a generous "ideal" window so the demo feels rewarding.
 */
function calmScore(timeline: TimelinePoint[]): number {
  if (timeline.length === 0) return 0;
  const avg = mean(timeline.map((p) => p.pulse));
  const sd = stddev(timeline.map((p) => p.pulse));
  // Ideal avg ~85bpm, sd ~6. Worst-case avg 120, sd 18.
  const avgScore = mapClamped(avg, 120, 80, 0, 100);
  const sdScore = mapClamped(sd, 18, 5, 0, 100);
  return Math.round(0.5 * avgScore + 0.5 * sdScore);
}

/**
 * AUDIENCE HELD — average attention across the whole session, %.
 */
function audienceHeldScore(timeline: TimelinePoint[]): number {
  if (timeline.length === 0) return 0;
  return Math.round(mean(timeline.map((p) => p.attention)) * 100);
}

/**
 * CONFIDENCE — average of the simulated confidence channel.
 */
function confidenceScore(timeline: TimelinePoint[]): number {
  if (timeline.length === 0) return 0;
  return Math.round(mean(timeline.map((p) => p.confidence)) * 100);
}

/**
 * RECOVERY — how fast the speaker steadied after a wobble.
 *
 * For each "weak" marker we look at the confidence dip's depth and how
 * many seconds it took for confidence to climb back to the pre-wobble
 * baseline. A short recovery time scores higher.
 */
function recoveryScore(
  timeline: TimelinePoint[],
  markers: Marker[],
): number {
  const weak = markers.filter((m) => markerPolarity(m.kind) === 'attention');
  if (weak.length === 0 || timeline.length === 0) return 80;

  const sampleHz = timeline.length / Math.max(1, timeline[timeline.length - 1].t);
  const recoveries: number[] = [];

  for (const m of weak) {
    const i0 = Math.max(0, Math.floor((m.t - 3) * sampleHz));
    const baseline = timeline[i0]?.confidence ?? 0.5;
    let recoveredAt: number | null = null;
    for (let i = Math.floor(m.t * sampleHz); i < timeline.length; i++) {
      if (timeline[i].confidence >= baseline - 0.02) {
        recoveredAt = timeline[i].t;
        break;
      }
    }
    if (recoveredAt == null) recoveries.push(40); // never recovered → low
    else {
      const dt = recoveredAt - m.t;
      // <8s → ~95, 30s → ~50, >60s → ~25
      recoveries.push(mapClamped(dt, 60, 6, 25, 95));
    }
  }
  return Math.round(mean(recoveries));
}

export function scoreTimeline(
  timeline: TimelinePoint[],
  markers: Marker[],
): Scores {
  const calm = calmScore(timeline);
  const audienceHeld = audienceHeldScore(timeline);
  const confidence = confidenceScore(timeline);
  const recovery = recoveryScore(timeline, markers);
  // Overall — weighted blend; confidence and audience matter most.
  const overall = Math.round(
    0.35 * confidence + 0.3 * audienceHeld + 0.2 * calm + 0.15 * recovery,
  );
  return { calm, audienceHeld, confidence, recovery, overall };
}

// ---- helpers ----------------------------------------------------------------
function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
}
function stddev(xs: number[]): number {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}
// Linearly map x in [a..b] onto [outA..outB], clamped at the ends.
function mapClamped(
  x: number,
  a: number,
  b: number,
  outA: number,
  outB: number,
): number {
  if (a === b) return outA;
  const t = (x - a) / (b - a);
  const tc = Math.max(0, Math.min(1, t));
  return outA + (outB - outA) * tc;
}

// Plain-language explanations for hover tooltips.
export const SCORE_EXPLAINERS: Record<keyof Scores, string> = {
  calm:
    "How steady you stayed. Lower and less jumpy pulse means a higher score.",
  audienceHeld:
    "Average share of the room paying attention to you, across the whole talk.",
  confidence:
    "How sure-of-yourself you sounded and looked, on average.",
  recovery:
    "How quickly you steadied after a wobble. Bouncing back fast scores higher.",
  overall:
    "A single blended score so you can see whether you're trending up over time.",
};
