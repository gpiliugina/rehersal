import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { AudiencePreview } from '../scene/AudiencePreview';
import { sampleCrowdSize } from '../scene/AudienceLayout';
import { ScreenTitle } from '../components/ScreenTitle';
import type { RoomType } from '../state/types';

interface RoomDef {
  type: RoomType;
  title: string;
  blurb: string;
}

const ROOMS: RoomDef[] = [
  {
    type: 'meetingRoom',
    title: 'Meeting room',
    blurb: 'Boardroom rows. Formal. Best for pitches and reviews.',
  },
  {
    type: 'yourSpace',
    title: 'Your space',
    blurb: 'Audience appears in your own room. Warm, casual, low-pressure.',
  },
  {
    type: 'conferenceStage',
    title: 'Conference stage',
    blurb: 'Large, bright, high-stakes. Practise for the moment that matters.',
  },
  {
    type: 'smallHuddle',
    title: 'Small huddle',
    blurb: 'Three or four people, close. Hard conversations, 1:1s, tough asks.',
  },
  {
    type: 'townHall',
    title: 'Town hall',
    blurb: 'Tiered seating, medium-large. All-hands and updates.',
  },
];

export function RoomSelect() {
  const pickRoom = useStore((s) => s.pickRoom);
  const goto = useStore((s) => s.goto);
  const draftRoom = useStore((s) => s.draft.roomType);
  const editSetupReturnTo = useStore((s) => s.editSetupReturnTo);
  const cancelEditSetup = useStore((s) => s.cancelEditSetup);

  const [idx, setIdx] = useState(() => {
    if (!draftRoom) return 0;
    const i = ROOMS.findIndex((r) => r.type === draftRoom);
    return i >= 0 ? i : 0;
  });
  const touchStartX = useRef<number | null>(null);

  // Looped: past the last wraps to the first and vice versa.
  const step = (delta: number) =>
    setIdx((i) => (i + delta + ROOMS.length) % ROOMS.length);

  // Drag (pointer) + wheel (trackpad horizontal swipe) state. We accumulate
  // tiny wheel deltas until they cross a threshold so the carousel doesn't
  // flicker through rooms during a single trackpad sweep.
  const wheelAccumRef = useRef(0);
  const lastWheelStepAtRef = useRef(0);
  const dragRef = useRef<{ x: number; moved: boolean } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'ArrowRight') step(+1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Trackpad two-finger horizontal swipe → step rooms.
  useEffect(() => {
    function onWheel(e: WheelEvent) {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return; // vertical scroll
      e.preventDefault();
      wheelAccumRef.current += e.deltaX;
      const now = performance.now();
      if (
        Math.abs(wheelAccumRef.current) > 80 &&
        now - lastWheelStepAtRef.current > 280
      ) {
        step(wheelAccumRef.current > 0 ? +1 : -1);
        wheelAccumRef.current = 0;
        lastWheelStepAtRef.current = now;
      }
    }
    // Listen at the document level so the swipe works anywhere on the screen.
    document.addEventListener('wheel', onWheel, { passive: false });
    return () => document.removeEventListener('wheel', onWheel);
  }, []);

  const room = ROOMS[idx];

  function choose() {
    pickRoom(room.type);
    goto('audiencePreview');
  }
  function onBack() {
    if (editSetupReturnTo) cancelEditSetup();
    else goto('home');
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 50) step(dx < 0 ? +1 : -1);
    touchStartX.current = null;
  };

  // Mouse drag (pointer events) — same threshold as touch.
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragRef.current = { x: e.clientX, moved: false };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 50) step(dx < 0 ? +1 : -1);
  };

  return (
    <div
      className="scene-screen"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
    >
      <div className="scene-screen__scene">
        <AudiencePreview
          roomType={room.type}
          size={sampleCrowdSize(room.type)}
          warmth={0.65}
          attention={0.78}
        />
      </div>

      <button
        className="scene-screen__back btn btn--quiet"
        onClick={onBack}
      >
        ← Back
      </button>

      <ScreenTitle>Pick a room</ScreenTitle>

      <button
        className="scene-screen__edge-nav left"
        onClick={() => step(-1)}
        aria-label="Previous room"
      >
        ‹
      </button>
      <button
        className="scene-screen__edge-nav right"
        onClick={() => step(+1)}
        aria-label="Next room"
      >
        ›
      </button>

      <div className="scene-pill">
        <div className="scene-pill__head">
          <div className="scene-pill__title">{room.title}</div>
          <p className="scene-pill__blurb">{room.blurb}</p>
        </div>
        <div className="scene-pill__dots">
          {ROOMS.map((_, i) => (
            <button
              key={i}
              className={`dot ${i === idx ? 'active' : ''}`}
              onClick={() => setIdx(i)}
              aria-label={`Go to room ${i + 1}`}
            />
          ))}
        </div>
        <button className="btn btn--pill scene-pill__cta" onClick={choose}>
          Choose this room
        </button>
      </div>
    </div>
  );
}
