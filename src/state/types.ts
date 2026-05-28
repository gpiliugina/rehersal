export type Screen =
  | 'home'
  | 'roomSelect'
  | 'audiencePreview'
  | 'rehearsing'
  | 'insights'
  | 'progress';

export type RoomType =
  | 'meetingRoom'
  | 'yourSpace'
  | 'conferenceStage'
  | 'smallHuddle'
  | 'townHall';

export interface AudienceConfig {
  size: number;       // exact integer count
  warmth: number;     // 0 = skeptical, 1 = friendly
  attention: number;  // 0 = distracted, 1 = engaged
}

export interface TimelinePoint {
  t: number;                // seconds since session start
  pulse: number;            // bpm
  voiceSteadiness: number;  // 0..1
  attention: number;        // 0..1 average audience attention
  confidence: number;       // 0..1
}

export type MarkerKind =
  | 'pulseSpike'
  | 'voiceWavered'
  | 'longPause'
  | 'fillerWords'
  | 'lostAttention'
  | 'strongMoment';

export type MarkerPolarity = 'positive' | 'attention';

export function markerPolarity(kind: MarkerKind): MarkerPolarity {
  return kind === 'strongMoment' ? 'positive' : 'attention';
}

export interface Marker {
  t: number;
  kind: MarkerKind;
  label: string;            // human-readable, e.g. "Voice tightened here"
  // Legacy field — kept on read so v2 sessions still typecheck. New writes
  // omit it; new code should branch on `kind`.
  type?: 'weak' | 'strong';
}

// Kept as a type alias so old imports keep working.
export type MarkerType = 'weak' | 'strong';

export interface Scores {
  calm: number;         // 0..100 — how steady you stayed
  audienceHeld: number; // 0..100 — % attention kept
  confidence: number;   // 0..100
  recovery: number;     // 0..100 — how fast you steadied after a wobble
  overall: number;      // 0..100
}

export type SwayLevel = 'Steady' | 'Light' | 'Restless';
export type GestureLevel = 'Still' | 'Measured' | 'Active' | 'Busy';
export type HeadTurnLevel = 'Forward' | 'Scanning' | 'Restless';

/**
 * Real diagnostic readings derived from a rehearsal — the numbers Progress
 * actually plots. Computed at finalizeSession from the timeline + markers
 * + a seeded RNG (movement, which we don't track live).
 */
export interface Diagnostics {
  // BODY
  peakPulse: number;          // bpm
  settleTimeSec: number;      // first time pulse calms after the opening
  // VOICE
  fillersPerMin: number;
  longPauses: number;
  toneSteadiness: number;     // 0..1, avg voice steadiness
  // ROOM
  lostAttentionTimes: number[]; // seconds within the rehearsal
  // MOVEMENT (synthesized — not from real signals)
  groundedPct: number;        // 0..100
  swayLevel: SwayLevel;
  handGestures: GestureLevel;
  headTurns: HeadTurnLevel;
}

export interface Session {
  id: string;
  createdAt: number;
  roomType: RoomType;
  audience: AudienceConfig;
  durationSec: number;
  timeline: TimelinePoint[];
  markers: Marker[];
  scores: Scores;
  diagnostics: Diagnostics;
}

// The default room + audience the user wants to rehearse against for a
// given talk. Set the first time the talk is rehearsed, editable from the
// Recap or Progress screens, stable across subsequent rehearsals.
export interface HomeSetup {
  roomType: RoomType;
  audience: AudienceConfig;
}

// A "talk" the user is preparing for. Holds many rehearsal sessions.
export interface Event {
  id: string;
  name: string;
  createdAt: number;
  sessions: Session[];
  homeSetup?: HomeSetup;
}

// Used while the user is configuring a new session in the flow.
export interface DraftSession {
  roomType?: RoomType;
  audience: AudienceConfig;
}
