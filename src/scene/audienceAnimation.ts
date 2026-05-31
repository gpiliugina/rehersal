// =============================================================================
// audienceAnimation.ts — the "alive crowd" engine.
//
// Two layers run concurrently per avatar, blended every frame in Avatar.tsx:
//   LAYER 1 — AMBIENT: breathe + weight-shift + idle head-turn + blink. Never
//             stops, even during a reaction. Per-avatar random phase so the
//             crowd never moves in lockstep.
//   LAYER 2 — REACTIONS: driven by the pre-rolled session markers (the same
//             timeline that feeds the Insights feed). When the playhead crosses
//             a marker, the reaction broadcasts to each avatar with a random
//             0–2s delay and a per-kind participation chance, then eases back.
//
// All transforms are local-space; positive body rotation.x = lean toward the
// speaker, negative head rotation.x = look down (matches the existing Avatar
// posture convention). Subtle over showy — angles here are deliberately small.
// =============================================================================

import type { MarkerKind } from '../state/types';

// ---- per-avatar personality -------------------------------------------------
// Stable for an avatar's lifetime. Drives ambient phase + reaction flavour so
// no two avatars breathe, drift, or react on the same beat.
export interface Personality {
  rng: () => number; // ongoing stream — head-turn targets, blink cadence
  expressiveness: number; // 0.7–1.3 reaction-amplitude multiplier
  patience: number; // 0.6–1.5 — how slowly it disengages when delivery goes flat
  breathePhase: number;
  breatheOmega: number; // 2.5–3.5s breathing cycle
  shiftPhase: number;
  shiftOmega: number; // 9–15s weight-shift cycle
  yawSign: 1 | -1; // preferred "look-away" side
  headTurnOffset: number; // staggers the first idle head-turn
  blinkPhase: number;
}

// mulberry32 — tiny deterministic PRNG so a given seed always yields the same
// personality (stable across re-renders, varied across avatars).
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makePersonality(seed: number): Personality {
  const rng = mulberry32(seed);
  return {
    rng,
    expressiveness: 0.7 + rng() * 0.6,
    patience: 0.6 + rng() * 0.9,
    breathePhase: rng() * Math.PI * 2,
    breatheOmega: (Math.PI * 2) / (2.5 + rng() * 1.0),
    shiftPhase: rng() * Math.PI * 2,
    shiftOmega: (Math.PI * 2) / (9 + rng() * 6),
    yawSign: rng() < 0.5 ? -1 : 1,
    headTurnOffset: rng() * 8,
    blinkPhase: rng() * 5,
  };
}

// Stable hash → 0..1 for per-(avatar, marker) decisions (participate? delay?
// lean-or-nod?). Keeps choices deterministic without storing state.
export function decide(seed: number, markerIndex: number, salt: number): number {
  const s = Math.sin(seed * 0.013 + markerIndex * 7.13 + salt * 1.97) * 43758.5453;
  return s - Math.floor(s);
}

// ---- reactions --------------------------------------------------------------
// Fraction of the crowd that reacts to each event kind. pulseSpike is internal
// to the speaker — the audience can't see a heart rate, so they don't react.
export const PARTICIPATION: Record<MarkerKind, number> = {
  strongMoment: 0.7,
  longPause: 0.4,
  fillerWords: 0.2,
  lostAttention: 0.5,
  voiceWavered: 0.15,
  pulseSpike: 0,
};

// ---- expressions (eye poses) -----------------------------------------------
// Each avatar tweens between these (~EYE_TWEEN s, never snaps). Values are the
// per-eye targets the Avatar applies: scale + offset; `asym` narrows ONE eye
// (skeptical), `glance` shifts both toward the avatar's look-away side.
export type Expression =
  | 'neutral'
  | 'engaged'
  | 'happy'
  | 'bored'
  | 'distracted'
  | 'skeptical'
  | 'surprised';

export interface EyePose {
  sx: number; // scale x
  sy: number; // scale y (height — half-lids/wide)
  oy: number; // vertical offset (raised/lowered)
  glance: number; // horizontal glance (×yawSign)
  asym: number; // narrow the look-side eye (skeptical), 0..1
}

export const EYE_TWEEN = 0.15; // seconds to morph between expressions

export const EYE_POSES: Record<Expression, EyePose> = {
  neutral: { sx: 0.55, sy: 1.05, oy: 0, glance: 0, asym: 0 },
  engaged: { sx: 0.62, sy: 1.28, oy: 0.02, glance: 0, asym: 0 }, // wider + raised
  happy: { sx: 0.72, sy: 0.5, oy: 0.03, glance: 0, asym: 0 }, // eye-smile arcs
  bored: { sx: 0.55, sy: 0.48, oy: -0.015, glance: 0, asym: 0 }, // heavy half-lids
  distracted: { sx: 0.55, sy: 0.92, oy: 0, glance: 0.055, asym: 0 }, // glance away
  skeptical: { sx: 0.55, sy: 0.98, oy: 0, glance: 0.01, asym: 0.45 }, // one eye narrowed
  surprised: { sx: 0.9, sy: 1.45, oy: 0.025, glance: 0, asym: 0 }, // wide + round
};

// Baseline expression from continuous engagement (attention) + warmth, when no
// discrete reaction is overriding it.
export function baselineExpression(attention: number, warmth: number): Expression {
  if (attention > 0.72) return 'engaged';
  if (attention < 0.32) return warmth < 0.35 ? 'skeptical' : 'bored';
  return 'neutral';
}

// A scheduled/active reaction. Offsets are the FULL-strength targets; the
// per-frame envelope (0..1) scales them on enter/exit so nothing snaps.
export interface ReactionInstance {
  startAt: number; // clock seconds when motion begins (after broadcast delay)
  dur: number;
  env: 'plateau' | 'dip';
  expr: Expression; // eye expression to hold while this reaction is active
  posZ: number; // +toward speaker (lean in)
  bodyRotX: number; // +forward / −recline back
  pitch: number; // head, −down
  yaw: number; // head, side turn
  roll: number; // head, skeptical tilt
}

// Build the reaction an avatar will play for a given marker kind. `h(salt)`
// is the stable per-(avatar, marker) decision source. Returns null for kinds
// with no audience-visible reaction.
export function buildReaction(
  kind: MarkerKind,
  clockNow: number,
  h: (salt: number) => number,
  p: Personality,
): ReactionInstance | null {
  const delay = h(2) * 2; // 0–2s staggered broadcast
  const startAt = clockNow + delay;
  const s = p.expressiveness;
  const sign = p.yawSign;

  switch (kind) {
    case 'strongMoment':
      // Some give a quick surprised nod; some lean in, happy — split for variety.
      if (h(3) < 0.45) {
        return { startAt, dur: 0.65, env: 'dip', expr: 'surprised', posZ: 0, bodyRotX: 0, pitch: -0.14 * s, yaw: 0, roll: 0 };
      }
      return { startAt, dur: 2.2, env: 'plateau', expr: 'happy', posZ: 0.06 * s, bodyRotX: 0.04 * s, pitch: -0.09 * s, yaw: 0, roll: 0 };
    case 'longPause':
      // Look down + glance off, eyes off the speaker for a beat.
      return { startAt, dur: 2.6, env: 'plateau', expr: 'distracted', posZ: 0, bodyRotX: 0, pitch: -0.44 * s, yaw: 0.06 * sign, roll: 0 };
    case 'fillerWords':
      // Same as long-pause but lighter.
      return { startAt, dur: 1.8, env: 'plateau', expr: 'distracted', posZ: 0, bodyRotX: 0, pitch: -0.2 * s, yaw: 0, roll: 0 };
    case 'lostAttention':
      // Lean back + look away — the room "loses" you.
      return { startAt, dur: 3.4, env: 'plateau', expr: 'distracted', posZ: -0.03 * s, bodyRotX: -0.07 * s, pitch: 0.02, yaw: 0.52 * sign * s, roll: 0.04 * sign };
    case 'voiceWavered':
      // Mild skeptical head-tilt + narrowed eye.
      return { startAt, dur: 2.0, env: 'plateau', expr: 'skeptical', posZ: 0, bodyRotX: 0, pitch: 0, yaw: 0.1 * sign, roll: 0.16 * sign * s };
    case 'pulseSpike':
    default:
      return null;
  }
}

function smooth(x: number): number {
  const c = Math.max(0, Math.min(1, x));
  return c * c * (3 - 2 * c);
}

// 0 → 1 → 0 envelope across the reaction's lifetime. `plateau` eases in, holds,
// eases out; `dip` is a single smooth in-and-out (used by the nod).
export function envelope(inst: ReactionInstance, clockNow: number): number {
  const tau = clockNow - inst.startAt;
  if (tau <= 0 || tau >= inst.dur) return 0;
  if (inst.env === 'dip') return Math.sin(Math.PI * (tau / inst.dur));
  const attack = Math.min(0.4, inst.dur * 0.25);
  const release = Math.min(0.7, inst.dur * 0.35);
  if (tau < attack) return smooth(tau / attack);
  if (tau > inst.dur - release) return smooth((inst.dur - tau) / release);
  return 1;
}

// ---- emoji reactions (positive only, earned) -------------------------------
// Shared by the live audio driver and the Insights replay so both spawn the
// same weighted set. Fire (🔥) is reserved for BIG peaks at high engagement.
export const EMOJI_POOL: { char: string; weight: number }[] = [
  { char: '❤️', weight: 0.45 },
  { char: '👍', weight: 0.4 },
  { char: '🔥', weight: 0.15 },
];

export function pickEmoji(bigPeak: boolean, rnd: () => number = Math.random): string {
  const pool = bigPeak ? EMOJI_POOL : EMOJI_POOL.filter((e) => e.char !== '🔥');
  const total = pool.reduce((s, e) => s + e.weight, 0);
  let r = rnd() * total;
  for (const e of pool) if ((r -= e.weight) <= 0) return e.char;
  return pool[0].char;
}
