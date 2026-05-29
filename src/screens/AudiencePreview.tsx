import { useState } from 'react';
import { useStore } from '../state/store';
import { AudiencePreview as AudiencePreviewScene } from '../scene/AudiencePreview';
import { ScreenTitle } from '../components/ScreenTitle';

const MIN_AUDIENCE = 1;
const MAX_AUDIENCE = 60;

const WARMTH_WORDS = ['Skeptical', 'Reserved', 'Neutral', 'Warm', 'Friendly'];
const ATTENTION_WORDS = ['Distracted', 'Drifting', 'Listening', 'Focused', 'Engaged'];

type SegmentKey = 'size' | 'warmth' | 'attention';

export function AudiencePreview() {
  const draft = useStore((s) => s.draft);
  const setAudience = useStore((s) => s.setAudience);
  const beginRehearsal = useStore((s) => s.beginRehearsal);
  const goto = useStore((s) => s.goto);
  const editSetupReturnTo = useStore((s) => s.editSetupReturnTo);
  const primaryLabel = editSetupReturnTo ? 'Save changes' : 'Start rehearsal';

  const [active, setActive] = useState<SegmentKey>('size');

  if (!draft.roomType) {
    goto('roomSelect');
    return null;
  }

  const { audience, roomType } = draft;
  const warmthLabel = labelFor(audience.warmth, WARMTH_WORDS);
  const attentionLabel = labelFor(audience.attention, ATTENTION_WORDS);

  // Slider config for whichever segment is selected.
  const sliderConfig = (() => {
    switch (active) {
      case 'size':
        return {
          min: MIN_AUDIENCE,
          max: MAX_AUDIENCE,
          step: 1,
          value: audience.size,
          leftLabel: 'One-on-one',
          rightLabel: 'Full room',
          formatted: `${audience.size} ${audience.size === 1 ? 'person' : 'people'}`,
          onChange: (v: number) => setAudience({ size: Math.round(v) }),
        };
      case 'warmth':
        return {
          min: 0,
          max: 1,
          step: 0.01,
          value: audience.warmth,
          leftLabel: 'Skeptical',
          rightLabel: 'Friendly',
          formatted: warmthLabel,
          onChange: (v: number) => setAudience({ warmth: v }),
        };
      case 'attention':
        return {
          min: 0,
          max: 1,
          step: 0.01,
          value: audience.attention,
          leftLabel: 'Distracted',
          rightLabel: 'Engaged',
          formatted: attentionLabel,
          onChange: (v: number) => setAudience({ attention: v }),
        };
    }
  })();

  const pct =
    sliderConfig.max === sliderConfig.min
      ? 0
      : ((sliderConfig.value - sliderConfig.min) /
          (sliderConfig.max - sliderConfig.min)) *
        100;

  return (
    <div className="scene-screen">
      <div className="scene-screen__scene">
        <AudiencePreviewScene
          roomType={roomType}
          size={audience.size}
          warmth={audience.warmth}
          attention={audience.attention}
          cameraMode="firstPerson"
        />
      </div>

      <button
        className="scene-screen__back btn btn--quiet"
        onClick={() => goto('roomSelect')}
      >
        ← Back
      </button>

      <ScreenTitle>Set the audience</ScreenTitle>

      <div className="scene-pill">
        <div className="seg-tabs" role="tablist" aria-label="Audience setting">
          {(['size', 'warmth', 'attention'] as const).map((k) => (
            <button
              key={k}
              role="tab"
              aria-selected={active === k}
              className={`seg-tabs__btn ${active === k ? 'is-active' : ''}`}
              onClick={() => setActive(k)}
            >
              {k === 'size' ? 'Size' : k === 'warmth' ? 'Warmth' : 'Attention'}
            </button>
          ))}
        </div>

        <div className="seg-slider">
          <div className="seg-slider__bubble" style={{ left: `${pct}%` }}>
            {sliderConfig.formatted}
          </div>
          <input
            className="seg-slider__input"
            type="range"
            min={sliderConfig.min}
            max={sliderConfig.max}
            step={sliderConfig.step}
            value={sliderConfig.value}
            onChange={(e) => sliderConfig.onChange(Number(e.target.value))}
            aria-label={active}
          />
          <div className="seg-slider__ends muted small">
            <span>{sliderConfig.leftLabel}</span>
            <span>{sliderConfig.rightLabel}</span>
          </div>
        </div>

        <button
          className="btn btn--pill scene-pill__cta"
          onClick={beginRehearsal}
        >
          {primaryLabel}
        </button>
      </div>
    </div>
  );
}

function labelFor(value: number, words: string[]): string {
  const idx = Math.min(
    words.length - 1,
    Math.max(0, Math.floor(value * words.length)),
  );
  return words[idx];
}
