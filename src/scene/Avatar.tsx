import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CanvasTexture, Group, Mesh } from 'three';
import type { AvatarSlot } from './AudienceLayout';
import { Chair, DeskLaptop } from './Furniture';
import type { SeatKind } from '../lib/rooms';
import type { Marker } from '../state/types';
import {
  makePersonality,
  decide,
  buildReaction,
  envelope,
  baselineExpression,
  EYE_POSES,
  EYE_TWEEN,
  PARTICIPATION,
  type Expression,
  type ReactionInstance,
} from './audienceAnimation';

interface Props {
  slot: AvatarSlot;
  /** Clothing colour (body + arms + legs) — the ROOM colour, same for everyone. */
  clothing: string;
  /** What this person sits/stands at (per-room): desk+laptop, chair, or nothing. */
  seat: SeatKind;
  /**
   * Warmth 0..1 — drives POSTURE / lean. Low warmth = closed off (pulled back,
   * shoulders rolled forward, arms tight). High warmth = open + leaned in.
   */
  warmth: number;
  /**
   * Attention 0..1 — drives GAZE + lean-in. Low = head off / down / fidgeting;
   * high = eyes forward on the speaker.
   */
  attention: number;
  // Disable subtle idle animation (used for static thumbnails).
  freeze?: boolean;
  // The pre-rolled session-event timeline. When the playhead crosses one of
  // these, the avatar may play a reaction. Omitted in static previews.
  markers?: Marker[];
  // Current playback position (session seconds). Drives reaction firing.
  playheadSec?: number;
}

// ---- Proportions (relative units; FIG_SCALE brings them to row size) -------
const FIG_SCALE = 0.6;
const SKIN = '#EFE7D6'; // head only — one tone for everyone (--color-bg-sunken)
const EYE = '#1F1A2E'; // ink-deep
const HEAD_Y = 2.15; // float height — head hovers a hairline above the body

// Shared soft radial contact-shadow texture (built once, reused by all figures).
let shadowTex: CanvasTexture | null = null;
function contactShadow(): CanvasTexture | null {
  if (shadowTex) return shadowTex;
  if (typeof document === 'undefined') return null;
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(40,30,20,0.30)');
  g.addColorStop(0.55, 'rgba(40,30,20,0.14)');
  g.addColorStop(1, 'rgba(40,30,20,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  shadowTex = new CanvasTexture(c);
  return shadowTex;
}

export function Avatar({
  slot,
  clothing,
  seat,
  warmth,
  attention,
  freeze,
  markers,
  playheadSec = 0,
}: Props) {
  const bodyRef = useRef<Group>(null);
  const headRef = useRef<Group>(null);
  const eyesRef = useRef<Group>(null);
  const leftEyeRef = useRef<Mesh>(null);
  const rightEyeRef = useRef<Mesh>(null);
  // Current (tweened) eye pose — morphs toward the active expression.
  const eyePose = useRef({ sx: 0.55, sy: 1.05, oy: 0, glance: 0, asym: 0 });
  const shadow = useMemo(contactShadow, []);

  // Stable per-avatar personality + seed. Mix position into the seed so two
  // slots that happen to share a `variant` still get distinct phases (and
  // blink timing — they never blink in unison).
  const seed = useMemo(
    () =>
      (Math.floor(
        (slot.variant * 9301 + slot.position[0] * 131 + slot.position[2] * 17) *
          1000,
      ) >>> 0) || 1,
    [slot.variant, slot.position],
  );
  const p = useMemo(() => makePersonality(seed), [seed]);

  // Posture from WARMTH + ATTENTION:
  //   leanX:  +ve = lean forward (engaged/warm); -ve = pull back (cold/bored)
  const leanX = (warmth - 0.5) * 0.4 + (attention - 0.5) * 0.25;
  const armTuck = Math.max(0, 0.5 - warmth); // low warmth → arms pull in
  const shoulderRoll = (0.5 - warmth) * 0.25;
  const pitchBase = (1 - attention) * -0.42; // distracted → head droops down
  const headRollBase = (0.5 - warmth) * 0.18; // skeptical → slight tilt

  // Seated bodies sit UP on the seat (base near the chair seat), not sunk into
  // the floor — so they read as sitting IN the armchair, not in front of it.
  const seatedYOffset = slot.pose === 'seated' ? 0.12 : 0;

  // --- live animation state (refs so it survives re-renders) ---
  const playheadRef = useRef(playheadSec);
  playheadRef.current = playheadSec;
  const processedUpTo = useRef(playheadSec);
  const reaction = useRef<ReactionInstance | null>(null);
  const smoothYaw = useRef(0);
  const turn = useRef({ target: 0, until: 0, next: -1 });
  const blink = useRef({ until: 0, next: -1 });

  useFrame((state, delta) => {
    const body = bodyRef.current;
    const head = headRef.current;
    if (!body || !head || freeze) return;
    const t = state.clock.elapsedTime;

    // --- reaction firing: detect playhead crossing a marker ---
    const playhead = playheadRef.current;
    if (playhead < processedUpTo.current - 0.4) {
      processedUpTo.current = playhead;
    }
    if (markers) {
      for (let i = 0; i < markers.length; i++) {
        const m = markers[i];
        if (m.t > processedUpTo.current && m.t <= playhead) {
          const part = PARTICIPATION[m.kind] ?? 0;
          if (part > 0 && decide(seed, i, 1) < part) {
            const inst = buildReaction(m.kind, t, (salt) => decide(seed, i, salt), p);
            if (inst) reaction.current = inst;
          }
        }
      }
      processedUpTo.current = Math.max(processedUpTo.current, playhead);
    }

    // --- LAYER 1: ambient (always on) ---
    const breathe = Math.sin(t * p.breatheOmega + p.breathePhase) * 0.012;
    const shift = Math.sin(t * p.shiftOmega + p.shiftPhase) * 0.035;

    // Idle head-turn: drift to a random ±15° target, hold, return to centre.
    const T = turn.current;
    if (T.next < 0) T.next = t + p.headTurnOffset;
    const mag = 0.26 * (0.6 + (1 - attention) * 0.8);
    if (T.target === 0) {
      if (t >= T.next) {
        T.target = (p.rng() < 0.5 ? -1 : 1) * mag * (0.5 + p.rng() * 0.5);
        T.until = t + 2 + p.rng() * 2;
      }
    } else if (t >= T.until) {
      T.target = 0;
      T.next = t + (18 + p.rng() * 7) * (0.6 + attention * 0.8);
    }
    smoothYaw.current += (T.target - smoothYaw.current) * 0.05;

    // Blink: brief eye squash. Random phase + interval per avatar (from seed).
    const B = blink.current;
    if (B.next < 0) B.next = t + p.blinkPhase + 3;
    if (t >= B.next) {
      B.until = t + 0.12;
      B.next = t + 4 + p.rng() * 4;
    }

    // --- LAYER 2: active reaction (enveloped) ---
    let rPosZ = 0, rBodyX = 0, rPitch = 0, rYaw = 0, rRoll = 0;
    let activeExpr: Expression | null = null;
    const inst = reaction.current;
    if (inst) {
      if (t >= inst.startAt + inst.dur) {
        reaction.current = null;
      } else {
        const e = envelope(inst, t);
        rPosZ = inst.posZ * e;
        rBodyX = inst.bodyRotX * e;
        rPitch = inst.pitch * e;
        rYaw = inst.yaw * e;
        rRoll = inst.roll * e;
        if (e > 0.4) activeExpr = inst.expr; // hold the reaction's eyes mid-beat
      }
    }

    // --- blend + apply (scale is left untouched — set once in JSX) ---
    // SEATED figures never translate forward (they'd slide off the chair) — the
    // lean-in is rotation only, pivoting at the hips/base. Standers may shift.
    const bodyZ = slot.pose === 'seated' ? 0 : rPosZ;
    body.position.set(0, seatedYOffset + breathe, bodyZ);
    body.rotation.set(leanX + rBodyX, 0, shoulderRoll + shift);
    head.rotation.set(pitchBase + rPitch, smoothYaw.current + rYaw, headRollBase + rRoll);

    // --- EXPRESSION: tween the eyes toward the active/baseline pose (~150ms) ---
    const expr: Expression = activeExpr ?? baselineExpression(attention, warmth);
    const tgt = EYE_POSES[expr];
    const EP = eyePose.current;
    const k = Math.min(1, delta / EYE_TWEEN);
    EP.sx += (tgt.sx - EP.sx) * k;
    EP.sy += (tgt.sy - EP.sy) * k;
    EP.oy += (tgt.oy - EP.oy) * k;
    EP.glance += (tgt.glance - EP.glance) * k;
    EP.asym += (tgt.asym - EP.asym) * k;
    const le = leftEyeRef.current;
    const re = rightEyeRef.current;
    if (le && re) {
      const gx = EP.glance * p.yawSign;
      le.position.set(-0.17 + gx, 0.04 + EP.oy, 0.46);
      re.position.set(0.17 + gx, 0.04 + EP.oy, 0.46);
      // Skeptical narrows the look-side eye only.
      le.scale.set(EP.sx, EP.sy * (p.yawSign < 0 ? 1 - EP.asym : 1), 0.4);
      re.scale.set(EP.sx, EP.sy * (p.yawSign > 0 ? 1 - EP.asym : 1), 0.4);
    }
    // Blink multiplies the eye height (eyesRef wraps both eyes).
    if (eyesRef.current) {
      eyesRef.current.scale.y = t < B.until ? 0.15 : 1;
    }
  });

  return (
    <group position={slot.position} rotation={[0, slot.rotationY, 0]}>
      {/* Soft radial contact shadow on the ground under the figure. */}
      {shadow && (
        <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-1}>
          <circleGeometry args={[0.62, 28]} />
          <meshBasicMaterial map={shadow} transparent depthWrite={false} />
        </mesh>
      )}

      {/* Per-room furniture: canonical desk+laptop, an armchair, or nothing.
          The armchair is rotated to face the same way as the figure — backrest
          BEHIND, open seat + armrests toward the camera. */}
      {seat === 'desk' && <DeskLaptop />}
      {seat === 'chair' && (
        <group rotation={[0, Math.PI, 0]}>
          <Chair />
        </group>
      )}

      {/* The figure. bodyRef pivots at the base for lean; everything inside is
          authored in relative units and brought to row size by FIG_SCALE. */}
      <group
        ref={bodyRef}
        position={[0, seatedYOffset, 0]}
        rotation={[leanX, 0, shoulderRoll]}
        scale={FIG_SCALE}
      >
        {/* Legs — standing avatars only (seated legs would clash with desks). */}
        {slot.pose === 'standing' && (
          <>
            <mesh position={[-0.27, -0.02, 0]}>
              <capsuleGeometry args={[0.22, 0.42, 8, 16]} />
              <meshStandardMaterial color={clothing} roughness={0.9} metalness={0} />
            </mesh>
            <mesh position={[0.27, -0.02, 0]}>
              <capsuleGeometry args={[0.22, 0.42, 8, 16]} />
              <meshStandardMaterial color={clothing} roughness={0.9} metalness={0} />
            </mesh>
          </>
        )}

        {/* Body — soft rounded clothing capsule, slightly flattened front-to-back
            so the torso tucks cleanly behind the desk. */}
        <mesh position={[0, 0.7, 0]} scale={[1, 1, 0.9]}>
          <capsuleGeometry args={[0.6, 0.62, 10, 22]} />
          <meshStandardMaterial color={clothing} roughness={0.9} metalness={0} />
        </mesh>

        {/* Arms — stubby clothing sleeves, splayed slightly; tuck in when cold. */}
        <Arm side={-1} tuck={armTuck} color={clothing} />
        <Arm side={1} tuck={armTuck} color={clothing} />

        {/* Head — SKIN sphere floating just above the body. Pivots on its OWN
            centre (headRef origin) so the hairline gap stays constant. */}
        <group ref={headRef} position={[0, HEAD_Y, 0]} rotation={[pitchBase, 0, headRollBase]}>
          <mesh scale={[1, 1.05, 1]}>
            <sphereGeometry args={[0.5, 30, 22]} />
            <meshStandardMaterial color={SKIN} roughness={0.9} metalness={0} />
          </mesh>
          {/* Eyes — spheres morphed each frame into the current EXPRESSION
              (scale/offset). In eyesRef so the blink still squashes them. The
              per-eye scale + position are driven in useFrame. No nose / mouth. */}
          <group ref={eyesRef}>
            <mesh ref={leftEyeRef} position={[-0.17, 0.04, 0.46]} scale={[0.55, 1.05, 0.4]}>
              <sphereGeometry args={[0.1, 14, 14]} />
              <meshStandardMaterial color={EYE} roughness={0.9} metalness={0} />
            </mesh>
            <mesh ref={rightEyeRef} position={[0.17, 0.04, 0.46]} scale={[0.55, 1.05, 0.4]}>
              <sphereGeometry args={[0.1, 14, 14]} />
              <meshStandardMaterial color={EYE} roughness={0.9} metalness={0} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  );
}

// Stubby clothing arm at the body's side. Splayed z±0.18 at rest; low warmth
// (high tuck) rotates it inward + pulls it toward the body — a closed posture.
function Arm({ side, tuck, color }: { side: -1 | 1; tuck: number; color: string }) {
  const x = side * (0.64 - tuck * 0.12);
  const rotZ = side * (0.18 + tuck * 0.4);
  return (
    <mesh position={[x, 0.82, 0]} rotation={[0, 0, rotZ]}>
      <capsuleGeometry args={[0.17, 0.48, 8, 16]} />
      <meshStandardMaterial color={color} roughness={0.9} metalness={0} />
    </mesh>
  );
}
