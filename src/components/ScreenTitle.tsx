import type { ReactNode } from 'react';

interface ScreenTitleProps {
  children: ReactNode;
  /** Subtle text shadow for titles that float over a 3D scene or video frame. */
  overlay?: boolean;
}

/**
 * Single source of truth for every screen title in the app. Position,
 * alignment, and typography come from `.screen-title`; nothing about the call
 * site should override them. If a screen needs a back button or other corner
 * control, render those separately — do not wrap or nest this component.
 */
export function ScreenTitle({ children, overlay = false }: ScreenTitleProps) {
  return (
    <h1 className={`screen-title${overlay ? ' screen-title--overlay' : ''}`}>
      {children}
    </h1>
  );
}
