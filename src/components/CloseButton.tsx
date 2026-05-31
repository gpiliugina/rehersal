/**
 * Top-right close (×) control. Mirrors the top-left <ScreenTitle> position.
 * Used on Pick a room, Set the audience, Progress, and Insights to return
 * Home. Not used on Home (the destination) or Rehearsing (own controls).
 */
export function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="screen-close" onClick={onClick} aria-label="Close">
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M18 6 L6 18" />
        <path d="M6 6 L18 18" />
      </svg>
    </button>
  );
}
