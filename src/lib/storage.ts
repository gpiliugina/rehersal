import { computeDiagnostics } from '../sim/session';
import type { Event, Marker, MarkerKind, Session } from '../state/types';

const KEY = 'rehearsal.events.v2';
const LEGACY_KEY = 'rehearsal.sessions.v1';

// v2 stored Marker.type ∈ {weak, strong}. v3 introduced richer kinds. Map
// legacy markers up so old localStorage data still renders nicely.
function migrateMarker(m: Marker): Marker {
  if (m.kind) return m;
  const legacyType = m.type;
  const kind: MarkerKind =
    legacyType === 'strong' ? 'strongMoment' : 'voiceWavered';
  return { ...m, kind };
}

function migrateSession(s: Session): Session {
  const markers = s.markers.every((m) => m.kind != null)
    ? s.markers
    : s.markers.map(migrateMarker);
  if (s.diagnostics) {
    return { ...s, markers };
  }
  // Pre-diagnostics session — backfill so Progress can render.
  const diagnostics = computeDiagnostics(
    s.id,
    s.durationSec,
    s.audience,
    s.timeline,
    markers,
  );
  return { ...s, markers, diagnostics };
}

// Legacy talks predate the homeSetup field. If sessions exist, fill the
// home setup from the most recent session so the recap screen has something
// to show; otherwise leave it absent (the talk is in "first rehearsal" mode).
function migrateEvent(event: Event): Event {
  const sessions = event.sessions.map(migrateSession);
  if (event.homeSetup || sessions.length === 0) {
    return { ...event, sessions };
  }
  const latest = sessions[0]; // newest first
  return {
    ...event,
    sessions,
    homeSetup: {
      roomType: latest.roomType,
      audience: { ...latest.audience },
    },
  };
}

function migrateEvents(events: Event[]): Event[] {
  return events.map(migrateEvent);
}

export function loadEvents(): Event[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return migrateEvents(parsed as Event[]);
    }
    // Migrate legacy flat sessions list into a single "Untitled talk" event
    // so users who tried the v1 demo don't lose their data.
    const legacyRaw = localStorage.getItem(LEGACY_KEY);
    if (legacyRaw) {
      const legacySessions = JSON.parse(legacyRaw) as Session[];
      if (Array.isArray(legacySessions) && legacySessions.length > 0) {
        const event: Event = {
          id: 'evt_legacy',
          name: 'Earlier rehearsals',
          createdAt: legacySessions[legacySessions.length - 1]?.createdAt ?? Date.now(),
          sessions: legacySessions,
        };
        saveEvents([event]);
        localStorage.removeItem(LEGACY_KEY);
        return [event];
      }
    }
    return [];
  } catch {
    return [];
  }
}

export function saveEvents(events: Event[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(events));
  } catch {
    // localStorage might be unavailable (e.g. private mode); ignore for a demo.
  }
}

export function newSessionId(): string {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function newEventId(): string {
  return `e_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
