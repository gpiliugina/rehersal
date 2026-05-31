import { useLayoutEffect, useMemo, useRef } from 'react';
import { useStore, selectActiveEvent } from '../state/store';
import { AudiencePreview as AudiencePreviewScene } from '../scene/AudiencePreview';
import { CloseButton } from '../components/CloseButton';
import { ScreenTitle } from '../components/ScreenTitle';
import { ROOM_LABELS, ROOM_ORDER } from '../lib/rooms';
import type { RoomType } from '../state/types';

// ===========================================================================
// Setup — a full-bleed live audience preview with a single frosted control
// panel on the right. All four questions (room / size / warmth / attention)
// sit stacked; every change commits immediately and updates the 3D scene live.
// Smart defaults derived from the talk name are pre-selected on landing, so the
// user can hit Start straight away. Replaces Pick-a-room + Set-the-audience.
// ===========================================================================

interface RoomDef {
  type: RoomType;
  title: string;
}
// Built from the single room-label source so the chips never drift.
const ROOMS: RoomDef[] = ROOM_ORDER.map((type) => ({ type, title: ROOM_LABELS[type] }));

// A small huddle tops out at 15 people; every other room caps at 100.
const HUDDLE_MAX = 15;

const WARMTH = [
  { label: 'Skeptical', value: 0.15 },
  { label: 'Neutral', value: 0.5 },
  { label: 'Warm', value: 0.85 },
];
const ATTENTION = [
  { label: 'Distracted', value: 0.15 },
  { label: 'Focused', value: 0.55 },
  { label: 'Engaged', value: 0.9 },
];

// Pick the pill whose representative value is nearest the stored 0–1 reading.
function nearestLabel(value: number, opts: { label: string; value: number }[]): string {
  return opts.reduce((best, o) =>
    Math.abs(o.value - value) < Math.abs(best.value - value) ? o : best,
  ).label;
}

interface Defaults {
  roomType: RoomType;
  size: number;
  warmth: number;
  attention: number;
}
// Sensible starting point inferred from the talk's name.
function smartDefaults(name: string): Defaults {
  const n = name.toLowerCase();
  const has = (...kw: string[]) => kw.some((k) => n.includes(k));
  if (has('wedding', 'toast', 'best man', 'maid of honor', 'bride', 'groom', 'anniversary'))
    return { roomType: 'smallHuddle', size: 30, warmth: 0.85, attention: 0.55 };
  if (has('conference', 'keynote', 'ted', 'lecture'))
    return { roomType: 'conferenceStage', size: 60, warmth: 0.5, attention: 0.9 };
  if (has('team', 'standup', 'sprint', 'all-hands', 'allhands', 'retro', 'sync', 'update'))
    return { roomType: 'townHall', size: 25, warmth: 0.85, attention: 0.55 };
  if (has('interview'))
    return { roomType: 'smallHuddle', size: 3, warmth: 0.5, attention: 0.55 };
  // pitches, board reviews, sales, demos, and anything unmatched.
  return { roomType: 'meetingRoom', size: 12, warmth: 0.5, attention: 0.55 };
}

export function Setup() {
  const event = useStore(selectActiveEvent);
  const draft = useStore((s) => s.draft);
  const pickRoom = useStore((s) => s.pickRoom);
  const setAudience = useStore((s) => s.setAudience);
  const beginRehearsal = useStore((s) => s.beginRehearsal);
  const goHome = useStore((s) => s.goHomeExpandingActiveEvent);
  const editSetupReturnTo = useStore((s) => s.editSetupReturnTo);
  const primaryLabel = editSetupReturnTo ? 'Save changes →' : 'Start rehearsal →';
  const startingRef = useRef(false);

  const onStart = () => {
    if (startingRef.current) return;
    startingRef.current = true;
    beginRehearsal();
  };

  const defaults = useMemo(() => smartDefaults(event?.name ?? ''), [event?.name]);

  // On first land for a brand-new talk (no room chosen yet), pre-fill all four
  // settings from the talk name. Edit-setup arrives with a saved setup, so we
  // leave those values alone. useLayoutEffect commits before paint (no flash).
  const appliedRef = useRef(false);
  useLayoutEffect(() => {
    if (appliedRef.current) return;
    appliedRef.current = true;
    if (!draft.roomType) {
      pickRoom(defaults.roomType);
      setAudience({ size: defaults.size, warmth: defaults.warmth, attention: defaults.attention });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { audience } = draft;
  const roomType = draft.roomType ?? defaults.roomType;
  // Per-room people cap — a small huddle tops out at 15; every other room at 100.
  const maxPeople = roomType === 'smallHuddle' ? HUDDLE_MAX : 100;
  const sizeShown = Math.min(audience.size, maxPeople);
  const warmthLabel = nearestLabel(audience.warmth, WARMTH);
  const attentionLabel = nearestLabel(audience.attention, ATTENTION);

  return (
    <div className="setup-screen settle-in">
      {/* Full-bleed live audience preview. */}
      <div className="setup__scene">
        <AudiencePreviewScene
          roomType={roomType}
          size={audience.size}
          warmth={audience.warmth}
          attention={audience.attention}
          cameraMode="firstPerson"
        />
      </div>

      <CloseButton onClick={goHome} />
      {/* Same floating glass-pill title as every other screen (Progress etalon). */}
      <ScreenTitle>
        Setup{event ? <> · {event.name}</> : null}
      </ScreenTitle>

      {/* Right-side frosted control panel — all four questions stacked. */}
      <aside className="setup-panel">
        <div className="setup-q">
          <div className="setup-q__label">Where?</div>
          <div className="setup-pills">
            {ROOMS.map((r) => (
              <button
                key={r.type}
                className={`pill ${draft.roomType === r.type ? 'is-selected' : ''}`}
                onClick={() => {
                  pickRoom(r.type);
                  // Switching to the small huddle clamps an over-cap count down.
                  if (r.type === 'smallHuddle' && audience.size > HUDDLE_MAX) {
                    setAudience({ size: HUDDLE_MAX });
                  }
                }}
              >
                {r.title}
              </button>
            ))}
          </div>
        </div>

        <div className="setup-q">
          <div className="setup-q__label">How many?</div>
          <div className="setup-size">
            <input
              className="setup-size__slider"
              type="range"
              min={1}
              max={maxPeople}
              value={sizeShown}
              style={{
                '--fill': `${((sizeShown - 1) / (maxPeople - 1)) * 100}%`,
              } as React.CSSProperties}
              onChange={(e) => setAudience({ size: Number(e.target.value) })}
              aria-label="Audience size"
            />
            <span className="setup-size__value">
              {sizeShown} {sizeShown === 1 ? 'person' : 'people'}
            </span>
          </div>
        </div>

        <div className="setup-q">
          <div className="setup-q__label">Warmth?</div>
          <div className="setup-pills">
            {WARMTH.map((w) => (
              <button
                key={w.label}
                className={`pill ${warmthLabel === w.label ? 'is-selected' : ''}`}
                onClick={() => setAudience({ warmth: w.value })}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>

        <div className="setup-q">
          <div className="setup-q__label">Attention?</div>
          <div className="setup-pills">
            {ATTENTION.map((a) => (
              <button
                key={a.label}
                className={`pill ${attentionLabel === a.label ? 'is-selected' : ''}`}
                onClick={() => setAudience({ attention: a.value })}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>

        <div className="setup-panel__divider" />

        <div className="setup-panel__start-wrap">
          <button className="setup-panel__start" onClick={onStart}>
            {primaryLabel}
          </button>
        </div>
      </aside>
    </div>
  );
}
