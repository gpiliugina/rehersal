// =============================================================================
// AudienceLayout.ts — deterministic seat / standing positions for N avatars.
// Each room type gets its own layout strategy so the spatial vibe is right:
//   - meetingRoom:    rows of seated avatars at long table edge
//   - yourSpace:      a casual loose semicircle of standers/sitters
//   - conferenceStage: sparse, spread wider, all standing/seated without desks
//   - smallHuddle:    3–4 people very close to the speaker, intimate
//   - townHall:       tiered rows on raised levels, no desks
// =============================================================================

import type { RoomType } from '../state/types';

export interface AvatarSlot {
  position: [number, number, number]; // x, y, z
  rotationY: number;                  // radians — facing direction
  pose: 'seated' | 'standing';
  // A small per-avatar seed (0..1) so each avatar's idle motion is unique
  // without us needing a separate prop everywhere.
  variant: number;
  // True when the avatar's seat has a desk/table in front (only meetingRoom).
  // Used by Avatar.tsx so the stage/town-hall types don't show laptops/desks.
  hasDesk?: boolean;
}

export function layoutAudience(
  roomType: RoomType,
  size: number,
): AvatarSlot[] {
  if (size <= 0) return [];
  switch (roomType) {
    case 'meetingRoom':
      return meetingRoomLayout(size);
    case 'yourSpace':
      return yourSpaceLayout(size);
    case 'conferenceStage':
      return conferenceStageLayout(size);
    case 'smallHuddle':
      return smallHuddleLayout(size);
    case 'townHall':
      return townHallLayout(size);
  }
}

// Character-appropriate sample crowd size for the immersive Room gallery.
export function sampleCrowdSize(roomType: RoomType): number {
  switch (roomType) {
    case 'meetingRoom':
      return 8;
    case 'yourSpace':
      return 6;
    case 'conferenceStage':
      return 9;
    case 'smallHuddle':
      return 3;
    case 'townHall':
      return 10;
  }
}

// ---- meetingRoom -----------------------------------------------------------
// Rows of seated avatars at desks, facing the speaker (-z).
function meetingRoomLayout(size: number): AvatarSlot[] {
  const slots: AvatarSlot[] = [];
  const perRow = Math.max(3, Math.ceil(Math.sqrt(size * 1.6)));
  const rowSpacing = 1.7;
  const colSpacing = 1.25;
  let placed = 0;
  let row = 0;
  while (placed < size) {
    const inThisRow = Math.min(perRow, size - placed);
    const xStart = -((inThisRow - 1) * colSpacing) / 2;
    for (let c = 0; c < inThisRow; c++) {
      const jitter = ((row * 17 + c * 31) % 13) / 60 - 0.1;
      slots.push({
        position: [xStart + c * colSpacing + jitter, 0, 1.5 + row * rowSpacing],
        rotationY: Math.PI,
        pose: 'seated',
        variant: ((row * 7 + c * 13) % 100) / 100,
        hasDesk: true,
      });
      placed++;
    }
    row++;
  }
  return slots;
}

// ---- yourSpace -------------------------------------------------------------
// Loose semicircle in front of the speaker; alternating seated/standing.
function yourSpaceLayout(size: number): AvatarSlot[] {
  const slots: AvatarSlot[] = [];
  const perArc = 9;
  const arcs = Math.ceil(size / perArc);
  let placed = 0;
  for (let a = 0; a < arcs && placed < size; a++) {
    const radius = 2.2 + a * 1.4;
    const remaining = size - placed;
    const here = Math.min(perArc, remaining);
    const spread = Math.PI * (0.55 + a * 0.08);
    for (let i = 0; i < here; i++) {
      const tNorm = here === 1 ? 0.5 : i / (here - 1);
      const angle = -spread / 2 + tNorm * spread;
      const x = Math.sin(angle) * radius;
      const z = Math.cos(angle) * radius + 1;
      slots.push({
        position: [x, 0, z],
        rotationY: Math.PI + angle,
        pose: (placed + a) % 2 === 0 ? 'standing' : 'seated',
        variant: ((a * 11 + i * 7) % 100) / 100,
      });
      placed++;
    }
  }
  return slots;
}

// ---- conferenceStage -------------------------------------------------------
// Wide, sparse rows of seated avatars (no desks) starting further back —
// the speaker is on stage, so the audience reads as a distance away.
function conferenceStageLayout(size: number): AvatarSlot[] {
  const slots: AvatarSlot[] = [];
  const perRow = Math.max(5, Math.ceil(Math.sqrt(size * 2.4)));
  const rowSpacing = 1.5;
  const colSpacing = 1.1;
  let placed = 0;
  let row = 0;
  while (placed < size) {
    const inThisRow = Math.min(perRow, size - placed);
    const xStart = -((inThisRow - 1) * colSpacing) / 2;
    for (let c = 0; c < inThisRow; c++) {
      const jitter = ((row * 19 + c * 23) % 11) / 50 - 0.11;
      slots.push({
        // Push the first row back so the speaker reads as elevated.
        position: [xStart + c * colSpacing + jitter, 0, 3.2 + row * rowSpacing],
        rotationY: Math.PI,
        pose: 'seated',
        variant: ((row * 5 + c * 17) % 100) / 100,
      });
      placed++;
    }
    row++;
  }
  return slots;
}

// ---- smallHuddle -----------------------------------------------------------
// 3–4 people sitting very close to the speaker, intimate. If user pushes the
// slider higher the rest stand in a tight ring behind the first 4.
function smallHuddleLayout(size: number): AvatarSlot[] {
  const slots: AvatarSlot[] = [];
  const front = Math.min(size, 4);
  for (let i = 0; i < front; i++) {
    const tNorm = front === 1 ? 0.5 : i / (front - 1);
    const angle = -0.55 + tNorm * 1.1;
    const radius = 1.7;
    slots.push({
      position: [Math.sin(angle) * radius, 0, Math.cos(angle) * radius + 0.6],
      rotationY: Math.PI + angle,
      pose: 'seated',
      variant: ((i * 31) % 100) / 100,
    });
  }
  let placed = front;
  let ringIdx = 0;
  while (placed < size) {
    const ring = Math.floor(ringIdx / 6);
    const inRing = ringIdx % 6;
    const angle = -1.1 + (inRing / 5) * 2.2;
    const radius = 2.8 + ring * 0.9;
    slots.push({
      position: [Math.sin(angle) * radius, 0, Math.cos(angle) * radius + 0.5],
      rotationY: Math.PI + angle,
      pose: 'standing',
      variant: ((placed * 13 + ring * 9) % 100) / 100,
    });
    placed++;
    ringIdx++;
  }
  return slots;
}

// ---- townHall --------------------------------------------------------------
// Tiered rows on raised levels — each subsequent row sits ~0.45m higher,
// giving an amphitheater feel. No desks.
function townHallLayout(size: number): AvatarSlot[] {
  const slots: AvatarSlot[] = [];
  const perRow = Math.max(5, Math.ceil(Math.sqrt(size * 1.8)));
  const rowSpacing = 1.5;
  const colSpacing = 1.05;
  const tierHeight = 0.45;
  let placed = 0;
  let row = 0;
  while (placed < size) {
    const inThisRow = Math.min(perRow, size - placed);
    const xStart = -((inThisRow - 1) * colSpacing) / 2;
    for (let c = 0; c < inThisRow; c++) {
      const jitter = ((row * 11 + c * 29) % 9) / 50 - 0.09;
      slots.push({
        position: [
          xStart + c * colSpacing + jitter,
          row * tierHeight,
          2.5 + row * rowSpacing,
        ],
        rotationY: Math.PI,
        pose: 'seated',
        variant: ((row * 23 + c * 7) % 100) / 100,
      });
      placed++;
    }
    row++;
  }
  return slots;
}
