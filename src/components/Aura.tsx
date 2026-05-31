/**
 * Warm gradient aura — a soft, blurry, low-opacity radial bloom that tints
 * the air behind hero content. Pure decoration: non-interactive, sits behind
 * the UI (see `.aura` in index.css). Compose the colorway + placement via
 * `className`, e.g. <Aura className="aura--purple-pink aura--home-hero" />.
 */
export function Aura({ className = '' }: { className?: string }) {
  return <div className={`aura ${className}`} aria-hidden />;
}
