// =============================================================================
// rooms.ts — the SINGLE source for room display labels + order.
//
// Labels are keyed by the stable RoomType id (never by matching label text), so
// renames/rotations are safe and update everywhere the room name is shown (the
// Setup WHERE? chips, Progress/Insights references). ids, layouts, and colour
// mappings live elsewhere and are unaffected by relabelling here.
// =============================================================================

import type { RoomType } from '../state/types';

export const ROOM_LABELS: Record<RoomType, string> = {
  meetingRoom: 'Town hall',
  yourSpace: 'Meeting room',
  conferenceStage: 'Conference stage',
  smallHuddle: 'Small huddle',
  townHall: 'Lecture hall',
};

// Display order for the WHERE? chip list.
export const ROOM_ORDER: RoomType[] = [
  'meetingRoom',
  'yourSpace',
  'conferenceStage',
  'smallHuddle',
  'townHall',
];

export function roomLabel(type: RoomType): string {
  return ROOM_LABELS[type] ?? type;
}

// ---- per-room furniture descriptor -----------------------------------------
// `seat` = what each person sits/stands at; `huddleTable` = a single central
// table (small huddle). Arrangement lives in AudienceLayout; clothing colour is
// unchanged. (Labels rotated; ids are stable — descriptors key off the id.)
export type SeatKind = 'desk' | 'chair' | 'none';
export interface RoomConfig {
  seat: SeatKind;
  huddleTable?: [number, number, number];
}
export const ROOM_CONFIG: Record<RoomType, RoomConfig> = {
  meetingRoom: { seat: 'none' }, // "Town hall" — just people, no tables/laptops
  yourSpace: { seat: 'desk' }, // "Meeting room" — canonical desk + dark laptop
  conferenceStage: { seat: 'chair' }, // chairs/benches, nothing in front
  smallHuddle: { seat: 'none', huddleTable: [0, 0, 2.0] }, // ring + central table
  townHall: { seat: 'desk' }, // "Lecture hall" — desks + dark laptops, rows
};
