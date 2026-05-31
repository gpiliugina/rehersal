import { useStore } from '../state/store';

/**
 * App wordmark — a small filled dot + lowercase "rehearsal". Fixed to the
 * top-left corner of every screen at the same offset (top: 24px, left: 32px).
 * Clicking it returns Home. Color is deep-purple by default and flips to white
 * on the dark in-session screens (Rehearsing, Insights) via `.app[data-screen]`.
 */
export function Logo() {
  const goto = useStore((s) => s.goto);
  return (
    <button className="app-logo" onClick={() => goto('home')} aria-label="Rehearsal — go home">
      <span className="app-logo__dot" aria-hidden />
      <span className="app-logo__word">rehearsal</span>
    </button>
  );
}
