import { useEffect, useRef } from 'react';

interface Props {
  // Current playback time in seconds — drives the subtle animation so the
  // "video" feels live even though it's a stylized placeholder.
  t: number;
  // 0..1 — used to colour the floor tint slightly with mood.
  warmth: number;
}

/**
 * A stylised "your recorded speech" placeholder. Stands in for camera footage
 * the real glasses/laptop would capture. Renders an abstract speaker silhouette
 * on a soft gradient with a faint waveform pulse so it reads as "video", not a
 * dead background.
 */
export function MockVideoFrame({ t, warmth }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Waveform bars at the bottom — pulse based on time
    const bars = 60;
    const baseY = h - 30;
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    for (let i = 0; i < bars; i++) {
      const phase = (i / bars) * Math.PI * 2 + t * 1.2;
      const amp = 6 + Math.abs(Math.sin(phase) * Math.cos(t * 0.5 + i * 0.13)) * 18;
      const x = 16 + (i / bars) * (w - 32);
      ctx.fillRect(x, baseY - amp / 2, 2, amp);
    }
  }, [t]);

  // Soft warm/cool background gradient based on warmth value.
  const tintA = warmth > 0.5 ? '#3a3850' : '#2a3245';
  const tintB = warmth > 0.5 ? '#5a4b50' : '#3d4555';

  return (
    <div
      className="mock-video"
      style={{
        background: `linear-gradient(140deg, ${tintA} 0%, ${tintB} 100%)`,
      }}
    >
      {/* Speaker silhouette — a simple SVG figure centered, suggesting "you". */}
      <svg
        className="mock-video__silhouette"
        viewBox="0 0 200 240"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <defs>
          <radialGradient id="halo" cx="50%" cy="35%" r="60%">
            <stop offset="0%" stopColor="rgba(255,238,212,0.35)" />
            <stop offset="100%" stopColor="rgba(255,238,212,0)" />
          </radialGradient>
        </defs>
        <ellipse cx="100" cy="80" rx="120" ry="100" fill="url(#halo)" />
        <circle cx="100" cy="78" r="28" fill="rgba(20,20,30,0.55)" />
        <path
          d="M40 240 C 40 170, 60 140, 100 140 C 140 140, 160 170, 160 240 Z"
          fill="rgba(20,20,30,0.55)"
        />
      </svg>

      <canvas
        ref={canvasRef}
        className="mock-video__wave"
        width={720}
        height={180}
      />

      <div className="mock-video__tag">mock · concept</div>
    </div>
  );
}
