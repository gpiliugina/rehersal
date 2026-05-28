interface Props {
  label: string;
  value: number;      // 0..100
  hint: string;       // hover explanation
  unit?: string;
  trend?: number;     // delta vs prior; positive is good
}

export function MetricChip({ label, value, hint, unit = '', trend }: Props) {
  return (
    <div className="metric" title={hint}>
      <div className="metric__label">{label}</div>
      <div className="metric__value">
        {Math.round(value)}
        {unit}
      </div>
      {typeof trend === 'number' && Number.isFinite(trend) && trend !== 0 && (
        <div className={`metric__trend ${trend > 0 ? 'up' : 'down'}`}>
          {trend > 0 ? '▲' : '▼'} {Math.abs(Math.round(trend))}
        </div>
      )}
      <div className="metric__hint">{hint}</div>
    </div>
  );
}
