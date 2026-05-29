import type { ReactNode } from 'react';

interface ScreenTitleProps {
  children: ReactNode;
  /**
   * Render as the plain page hero (no glass pill). Used only by Home, whose
   * title doubles as the landing headline. Every other screen gets the pill.
   */
  hero?: boolean;
}

/**
 * Single source of truth for every screen title in the app. By default it
 * renders as a floating frosted-glass pill, positioned identically on every
 * screen (top, centered) — the visionOS-style language shared with the app's
 * other floating surfaces. Nothing at the call site should override its
 * position, typography, or glass treatment.
 */
export function ScreenTitle({ children, hero = false }: ScreenTitleProps) {
  return (
    <h1 className={`screen-title${hero ? ' screen-title--hero' : ''}`}>
      {children}
    </h1>
  );
}
