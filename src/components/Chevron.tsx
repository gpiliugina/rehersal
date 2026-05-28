// Minimal stroke chevrons in the Tabler Icons visual style — inline SVG so
// we don't pull a whole icon package for two glyphs.

interface Props {
  open: boolean;
  size?: number;
}

export function Chevron({ open, size = 18 }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`chev ${open ? 'chev--open' : ''}`}
    >
      {open ? <path d="M6 9l6 6l6-6" /> : <path d="M9 6l6 6l-6 6" />}
    </svg>
  );
}
