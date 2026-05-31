// =============================================================================
// Furniture.tsx — shared seat/table props, authored once and reused per room.
//
// The canonical DESK + LAPTOP is the dark-ink laptop look: the laptop SCREEN
// material is --color-ink-deep (#1F1A2E). The desk sits in FRONT of the torso
// (camera side, −z) with clearance so the rounded body never pokes through its
// back face (see Avatar's body z-trim).
// =============================================================================

const DESK = '#bfae93';
const DESK_PANEL = '#b3a187';
const SCREEN = '#1F1A2E'; // --color-ink-deep (fallback --color-ink-press #2a1f35)
const LAPTOP_BASE = '#2a2533';
const CHAIR_SEAT = '#cdbfa9';
const CHAIR_BACK = '#b8a78c';

// Canonical desk + dark-ink laptop, in front of the seated figure.
export function DeskLaptop() {
  return (
    <group>
      {/* table top */}
      <mesh position={[0, 0.66, -0.78]}>
        <boxGeometry args={[1.2, 0.05, 0.6]} />
        <meshStandardMaterial color={DESK} roughness={0.85} metalness={0} />
      </mesh>
      {/* front modesty panel (toward the camera) */}
      <mesh position={[0, 0.4, -1.05]}>
        <boxGeometry args={[1.2, 0.58, 0.04]} />
        <meshStandardMaterial color={DESK_PANEL} roughness={0.9} metalness={0} />
      </mesh>
      {/* laptop base */}
      <mesh position={[0, 0.67, -0.7]}>
        <boxGeometry args={[0.5, 0.02, 0.3]} />
        <meshStandardMaterial color={LAPTOP_BASE} roughness={0.7} metalness={0} />
      </mesh>
      {/* laptop SCREEN — dark ink */}
      <mesh position={[0, 0.78, -0.74]} rotation={[-0.25, 0, 0]}>
        <boxGeometry args={[0.5, 0.32, 0.02]} />
        <meshStandardMaterial color={SCREEN} roughness={0.6} metalness={0} />
      </mesh>
    </group>
  );
}

// Armchair: a seat cushion UNDER the figure, a back BEHIND it (+z, away from the
// camera), and two armrests at the sides. The figure sits in the cup of the seat.
export function Chair() {
  return (
    <group>
      {/* seat cushion */}
      <mesh position={[0, 0.18, 0]}>
        <boxGeometry args={[0.88, 0.16, 0.76]} />
        <meshStandardMaterial color={CHAIR_SEAT} roughness={0.9} metalness={0} />
      </mesh>
      {/* back — behind the figure (away from the camera) */}
      <mesh position={[0, 0.56, 0.36]}>
        <boxGeometry args={[0.88, 0.62, 0.12]} />
        <meshStandardMaterial color={CHAIR_BACK} roughness={0.95} metalness={0} />
      </mesh>
      {/* armrests */}
      {[-0.46, 0.46].map((x) => (
        <mesh key={x} position={[x, 0.36, 0.04]}>
          <boxGeometry args={[0.12, 0.14, 0.64]} />
          <meshStandardMaterial color={CHAIR_BACK} roughness={0.95} metalness={0} />
        </mesh>
      ))}
      {/* short legs */}
      {[-0.36, 0.36].map((x) =>
        [-0.3, 0.3].map((z) => (
          <mesh key={`${x},${z}`} position={[x, 0.05, z]}>
            <boxGeometry args={[0.08, 0.2, 0.08]} />
            <meshStandardMaterial color={CHAIR_BACK} roughness={0.95} metalness={0} />
          </mesh>
        )),
      )}
    </group>
  );
}

// Central round table for the small huddle (rendered ONCE at the cluster centre,
// not per-avatar). `at` is its world position.
export function HuddleTable({ at }: { at: [number, number, number] }) {
  return (
    <group position={at}>
      <mesh position={[0, 0.52, 0]}>
        <cylinderGeometry args={[0.95, 0.95, 0.08, 28]} />
        <meshStandardMaterial color={DESK} roughness={0.85} metalness={0} />
      </mesh>
      <mesh position={[0, 0.26, 0]}>
        <cylinderGeometry args={[0.16, 0.22, 0.5, 14]} />
        <meshStandardMaterial color="#a8987c" roughness={0.9} metalness={0} />
      </mesh>
    </group>
  );
}
