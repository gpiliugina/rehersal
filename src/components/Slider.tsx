interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  leftHint?: string;
  rightHint?: string;
  formatValue?: (v: number) => string;
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  leftHint,
  rightHint,
  formatValue,
}: Props) {
  return (
    <label className="field">
      <span className="slider-label">
        <span>{label}</span>
        <span className="muted">
          {formatValue ? formatValue(value) : value}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {(leftHint || rightHint) && (
        <span className="slider-hints">
          <span>{leftHint}</span>
          <span>{rightHint}</span>
        </span>
      )}
    </label>
  );
}
