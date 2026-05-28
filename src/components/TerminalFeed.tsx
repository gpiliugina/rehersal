import { useEffect, useMemo, useRef } from 'react';
import { MarkerIcon } from './MarkerIcon';
import { mmss } from '../lib/format';
import type { InsightCard } from '../lib/takeaways';

interface Props {
  cards: InsightCard[];          // sorted ascending by t (session time)
  sessionPlayhead: number;       // current session-time
  // (timeline kept in signature for API stability with prior callers, no longer
  //  used now that rows don't surface raw numeric values.)
  timeline?: unknown;
  onSeek: (card: InsightCard) => void;
}

/**
 * Calm, premium list of insights for the session. One row per moment:
 *   [time]  ·  plain-language note   [▲ if strong]              [icon-right]
 *
 * The row whose t is the highest still ≤ playhead is the active one — soft
 * accent background + coloured left border. As playback advances it
 * auto-scrolls into view. Clicking any row seeks the video.
 */
export function TerminalFeed({ cards, sessionPlayhead, onSeek }: Props) {
  const activeIdx = useMemo(() => {
    let idx = -1;
    for (let i = 0; i < cards.length; i++) {
      if (cards[i].t <= sessionPlayhead) idx = i;
      else break;
    }
    return idx;
  }, [cards, sessionPlayhead]);

  const activeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (activeIdx < 0) return;
    const el = activeRef.current;
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeIdx]);

  if (cards.length === 0) {
    return (
      <div className="feed feed--rail feed--empty">
        <span className="feed__empty">No insights yet.</span>
      </div>
    );
  }

  return (
    <div className="feed feed--rail">
      {cards.map((c, i) => {
        const polarity = c.kind === 'strongMoment' ? 'positive' : 'attention';
        const isActive = i === activeIdx;
        const isPast = i < activeIdx;
        return (
          <button
            key={`${c.kind}-${c.t}-${i}`}
            ref={isActive ? activeRef : undefined}
            className={`insight-row insight-row--${polarity} ${
              isActive ? 'is-active' : ''
            } ${isPast ? 'is-past' : ''}`}
            onClick={() => onSeek(c)}
          >
            <span className="insight-row__time">{mmss(c.t)}</span>
            <span className="insight-row__sep">·</span>
            <span className="insight-row__note">{c.headline}</span>
            {polarity === 'positive' && (
              <span className="insight-row__arrow" aria-hidden>▲</span>
            )}
            <span className="insight-row__icon" aria-hidden>
              <MarkerIcon kind={c.kind} size={16} />
            </span>
          </button>
        );
      })}
    </div>
  );
}
