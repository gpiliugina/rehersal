import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group } from 'three';
import type { AvatarSlot } from './AudienceLayout';
import type { Marker } from '../state/types';
import {
  makePersonality,
  decide,
  buildReaction,
  envelope,
  PARTICIPATION,
  type ReactionInstance,
} from './audienceAnimation';

interface Props {
  slot: AvatarSlot;
  /**
   * Warmth 0..1 — drives POSTURE. Low warmth = closed off (torso pulled
   * back, shoulders rolled forward, arms tight to body). High warmth =
   * open and leaned in toward the speaker.
   */
  warmth: number;
  /**
   * Attention 0..1 — drives GAZE. Low attention = head looking off / down /
   * fidgeting. High attention = eyes forward on the speaker.
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

const PALETTES = [
  { shirt: '#7a8a6a', skin: '#e6c9a8' },
  { shirt: '#c79c75', skin: '#f0d8bb' },
  { shirt: '#5e6f80', skin: '#d6b696' },
  { shirt: '#8a7a90', skin: '#e9c8a5' },
  { shirt: '#a07060', skin: '#d8b797' },
  { shirt: '#6a8587', skin: '#ecceaa' },
];

export function Avatar({
  slot,
  warmth,
  attention,
  freeze,
  markers,
  playheadSec = 0,
}: Props) {
  const bodyRef = useRef<Group>(null);
  const headRef = useRef<Group>(null);
  const eyesRef = useRef<Group>(null);
  const colors = useMemo(
    () => PALETTES[Math.floor(slot.variant * PALETTES.length) % PALETTES.length],
    [slot.variant],
  );

  // Stable per-avatar personality + seed. Mix position into the seed so two
  // slots that happen to share a `variant` still get distinct phases.
  const seed = useMemo(
    () =>
      (Math.floor(
        (slot.variant * 9301 + slot.position[0] * 131 + slot.position[2] * 17) *
          1000,
      ) >>> 0) || 1,
    [slot.variant, slot.position],
  );
  const p = useMemo(() => makePersonality(seed), [seed]);

  // Posture from WARMTH: open & leaning forward (warm) vs closed off (cold).
  //   leanX:  +ve = lean forward; -ve = pull back/recline
  //   armTuck: when low warmth, arms pull tight to body (a subtle proxy
  //            for "arms crossed" without modeling actual arms).
  const leanX = (warmth - 0.5) * 0.5; // -0.25 .. +0.25 rad
  const armTuck = Math.max(0, 0.5 - warmth); // 0..0.5
  const shoulderRoll = (0.5 - warmth) * 0.25; // negative warmth → roll fwd
  // Baseline gaze/head bias from the audience-setup sliders.
  const pitchBase = (1 - attention) * -0.42; // distracted → droops down
  const headRollBase = (0.5 - warmth) * 0.18; // skeptical → slight tilt

  const seatedYOffset = slot.pose === 'seated' ? -0.25 : 0;

  // --- live animation state (refs so it survives re-renders) ---
  const playheadRef = useRef(playheadSec);
  playheadRef.current = playheadSec;
  const processedUpTo = useRef(playheadSec);
  const reaction = useRef<ReactionInstance | null>(null);
  const smoothYaw = useRef(0);
  const turn = useRef({ target: 0, until: 0, next: -1 });
  const blink = useRef({ until: 0, next: -1 });

  useFrame((state) => {
    const body = bodyRef.current;
    const head = headRef.current;
    if (!body || !head || freeze) return;
    const t = state.clock.elapsedTime;

    // --- reaction firing: detect playhead crossing a marker ---
    const playhead = playheadRef.current;
    if (playhead < processedUpTo.current - 0.4) {
      // Scrubbed backward — re-arm so forward crossings fire again.
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
    // Distracted crowds turn more often and further; engaged crowds hold gaze.
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

    // Blink: brief eye squash every ~4–8s.
    const B = blink.current;
    if (B.next < 0) B.next = t + p.blinkPhase + 3;
    if (t >= B.next) {
      B.until = t + 0.12;
      B.next = t + 4 + p.rng() * 4;
    }

    // --- LAYER 2: active reaction (enveloped, overrides relevant transforms) ---
    let rPosZ = 0, rBodyX = 0, rPitch = 0, rYaw = 0, rRoll = 0;
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
      }
    }

    // --- blend + apply ---
    body.position.set(0, seatedYOffset + breathe, rPosZ);
    body.rotation.set(leanX + rBodyX, 0, shoulderRoll + shift);
    head.rotation.set(pitchBase + rPitch, smoothYaw.current + rYaw, headRollBase + rRoll);
    if (eyesRef.current) {
      eyesRef.current.scale.y = t < B.until ? 0.15 : 1;
    }
  });

  return (
    <group
      position={slot.position}
      rotation={[0, slot.rotationY, 0]}
    >
      {/* Chair only when this slot actually has one — meetingRoom does,
          conferenceStage / townHall don't. yourSpace / smallHuddle: only
          if explicitly seated. */}
      {slot.pose === 'seated' && needsChair(slot) && (
        <group>
          <mesh position={[0, 0.22, 0]}>
            <boxGeometry args={[0.7, 0.06, 0.7]} />
            <meshStandardMaterial color="#cdbfa9" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.55, 0.35]}>
            <boxGeometry args={[0.7, 0.5, 0.06]} />
            <meshStandardMaterial color="#b8a78c" roughness={0.95} />
          </mesh>
        </group>
      )}
      {/* Desk + laptop ONLY for slots that opted in (meetingRoom). */}
      {slot.hasDesk && (
        <group>
          <mesh position={[0, 0.65, -0.55]}>
            <boxGeometry args={[1.05, 0.05, 0.55]} />
            <meshStandardMaterial color="#bfae93" roughness={0.85} />
          </mesh>
          <mesh position={[0, 0.74, -0.55]} rotation={[-0.25, 0, 0]}>
            <boxGeometry args={[0.45, 0.3, 0.02]} />
            <meshStandardMaterial color="#3a3d48" roughness={0.6} />
          </mesh>
        </group>
      )}
      <group
        ref={bodyRef}
        position={[0, seatedYOffset, 0]}
        rotation={[leanX, 0, shoulderRoll]}
      >
        {/* Torso */}
        <mesh position={[0, slot.pose === 'seated' ? 0.85 : 1.0, 0]}>
          <capsuleGeometry args={[0.28, 0.55, 6, 12]} />
          <meshStandardMaterial color={colors.shirt} roughness={0.9} />
        </mesh>
        {/* Arms — short capsules. When warmth is low we tuck them close
            to the body, suggesting "closed off". */}
        <Arm side={-1} y={slot.pose === 'seated' ? 0.85 : 1.0} tuck={armTuck} color={colors.shirt} />
        <Arm side={+1} y={slot.pose === 'seated' ? 0.85 : 1.0} tuck={armTuck} color={colors.shirt} />
        {/* Head — pivots about the sphere centre for nods / turns / tilts. */}
        <group
          ref={headRef}
          position={[0, slot.pose === 'seated' ? 1.45 : 1.6, 0]}
          rotation={[pitchBase, 0, headRollBase]}
        >
          <mesh>
            <sphereGeometry args={[0.21, 18, 14]} />
            <meshStandardMaterial color={colors.skin} roughness={0.8} />
          </mesh>
          {/* Eyes — grouped so a quick y-squash reads as a blink. */}
          <group ref={eyesRef}>
            <mesh position={[-0.075, 0.03, 0.18]}>
              <sphereGeometry args={[0.022, 8, 8]} />
              <meshStandardMaterial color="#1f2230" />
            </mesh>
            <mesh position={[0.075, 0.03, 0.18]}>
              <sphereGeometry args={[0.022, 8, 8]} />
              <meshStandardMaterial color="#1f2230" />
            </mesh>
          </group>
        </group>
        {/* Legs — standing avatars only */}
        {slot.pose === 'standing' && (
          <>
            <mesh position={[-0.11, 0.4, 0]}>
              <capsuleGeometry args={[0.1, 0.55, 4, 8]} />
              <meshStandardMaterial color="#3f4250" roughness={0.95} />
            </mesh>
            <mesh position={[0.11, 0.4, 0]}>
              <capsuleGeometry args={[0.1, 0.55, 4, 8]} />
              <meshStandardMaterial color="#3f4250" roughness={0.95} />
            </mesh>
          </>
        )}
      </group>
    </group>
  );
}

interface ArmProps {
  side: -1 | 1;
  y: number;
  tuck: number; // 0..0.5
  color: string;
}

function Arm({ side, y, tuck, color }: ArmProps) {
  // Tuck pulls the arm toward the body's centerline (lower x offset) and
  // rotates it slightly inward, suggesting a closed posture.
  const x = side * (0.32 - tuck * 0.1);
  const rotZ = side * (-0.05 + tuck * 0.35);
  return (
    <mesh position={[x, y - 0.05, 0.02]} rotation={[0, 0, rotZ]}>
      <capsuleGeometry args={[0.08, 0.42, 4, 8]} />
      <meshStandardMaterial color={color} roughness={0.9} />
    </mesh>
  );
}

// meetingRoom seats sit at desks (chair geometry would clash with the
// long table edge); other rooms get proper chairs around seated avatars.
function needsChair(slot: AvatarSlot): boolean {
  return !slot.hasDesk;
}
