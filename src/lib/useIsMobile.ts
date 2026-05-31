// =============================================================================
// useIsMobile — the ONE responsive breakpoint for the app (phone-portrait).
//
// MOBILE_BREAKPOINT is the single source of truth: components read it through
// this hook; CSS uses the matching `@media (max-width: 640px)` query. Change it
// in one place and keep the CSS query in sync.
// =============================================================================

import { useEffect, useState } from 'react';

export const MOBILE_BREAKPOINT = 640; // px — phone portrait; mirror in @media
const QUERY = `(max-width: ${MOBILE_BREAKPOINT}px)`;

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(QUERY).matches,
  );

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    // Sync once in case it changed between the initial state and the effect.
    setIsMobile(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isMobile;
}
