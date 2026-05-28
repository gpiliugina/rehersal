interface Props {
  value: number; // 0..1
}

export function AttentionMeter({ value }: Props) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="meter" title="Audience attention">
      <div className="meter__label">Attention</div>
      <div className="meter__track">
        <div className="meter__fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
