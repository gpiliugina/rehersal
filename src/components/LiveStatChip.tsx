import { useMemo } from 'react';

interface Props {
  label: string;
  /** Current value at the playhead. */
  value: number;
  unit?: string;
  hint: string;
  /** Series sampled at equal intervals up to the playhead. Used for trend.
   *  Even when no sparkline is drawn, the series feeds the ▲/▼/– arrow. */
  series: number[];
  /**
   * Polarity convention. For Calm/Audience/Confidence the natural direction
   * is "up = good". Pass 'inverse' for metrics where down is good (none yet).
   */
  polarity?: 'positive' | 'inverse';
  /** Show the inline sparkline under the value. Off in the rail plaques. */
  showSpark?: boolean;
}

export function LiveStatChip({
  label,
  value,
  unit = '',
  hint,
  series,
  polarity = 'positive',
  showSpark = true,
}: Props) {
  // Trend = current vs the value a couple of samples ago (≈ a few seconds
  // back in the timeline). Threshold to "steady" so tiny jitter doesn't
  // flip the arrow every frame.
  const trend = useMemo(() => {
    if (series.length < 3) return 'steady' as const;
    const earlier = series[Math.max(0, series.length - 5)];
    const current = series[series.length - 1];
    const delta = current - earlier;
    const sign = polarity === 'inverse' ? -1 : 1;
    if (delta * sign > 1.2) return 'up' as const;
    if (delta * sign < -1.2) return 'down' as const;
    return 'steady' as const;
  }, [series, polarity]);

  return (
    <div className="livechip" title={hint}>
      <div className="livechip__top">
        <span className="livechip__label">{label}</span>
        <TrendBadge dir={trend} />
      </div>
      <div className="livechip__value">
        {Math.round(value)}
        {unit}
      </div>
      {showSpark && <Spark data={series} />}
    </div>
  );
}

interface TrendBadgeProps {
  dir: 'up' | 'down' | 'steady';
}

function TrendBadge({ dir }: TrendBadgeProps) {
  if (dir === 'up') return <span className="livechip__trend is-up">▲</span>;
  if (dir === 'down') return <span className="livechip__trend is-down">▼</span>;
  return <span className="livechip__trend is-steady">–</span>;
}

interface SparkProps {
  data: number[];
}

function Spark({ data }: SparkProps) {
  if (data.length < 2) {
    return <svg className="livechip__spark" viewBox="0 0 60 14" />;
  }
  // Auto-fit y range with a little headroom so flatlines aren't pinned to
  // the bottom and tiny variations still show.
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = Math.max(1, max - min);
  const yPad = 1.5;
  const w = 60;
  const h = 14;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - yPad - ((v - min) / span) * (h - yPad * 2);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
  return (
    <svg className="livechip__spark" viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.85"
      />
    </svg>
  );
}
