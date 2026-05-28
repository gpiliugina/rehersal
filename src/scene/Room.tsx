import type { RoomType } from '../state/types';

interface Props {
  roomType: RoomType;
}

/**
 * Soft, semi-stylized room geometry. Five variants — each has its own light
 * + material story so they feel distinct from each other in the gallery.
 */
export function Room({ roomType }: Props) {
  switch (roomType) {
    case 'meetingRoom':
      return <MeetingRoom />;
    case 'yourSpace':
      return <YourSpace />;
    case 'conferenceStage':
      return <ConferenceStage />;
    case 'smallHuddle':
      return <SmallHuddle />;
    case 'townHall':
      return <TownHall />;
  }
}

function MeetingRoom() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 4]}>
        <planeGeometry args={[18, 22]} />
        <meshStandardMaterial color="#e6dfd2" roughness={1} />
      </mesh>
      <mesh position={[0, 2.2, -1]}>
        <planeGeometry args={[18, 5]} />
        <meshStandardMaterial color="#efe8dc" roughness={1} />
      </mesh>
      <mesh position={[-9, 2.2, 7]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[18, 5]} />
        <meshStandardMaterial color="#ece5d8" roughness={1} />
      </mesh>
      <mesh position={[9, 2.2, 7]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[18, 5]} />
        <meshStandardMaterial color="#ece5d8" roughness={1} />
      </mesh>
      <mesh position={[0, 2.5, -0.98]}>
        <planeGeometry args={[4.5, 2.4]} />
        <meshStandardMaterial
          color="#1f2230"
          emissive="#7a8a6a"
          emissiveIntensity={0.06}
        />
      </mesh>
      <mesh position={[0, 0.6, 0.9]}>
        <boxGeometry args={[12, 0.08, 1.4]} />
        <meshStandardMaterial color="#c9bda6" roughness={0.85} />
      </mesh>
    </group>
  );
}

function YourSpace() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 4]}>
        <planeGeometry args={[18, 22]} />
        <meshStandardMaterial color="#d9c4a3" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 3.2]}>
        <planeGeometry args={[7, 6]} />
        <meshStandardMaterial color="#bca48a" roughness={1} />
      </mesh>
      <mesh position={[0, 2.2, -1]}>
        <planeGeometry args={[18, 5]} />
        <meshStandardMaterial color="#f0e6d4" roughness={1} />
      </mesh>
      <mesh position={[-9, 2.2, 7]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[18, 5]} />
        <meshStandardMaterial color="#ece2cd" roughness={1} />
      </mesh>
      <mesh position={[9, 2.2, 7]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[18, 5]} />
        <meshStandardMaterial color="#ece2cd" roughness={1} />
      </mesh>
      <mesh position={[-8.95, 2.4, 4]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[5, 2.2]} />
        <meshStandardMaterial
          color="#f4ead2"
          emissive="#fff4d8"
          emissiveIntensity={0.2}
        />
      </mesh>
      <mesh position={[2.5, 0.5, -0.7]}>
        <boxGeometry args={[2.2, 0.9, 0.6]} />
        <meshStandardMaterial color="#a8866a" roughness={0.9} />
      </mesh>
    </group>
  );
}

function ConferenceStage() {
  return (
    <group>
      {/* Polished darker stage floor up front (where the speaker stands) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0.6]}>
        <planeGeometry args={[12, 4]} />
        <meshStandardMaterial color="#5a5a66" roughness={0.5} metalness={0.15} />
      </mesh>
      {/* Audience floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 8]}>
        <planeGeometry args={[28, 24]} />
        <meshStandardMaterial color="#a89c8a" roughness={1} />
      </mesh>
      {/* Wide back wall */}
      <mesh position={[0, 4, -2]}>
        <planeGeometry args={[28, 8]} />
        <meshStandardMaterial color="#26282f" roughness={1} />
      </mesh>
      {/* Big screen behind the speaker (high stakes feel) */}
      <mesh position={[0, 4, -1.95]}>
        <planeGeometry args={[14, 4.5]} />
        <meshStandardMaterial
          color="#0c1119"
          emissive="#c79c75"
          emissiveIntensity={0.18}
        />
      </mesh>
      {/* Side walls, set back to feel cavernous */}
      <mesh position={[-14, 4, 6]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[16, 8]} />
        <meshStandardMaterial color="#2a2d35" roughness={1} />
      </mesh>
      <mesh position={[14, 4, 6]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[16, 8]} />
        <meshStandardMaterial color="#2a2d35" roughness={1} />
      </mesh>
      {/* Stage-edge lip */}
      <mesh position={[0, 0.06, 2.6]}>
        <boxGeometry args={[12, 0.12, 0.12]} />
        <meshStandardMaterial color="#c79c75" emissive="#c79c75" emissiveIntensity={0.5} />
      </mesh>
    </group>
  );
}

function SmallHuddle() {
  return (
    <group>
      {/* Warm wood floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 2]}>
        <planeGeometry args={[10, 12]} />
        <meshStandardMaterial color="#cdb091" roughness={1} />
      </mesh>
      {/* Small round rug under the huddle */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 1.4]}>
        <circleGeometry args={[2.3, 32]} />
        <meshStandardMaterial color="#a98870" roughness={1} />
      </mesh>
      {/* Walls — close, intimate */}
      <mesh position={[0, 2, -1]}>
        <planeGeometry args={[10, 4.5]} />
        <meshStandardMaterial color="#efe1cc" roughness={1} />
      </mesh>
      <mesh position={[-5, 2, 3]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[10, 4.5]} />
        <meshStandardMaterial color="#eaddc6" roughness={1} />
      </mesh>
      <mesh position={[5, 2, 3]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[10, 4.5]} />
        <meshStandardMaterial color="#eaddc6" roughness={1} />
      </mesh>
      {/* A warm pendant-light suggestion as an emissive disc above */}
      <mesh position={[0, 3.7, 1.5]}>
        <sphereGeometry args={[0.18, 16, 12]} />
        <meshStandardMaterial
          color="#f3d8a6"
          emissive="#f3d8a6"
          emissiveIntensity={0.9}
        />
      </mesh>
    </group>
  );
}

function TownHall() {
  return (
    <group>
      {/* Floor at the speaker */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 1]}>
        <planeGeometry args={[16, 4]} />
        <meshStandardMaterial color="#c7baa0" roughness={1} />
      </mesh>
      {/* Tiered audience floor — render four risers as boxes giving the
          stepped look. Avatars are placed on top via AudienceLayout. */}
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} position={[0, i * 0.225, 3.25 + i * 1.5]}>
          <boxGeometry args={[16, 0.45, 1.5]} />
          <meshStandardMaterial color={i % 2 === 0 ? '#bfae90' : '#b6a587'} roughness={1} />
        </mesh>
      ))}
      {/* Back wall, taller */}
      <mesh position={[0, 4, -1]}>
        <planeGeometry args={[20, 8]} />
        <meshStandardMaterial color="#e9dcc0" roughness={1} />
      </mesh>
      {/* Side walls */}
      <mesh position={[-10, 4, 7]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[18, 8]} />
        <meshStandardMaterial color="#e3d6b8" roughness={1} />
      </mesh>
      <mesh position={[10, 4, 7]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[18, 8]} />
        <meshStandardMaterial color="#e3d6b8" roughness={1} />
      </mesh>
    </group>
  );
}
