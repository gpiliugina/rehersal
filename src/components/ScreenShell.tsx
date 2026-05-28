import { ReactNode } from 'react';
import { useStore } from '../state/store';
import type { Screen } from '../state/types';

interface Props {
  children: ReactNode;
  back?: Screen | null;
  title?: string;
  right?: ReactNode;
  full?: boolean;
}

export function ScreenShell({ children, back, title, right, full }: Props) {
  const goto = useStore((s) => s.goto);
  return (
    <div className={full ? 'screen screen--full' : 'screen'}>
      {(back || title || right) && (
        <div className="shell-top">
          <div className="shell-top__left">
            {back && (
              <button className="btn btn--quiet" onClick={() => goto(back)}>
                ← Back
              </button>
            )}
            {title && <span className="shell-title">{title}</span>}
          </div>
          <div>{right}</div>
        </div>
      )}
      {children}
    </div>
  );
}
