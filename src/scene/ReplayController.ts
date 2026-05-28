// =============================================================================
// ReplayController.ts — sample the timeline + derive per-avatar warmth/attention.
//
// We expose two split signals so the Avatar can render posture (warmth) and
// gaze (attention) independently. Each avatar has a stable per-variant bias
// so the crowd doesn't react in lockstep.
// =============================================================================

import type { TimelinePoint } from '../state/types';

/**
 * Sample the timeline at time t. Linear interpolation between samples.
 * Returns null if the timeline is empty.
 */
export function sampleTimeline(
  timeline: TimelinePoint[],
  t: number,
): TimelinePoint | null {
  if (timeline.length === 0) return null;
  if (t <= timeline[0].t) return timeline[0];
  if (t >= timeline[timeline.length - 1].t)
    return timeline[timeline.length - 1];
  let lo = 0;
  let hi = timeline.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (timeline[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = timeline[lo];
  const b = timeline[hi];
  const k = (t - a.t) / (b.t - a.t);
  return {
    t,
    pulse: a.pulse + (b.pulse - a.pulse) * k,
    voiceSteadiness:
      a.voiceSteadiness + (b.voiceSteadiness - a.voiceSteadiness) * k,
    attention: a.attention + (b.attention - a.attention) * k,
    confidence: a.confidence + (b.confidence - a.confidence) * k,
  };
}

/**
 * Per-avatar warmth at this moment.
 *
 *   variant: 0..1 — stable personality offset for this avatar
 *   globalWarmth: 0..1 — what the user set / what the timeline encodes
 */
export function avatarWarmth(variant: number, globalWarmth: number): number {
  const bias = (variant - 0.5) * 0.4;
  return clamp01(globalWarmth + bias);
}

/**
 * Per-avatar attention.
 */
export function avatarAttention(
  variant: number,
  globalAttention: number,
): number {
  const bias = (variant - 0.5) * 0.5;
  return clamp01(globalAttention + bias);
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}
