// =============================================================================
// takeaways.ts — helpers for the insight cards that surface during replay.
// Cards are 1:1 with timeline markers; this file just supplies the supporting
// copy and the "what is the active card right now" lookup.
// =============================================================================

import type { Marker, MarkerKind, Session } from '../state/types';

export interface InsightCard {
  t: number;
  kind: MarkerKind;
  headline: string;
  detail: string;
}

const DETAIL: Record<MarkerKind, string> = {
  pulseSpike: 'Try a slow exhale before the next line — pulse settles quickly.',
  voiceWavered: 'Steady breathing and a slightly slower pace would clean this up.',
  longPause: 'Pauses are fine — but here the room started to drift. Bridge with a question.',
  fillerWords: 'Mark the spot in your notes. Swap fillers for a 1-second pause.',
  lostAttention: 'Eyes drifted. A question, or stepping forward, brings them back.',
  strongMoment: 'You hit a groove here — note the pacing and posture so you can repeat it.',
};

export const KIND_LABEL: Record<MarkerKind, string> = {
  pulseSpike: 'Pulse spike',
  voiceWavered: 'Voice wavered',
  longPause: 'Long pause',
  fillerWords: 'Filler words',
  lostAttention: 'Lost attention',
  strongMoment: 'Strong moment',
};

/**
 * Map each session marker to a fully-fleshed insight card.
 */
export function buildInsightCards(session: Session): InsightCard[] {
  return session.markers
    .map<InsightCard>((m: Marker) => ({
      t: m.t,
      kind: m.kind,
      headline: m.label,
      detail: DETAIL[m.kind],
    }))
    .sort((a, b) => a.t - b.t);
}

/**
 * Find the card whose t is closest to (and not after) the current playhead,
 * within a fade window. Returns null if nothing has surfaced yet.
 */
export function activeInsightCard(
  cards: InsightCard[],
  t: number,
  windowSec = 5,
): InsightCard | null {
  let active: InsightCard | null = null;
  for (const c of cards) {
    if (c.t <= t && t - c.t <= windowSec) active = c;
    if (c.t > t) break;
  }
  return active;
}
