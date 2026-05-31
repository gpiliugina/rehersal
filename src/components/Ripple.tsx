import { useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface Burst {
  id: number;
  x: number;
  y: number;
}

// Circle-button GLOW SWIRL. On click, two soft aura blobs (peach leads, pink
// follows 80ms behind) bloom from the button's centre and arc outward in
// opposite directions, fading as they grow. Portaled to <body> as fixed,
// viewport-clipped layers, so surrounding panels never clip them. The button
// itself never moves or scales.
export function useGlowWash() {
  const [bursts, setBursts] = useState<Burst[]>([]);
  const idRef = useRef(0);

  // `e` is any event whose currentTarget is the clicked button.
  const spawn = (e: { currentTarget: Element }) => {
    const r = e.currentTarget.getBoundingClientRect();
    const id = idRef.current++;
    setBursts((b) => [...b, { id, x: r.left + r.width / 2, y: r.top + r.height / 2 }]);
    window.setTimeout(() => setBursts((b) => b.filter((z) => z.id !== id)), 2700);
  };

  const layer: ReactNode = createPortal(
    <div className="glow-wash-root" aria-hidden>
      {bursts.map(({ id, x, y }) => (
        <div key={id} className="glow-burst" style={{ left: `${x}px`, top: `${y}px` }}>
          <div className="glow-blob glow-blob--peach" />
          <div className="glow-blob glow-blob--pink" />
        </div>
      ))}
    </div>,
    document.body,
  );

  return { layer, spawn };
}

// Back-compat alias — the circle buttons import `useRipple`.
export const useRipple = useGlowWash;
