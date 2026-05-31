// Tiny synthesized "tick" for the Setup wheel — a sine at 900Hz with a ~70ms
// decay. No audio file: it's generated with the Web Audio API. The AudioContext
// is created lazily on the first call (which only ever happens from a user
// gesture). Skipped entirely when the user prefers reduced motion.

let ctx: AudioContext | null = null;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function tick(): void {
  if (prefersReducedMotion()) return;
  try {
    if (!ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') void ctx.resume();

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 900;
    // 0.0001 → 0.18 → 0.0001 over ~70ms (exponential ramps can't hit 0).
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.08);
  } catch {
    /* audio unavailable (autoplay policy, no API) — silently skip for the demo */
  }
}
