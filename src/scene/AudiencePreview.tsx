import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { Avatar } from './Avatar';
import { Room } from './Room';
import { layoutAudience } from './AudienceLayout';
import { avatarAttention, avatarWarmth } from './ReplayController';
import type { RoomType } from '../state/types';

interface Props {
  roomType: RoomType;
  size: number;
  // Global audience signals. In live preview these are slider values; during
  // rehearsal/replay attention comes from the timeline at the current playhead.
  warmth: number;
  attention: number;
  // First-person camera vs over-the-shoulder for preview.
  cameraMode?: 'firstPerson' | 'preview';
  // Disable subtle idle animation (used for thumbnails).
  freeze?: boolean;
}

export function AudiencePreview({
  roomType,
  size,
  warmth,
  attention,
  cameraMode = 'preview',
  freeze,
}: Props) {
  const slots = useMemo(() => layoutAudience(roomType, size), [
    roomType,
    size,
  ]);

  // Per-room camera tweaks so each room reads well from the speaker's POV.
  const cam = cameraFor(roomType, cameraMode);

  return (
    <Canvas
      shadows={false}
      camera={{ position: cam.position, fov: cam.fov }}
      gl={{ antialias: true, alpha: false }}
      onCreated={({ camera }) => camera.lookAt(...cam.lookAt)}
    >
      <color attach="background" args={[bgColor(roomType)]} />
      <ambientLight intensity={0.75} />
      <directionalLight position={[4, 6, 6]} intensity={0.6} />
      <directionalLight position={[-6, 4, 2]} intensity={0.25} />
      <Room roomType={roomType} />
      {slots.map((slot, i) => (
        <Avatar
          key={i}
          slot={slot}
          warmth={avatarWarmth(slot.variant, warmth)}
          attention={avatarAttention(slot.variant, attention)}
          freeze={freeze}
        />
      ))}
    </Canvas>
  );
}

interface CameraSpec {
  position: [number, number, number];
  lookAt: [number, number, number];
  fov: number;
}

function cameraFor(roomType: RoomType, mode: 'firstPerson' | 'preview'): CameraSpec {
  if (mode === 'firstPerson') {
    switch (roomType) {
      case 'conferenceStage':
        return {
          position: [0, 1.75, -0.4],
          lookAt: [0, 1.3, 6],
          fov: 65,
        };
      case 'smallHuddle':
        return {
          position: [0, 1.6, -0.2],
          lookAt: [0, 1.2, 3],
          fov: 62,
        };
      case 'townHall':
        return {
          position: [0, 1.7, -0.4],
          lookAt: [0, 1.8, 6],
          fov: 62,
        };
      default:
        return { position: [0, 1.65, -0.4], lookAt: [0, 1.3, 4.5], fov: 62 };
    }
  }
  // preview camera — slightly elevated behind the speaker
  switch (roomType) {
    case 'conferenceStage':
      return { position: [0, 3, -3.4], lookAt: [0, 1.4, 6], fov: 52 };
    case 'smallHuddle':
      return { position: [0, 2.2, -2.2], lookAt: [0, 1.2, 2.5], fov: 48 };
    case 'townHall':
      return { position: [0, 2.6, -3], lookAt: [0, 1.8, 5.5], fov: 52 };
    default:
      return { position: [0, 2.4, -2.6], lookAt: [0, 1.3, 4.5], fov: 50 };
  }
}

function bgColor(roomType: RoomType): string {
  switch (roomType) {
    case 'conferenceStage':
      return '#16181d';
    case 'smallHuddle':
      return '#f0e3cc';
    case 'townHall':
      return '#eee0c4';
    case 'yourSpace':
      return '#f1e7d3';
    case 'meetingRoom':
    default:
      return '#f1ece2';
  }
}
