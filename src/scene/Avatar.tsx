import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group } from 'three';
import type { AvatarSlot } from './AudienceLayout';

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
}

const PALETTES = [
  { shirt: '#7a8a6a', skin: '#e6c9a8' },
  { shirt: '#c79c75', skin: '#f0d8bb' },
  { shirt: '#5e6f80', skin: '#d6b696' },
  { shirt: '#8a7a90', skin: '#e9c8a5' },
  { shirt: '#a07060', skin: '#d8b797' },
  { shirt: '#6a8587', skin: '#ecceaa' },
];

export function Avatar({ slot, warmth, attention, freeze }: Props) {
  const ref = useRef<Group>(null);
  const colors = useMemo(
    () => PALETTES[Math.floor(slot.variant * PALETTES.length) % PALETTES.length],
    [slot.variant],
  );

  const phase = slot.variant * Math.PI * 2;

  useFrame((state) => {
    if (!ref.current || freeze) return;
    const t = state.clock.elapsedTime;
    // Subtle idle motion — breathing-like sway, less when disengaged.
    const breath = Math.sin(t * 0.9 + phase) * 0.012;
    const sway = Math.sin(t * 0.55 + phase * 1.3) * 0.02 * (0.5 + attention);
    ref.current.position.y = breath;
    ref.current.rotation.z = sway * 0.4;
    // Head pitch + yaw — attention drives where they're looking. Low
    // attention pitches down and yaws side-to-side as they "drift".
    const head = ref.current.getObjectByName('head');
    if (head) {
      const targetPitch = (1 - attention) * -0.42;
      head.rotation.x += (targetPitch - head.rotation.x) * 0.05;
      // Fidget — periodic side glance that's stronger when disengaged.
      const fidget =
        (1 - attention) * Math.sin(t * 0.7 + phase * 1.7) * 0.4 +
        (1 - attention) * Math.sin(t * 0.23 + phase) * 0.15;
      head.rotation.y += (fidget - head.rotation.y) * 0.05;
    }
  });

  // Posture from WARMTH: open & leaning forward (warm) vs closed off (cold).
  //   leanX:  +ve = lean forward; -ve = pull back/recline
  //   armTuck: when low warmth, arms pull tight to body (a subtle proxy
  //            for "arms crossed" without modeling actual arms).
  const leanX = (warmth - 0.5) * 0.5; // -0.25 .. +0.25 rad
  const armTuck = Math.max(0, 0.5 - warmth); // 0..0.5
  const shoulderRoll = (0.5 - warmth) * 0.25; // negative warmth → roll fwd

  const seatedYOffset = slot.pose === 'seated' ? -0.25 : 0;

  return (
    <group
      ref={ref}
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
        {/* Head */}
        <group
          name="head"
          position={[0, slot.pose === 'seated' ? 1.45 : 1.6, 0]}
        >
          <mesh>
            <sphereGeometry args={[0.21, 18, 14]} />
            <meshStandardMaterial color={colors.skin} roughness={0.8} />
          </mesh>
          <mesh position={[-0.075, 0.03, 0.18]}>
            <sphereGeometry args={[0.022, 8, 8]} />
            <meshStandardMaterial color="#1f2230" />
          </mesh>
          <mesh position={[0.075, 0.03, 0.18]}>
            <sphereGeometry args={[0.022, 8, 8]} />
            <meshStandardMaterial color="#1f2230" />
          </mesh>
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
