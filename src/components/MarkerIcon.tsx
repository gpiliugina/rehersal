import type { MarkerKind } from '../state/types';

interface Props {
  kind: MarkerKind;
  size?: number;
}

/**
 * Inline Tabler-style stroke icons for marker kinds. Stroke colour comes from
 * the parent via `currentColor` so polarity (positive/attention) can be set
 * once on the wrapping container.
 */
export function MarkerIcon({ kind, size = 18 }: Props) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  switch (kind) {
    case 'pulseSpike':
      // ti-heartbeat-like: heart with a flat-line + spike
      return (
        <svg {...common}>
          <path d="M3 12h4l2 -4l4 8l2 -4h6" />
        </svg>
      );
    case 'voiceWavered':
      // ti-wave-sine-like
      return (
        <svg {...common}>
          <path d="M3 12c1.5 -3 3 -3 4.5 0s3 3 4.5 0s3 -3 4.5 0s3 3 4.5 0" />
        </svg>
      );
    case 'longPause':
      // ti-player-pause-like
      return (
        <svg {...common}>
          <rect x="6" y="5" width="4" height="14" rx="1" />
          <rect x="14" y="5" width="4" height="14" rx="1" />
        </svg>
      );
    case 'fillerWords':
      // ti-quote-like: speech-bubble with three dots
      return (
        <svg {...common}>
          <path d="M4 20l1.3 -3.9a9 8 0 1 1 3.4 2.9l-4.7 1z" />
          <circle cx="9" cy="12" r="0.5" fill="currentColor" />
          <circle cx="13" cy="12" r="0.5" fill="currentColor" />
          <circle cx="17" cy="12" r="0.5" fill="currentColor" />
        </svg>
      );
    case 'lostAttention':
      // ti-users-like — a two-person glyph for "audience" / attention loss
      return (
        <svg {...common}>
          <circle cx="9" cy="7" r="3" />
          <path d="M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" />
          <path d="M16 3.5a4 4 0 0 1 0 7.5" />
          <path d="M21 21v-2a4 4 0 0 0 -3 -3.85" />
        </svg>
      );
    case 'strongMoment':
      // ti-sparkles-like
      return (
        <svg {...common}>
          <path d="M12 3l1.6 4.5L18 9l-4.4 1.5L12 15l-1.6 -4.5L6 9l4.4 -1.5z" />
          <path d="M19 14l.7 2L21 17l-1.3 1L19 20l-.7 -2L17 17l1.3 -1z" />
        </svg>
      );
  }
}
