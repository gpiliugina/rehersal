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
  // Front row starts well back so it isn't huge/cropped at the camera (matches
  // the scale the other rooms read at). Rows follow at the same spacing.
  const frontZ = 2.7;
  let placed = 0;
  let row = 0;
  while (placed < size) {
    const inThisRow = Math.min(perRow, size - placed);
    const xStart = -((inThisRow - 1) * colSpacing) / 2;
    for (let c = 0; c < inThisRow; c++) {
      const jitter = ((row * 17 + c * 31) % 13) / 60 - 0.1;
      slots.push({
        position: [xStart + c * colSpacing + jitter, 0, frontZ + row * rowSpacing],
        rotationY: Math.PI,
        // Town hall — standing rows, no furniture.
        pose: 'standing',
        variant: ((row * 7 + c * 13) % 100) / 100,
      });
      placed++;
    }
    row++;
  }
  return slots;
}

// ---- yourSpace ("Meeting room") --------------------------------------------
// A continuous curved meeting crowd facing the speaker, seated at desks. Rows
// curve at increasing radius; alternate rows are offset by HALF a seat (brick
// stagger) and every person gets small position + rotation jitter, so heads
// never line up into columns/diagonals and there's no empty seam down the
// centre. Linear seat spacing > desk width, so desks don't overlap on the curve.
function yourSpaceLayout(size: number): AvatarSlot[] {
  const slots: AvatarSlot[] = [];
  const linearSeat = 1.35; // > desk width (1.2) so desks don't collide
  const row0Radius = 2.5;
  const rowGap = 1.6;
  let placed = 0;
  let row = 0;
  while (placed < size) {
    const radius = row0Radius + row * rowGap;
    const angStep = linearSeat / radius; // constant linear spacing per row
    const arcSpan = 2.2 + row * 0.15; // a touch wider further back
    let capacity = Math.floor(arcSpan / angStep) + 1;
    capacity = Math.min(capacity, size - placed);
    // Brick stagger: shift alternate rows half a seat so seats interleave and
    // the centre is always covered (no column / seam down the middle).
    const stagger = (row % 2) * (angStep / 2);
    const start = -((capacity - 1) * angStep) / 2 + stagger;
    for (let i = 0; i < capacity && placed < size; i++) {
      // Deterministic per-person jitter (stable across re-renders).
      const h = (Math.imul(row + 1, 73856093) ^ Math.imul(i + 1, 19349663)) >>> 0;
      const j1 = (h % 1000) / 1000 - 0.5;
      const j2 = ((h >>> 10) % 1000) / 1000 - 0.5;
      const j3 = ((h >>> 20) % 1000) / 1000 - 0.5;
      const angle = start + i * angStep + j2 * angStep * 0.22;
      const r = radius + j1 * 0.32;
      slots.push({
        position: [Math.sin(angle) * r, 0, Math.cos(angle) * r + 1.0],
        rotationY: Math.PI + angle + j3 * 0.3,
        pose: 'seated',
        variant: (h % 100) / 100,
      });
      placed++;
    }
    row++;
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
// A loose RING around the central table (ROOM_CONFIG.huddleTable), everyone
// FACING INWARD. The camera is one side of the huddle, so we leave an open arc
// on the camera side (we see the far faces) and fill the rest of the ring.
function smallHuddleLayout(size: number): AvatarSlot[] {
  const slots: AvatarSlot[] = [];
  const cx = 0;
  const cz = 2.0; // matches ROOM_CONFIG.smallHuddle.huddleTable
  const openArc = 1.5; // radians left open on the camera side (near ±π)
  const start = -Math.PI + openArc / 2;
  const span = 2 * Math.PI - openArc;
  const perRing = 7;
  for (let i = 0; i < size; i++) {
    const ring = Math.floor(i / perRing);
    const inRing = i % perRing;
    const here = Math.min(perRing, size - ring * perRing);
    const tNorm = here === 1 ? 0.5 : inRing / (here - 1);
    const theta = start + tNorm * span;
    const r = 1.75 + ring * 1.05 + (i % 2) * 0.12;
    slots.push({
      position: [cx + Math.sin(theta) * r, 0, cz + Math.cos(theta) * r],
      rotationY: theta + Math.PI, // face the centre / table
      pose: 'standing',
      variant: ((i * 37 + ring * 11) % 100) / 100,
    });
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
