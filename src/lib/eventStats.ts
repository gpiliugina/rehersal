import type { Event, Session } from '../state/types';

export interface TrendInfo {
  latest: Session | null;
  trend: number; // delta of latest.overall vs prior session; 0 if none
}

/**
 * Get the latest session in an event (sessions stored newest-first) and
 * the overall-score delta against the session immediately before it.
 * Used in the Home events list and event-detail header.
 */
export function latestSessionTrend(ev: Event): TrendInfo {
  if (ev.sessions.length === 0) return { latest: null, trend: 0 };
  const latest = ev.sessions[0];
  const prior = ev.sessions[1];
  const trend = prior ? latest.scores.overall - prior.scores.overall : 0;
  return { latest, trend };
}
