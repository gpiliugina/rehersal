import { useMemo, type MutableRefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ACESFilmicToneMapping, SRGBColorSpace, Vector3 } from 'three';
import { Avatar } from './Avatar';
import { Room } from './Room';
import { HuddleTable } from './Furniture';
import { layoutAudience, type AvatarSlot } from './AudienceLayout';
import { avatarAttention, avatarWarmth } from './ReplayController';
import { ROOM_CONFIG } from '../lib/rooms';
import type { Marker, RoomType } from '../state/types';

// A visible avatar's head, projected to normalized screen coords (0..1).
export interface ScreenHead {
  x: number;
  y: number;
  visible: boolean;
}

// Head world height = slot.y + seatedOffset + HEAD_Y * FIG_SCALE (see Avatar).
const HEAD_WORLD_Y = 2.15 * 0.6; // 1.29
const SEATED_DROP = 0.12;

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
  // The session-event timeline + current playhead. When present, avatars react
  // to markers as the playhead crosses them (live rehearsal + Insights replay).
  markers?: Marker[];
  playheadSec?: number;
  // When provided, each frame writes every avatar head's on-screen position so
  // a DOM overlay can spawn emoji exactly at a (visible) avatar's head.
  projection?: MutableRefObject<ScreenHead[] | null>;
}

// Projects every avatar head to normalized screen coords each frame. Renders
// nothing — just writes to the shared ref. Lives inside the Canvas (needs the
// camera). Cheap: one project() per avatar.
function HeadProjector({
  slots,
  target,
}: {
  slots: AvatarSlot[];
  target: MutableRefObject<ScreenHead[] | null>;
}) {
  const { camera } = useThree();
  const heads = useMemo(
    () =>
      slots.map(
        (s) =>
          new Vector3(
            s.position[0],
            s.position[1] + (s.pose === 'seated' ? SEATED_DROP : 0) + HEAD_WORLD_Y,
            s.position[2],
          ),
      ),
    [slots],
  );
  const tmp = useMemo(() => new Vector3(), []);
  useFrame(() => {
    target.current = heads.map((h) => {
      tmp.copy(h).project(camera);
      const visible =
        tmp.z < 1 && tmp.x >= -1 && tmp.x <= 1 && tmp.y >= -1 && tmp.y <= 1;
      return { x: tmp.x * 0.5 + 0.5, y: -tmp.y * 0.5 + 0.5, visible };
    });
  });
  return null;
}

export function AudiencePreview({
  roomType,
  size,
  warmth,
  attention,
  cameraMode = 'preview',
  freeze,
  markers,
  playheadSec,
  projection,
}: Props) {
  const slots = useMemo(() => layoutAudience(roomType, size), [
    roomType,
    size,
  ]);

  // Per-room camera tweaks so each room reads well from the speaker's POV.
  const cam = cameraFor(roomType, cameraMode);

  const clothing = clothingColor(roomType);
  const config = ROOM_CONFIG[roomType];

  return (
    <Canvas
      shadows={false}
      dpr={[1, 2]}
      camera={{ position: cam.position, fov: cam.fov }}
      gl={{ antialias: true, alpha: false }}
      onCreated={({ camera, gl }) => {
        camera.lookAt(...cam.lookAt);
        // Soft filmic look — no blown highlights, correct sRGB output.
        gl.toneMapping = ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.1;
        gl.outputColorSpace = SRGBColorSpace;
      }}
    >
      <color attach="background" args={[bgColor(roomType)]} />
      {/* Even, soft daylight: sky/ground hemisphere + one gentle key from the
          upper-left + a little ambient fill. No single harsh light. */}
      <hemisphereLight args={['#FFF4E2', '#B89A78', 0.95]} />
      <directionalLight position={[-4, 6, 4]} intensity={0.55} />
      <ambientLight intensity={0.15} />
      <Room roomType={roomType} />
      {config.huddleTable && <HuddleTable at={config.huddleTable} />}
      {projection && <HeadProjector slots={slots} target={projection} />}
      {slots.map((slot, i) => (
        <Avatar
          key={i}
          slot={slot}
          clothing={clothing}
          seat={config.seat}
          warmth={avatarWarmth(slot.variant, warmth)}
          attention={avatarAttention(slot.variant, attention)}
          freeze={freeze}
          markers={markers}
          playheadSec={playheadSec}
        />
      ))}
    </Canvas>
  );
}

// Clothing colour = the room's accent (one tone for the whole audience).
function clothingColor(roomType: RoomType): string {
  switch (roomType) {
    case 'meetingRoom':
      return '#8B6FBF'; // purple
    case 'yourSpace':
      return '#7C8B5C'; // sage
    case 'conferenceStage':
      return '#F4A47A'; // peach
    case 'smallHuddle':
      return '#E89AAB'; // pink
    case 'townHall':
      return '#8B6FBF'; // purple
    default:
      return '#8B6FBF';
  }
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
