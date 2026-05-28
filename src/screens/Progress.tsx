import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, selectActiveEvent } from '../state/store';
import { ScreenTitle } from '../components/ScreenTitle';
import { mmss, relativeTime } from '../lib/format';
import type { Diagnostics, Session } from '../state/types';

// =============================================================================
// Plain-language vocabulary used by the screen's sentences.
// =============================================================================

const ROOM_LABELS: Record<string, string> = {
  meetingRoom: 'Meeting room',
  yourSpace: 'Your space',
  conferenceStage: 'Conference stage',
  smallHuddle: 'Small huddle',
  townHall: 'Town hall',
};
const WARMTH_WORDS = ['Skeptical', 'Reserved', 'Neutral', 'Warm', 'Friendly'];
const ATTENTION_WORDS = ['Distracted', 'Drifting', 'Listening', 'Focused', 'Engaged'];
function bucketWord(value: number, words: string[]): string {
  const idx = Math.min(
    words.length - 1,
    Math.max(0, Math.floor(value * words.length)),
  );
  return words[idx];
}

export function Progress() {
  const event = useStore(selectActiveEvent);
  const goHome = useStore((s) => s.goHomeExpandingActiveEvent);
  const openInsights = useStore((s) => s.openInsights);
  const editSetup = useStore((s) => s.editSetup);
  const rehearseAgain = useStore((s) => s.rehearseAgain);
  const renameEvent = useStore((s) => s.renameEvent);
  const goto = useStore((s) => s.goto);

  if (!event) {
    goto('home');
    return null;
  }

  // Chronological so "first → latest" reads naturally.
  const sessions = useMemo(
    () => [...event.sessions].sort((a, b) => a.createdAt - b.createdAt),
    [event],
  );

  if (sessions.length === 0) {
    return (
      <div className="progress-screen progress-screen--diag">
        <BackCornerButton onClick={goHome} />
        <ScreenTitle>
          Progress ·{' '}
          <InlineEditableName
            value={event.name}
            onSave={(n) => renameEvent(event.id, n)}
          />
        </ScreenTitle>
        <header className="band-hero">
          <div className="band-hero__left">
            <div className="band-hero__verdict-line muted small">
              No rehearsals logged yet.
            </div>
          </div>
          <div className="band-hero__right">
            <button
              className="btn btn--pill"
              onClick={() => rehearseAgain(event.id)}
            >
              Start first rehearsal
            </button>
          </div>
        </header>
      </div>
    );
  }

  const verdict = progressVerdict(sessions);
  const summary = summaryHeadline(sessions);
  const focus = focusNextLine(sessions);
  const strength = strengthLine(sessions);
  const setup = event.homeSetup;
  const setupLine = setup
    ? `${ROOM_LABELS[setup.roomType] ?? setup.roomType} · ${setup.audience.size} · ${bucketWord(setup.audience.warmth, WARMTH_WORDS)} · ${bucketWord(setup.audience.attention, ATTENTION_WORDS)}`
    : null;

  // Rehearsals list — newest at top.
  const newestFirst = [...sessions].reverse();

  return (
    <div className="progress-screen progress-screen--diag">
      <BackCornerButton onClick={goHome} />
      <ScreenTitle>
        Progress ·{' '}
        <InlineEditableName
          value={event.name}
          onSave={(n) => renameEvent(event.id, n)}
        />
      </ScreenTitle>
      <header className="band-hero">
        <div className="band-hero__left">
          <div className="band-hero__verdict-line muted small">
            {sessions.length} rehearsal{sessions.length === 1 ? '' : 's'} ·{' '}
            <span className="band-hero__verdict-word">{verdict}</span>
            {' · '}
            {summary}
          </div>
        </div>
        <div className="band-hero__right">
          {setupLine && (
            <span className="band-hero__setup muted small">{setupLine}</span>
          )}
          <button
            className="btn btn--ghost btn--pill"
            onClick={() => editSetup(event.id, 'progress')}
          >
            Edit setup
          </button>
          <button
            className="btn btn--pill"
            onClick={() => rehearseAgain(event.id)}
          >
            New rehearsal
          </button>
        </div>
      </header>

      <div className="lanes-row">
        <VoiceLane sessions={sessions} />
        <RoomLane sessions={sessions} />
        <MovementLane sessions={sessions} />
      </div>

      <div className="band-bottom">
        <div className="band-bottom__left">
          <div className="fs-card fs-card--focus">
            <div className="fs-card__eyebrow">FOCUS NEXT</div>
            <p className="fs-card__line">{focus}</p>
          </div>
          <div className="fs-card fs-card--strength">
            <div className="fs-card__eyebrow">STRENGTH</div>
            <p className="fs-card__line">{strength}</p>
          </div>
        </div>

        <aside className="rehearsals-list">
          <div className="rehearsals-list__label">REHEARSALS</div>
          <div className="rehearsals-list__scroll">
            {newestFirst.map((s, i) => {
              const attemptNum = sessions.length - i;
              const isLatest = i === 0;
              return (
                <button
                  key={s.id}
                  className={`rehearsal-row ${isLatest ? 'is-latest' : ''}`}
                  onClick={() => openInsights(event.id, s.id)}
                >
                  <span className="rehearsal-row__icon" aria-hidden>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5 L19 12 L8 19 Z" />
                    </svg>
                  </span>
                  <span className="rehearsal-row__num">#{attemptNum}</span>
                  <span className="rehearsal-row__meta muted small">
                    {relativeTime(s.createdAt)} · {mmss(s.durationSec)}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}

// =============================================================================
// VOICE lane — hero "N → M" + fat pill bars
// =============================================================================

function VoiceLane({ sessions }: { sessions: Session[] }) {
  const latest = sessions[sessions.length - 1].diagnostics;
  const first = sessions[0].diagnostics;
  const fillerMax = Math.max(8, ...sessions.map((s) => s.diagnostics.fillersPerMin));
  const toneWord = toneAdjective(latest.toneSteadiness, first.toneSteadiness);
  const fillerBetter = first.fillersPerMin > latest.fillersPerMin;

  return (
    <LaneCard icon={<IconMicrophone />} eyebrow="VOICE">
      <div className={`lane-hero__big ${sessions.length >= 2 ? (fillerBetter ? 'is-good' : 'is-neutral') : 'is-neutral'}`}>
        {sessions.length >= 2 ? (
          <>
            <span className="voice-hero__before">{first.fillersPerMin}</span>
            <span className="voice-hero__arrow">→</span>
            <span className="voice-hero__after">{latest.fillersPerMin}</span>
          </>
        ) : (
          <span className="voice-hero__after">{latest.fillersPerMin}</span>
        )}
      </div>
      <div className="lane-hero__sub">fillers / min</div>

      <div className="bar-group bar-group--solo">
        <div className="bar-group__bars">
          {sessions.map((s, i) => {
            const isLatest = i === sessions.length - 1;
            const v = s.diagnostics.fillersPerMin;
            const heightPct = Math.max(4, (v / fillerMax) * 100);
            return (
              <div
                key={i}
                className={`bar ${isLatest ? 'is-latest' : ''}`}
                title={`Attempt #${i + 1}: ${v}`}
              >
                <div className="bar__fill" style={{ height: `${heightPct}%` }} />
                <span className="bar__val">{v}</span>
              </div>
            );
          })}
        </div>
      </div>

      <p className="lane-takeaway">
        {sessions.length >= 2
          ? `Long pauses ${first.longPauses} → ${latest.longPauses}. Tone ${toneWord}.`
          : `Long pauses ${latest.longPauses}. Tone ${toneWord}.`}
      </p>
    </LaneCard>
  );
}

// =============================================================================
// ROOM lane — hero "N → M" + horizontal tracks with amber pips
// =============================================================================

function RoomLane({ sessions }: { sessions: Session[] }) {
  const latest = sessions[sessions.length - 1].diagnostics;
  const first = sessions[0].diagnostics;
  const lostFirst = first.lostAttentionTimes.length;
  const lostLatest = latest.lostAttentionTimes.length;
  const lostBetter = lostFirst > lostLatest;
  const clusterPhrase = lostMomentCluster(sessions);

  return (
    <LaneCard icon={<IconUsers />} eyebrow="ROOM">
      <div className={`lane-hero__big ${sessions.length >= 2 ? (lostBetter ? 'is-good' : 'is-neutral') : 'is-neutral'}`}>
        {sessions.length >= 2 ? (
          <>
            <span className="voice-hero__before">{lostFirst}</span>
            <span className="voice-hero__arrow">→</span>
            <span className="voice-hero__after">{lostLatest}</span>
          </>
        ) : (
          lostLatest
        )}
      </div>
      <div className="lane-hero__sub">lost-room moments</div>

      <div className="room-tracks">
        {sessions.map((s, i) => {
          const isLatest = i === sessions.length - 1;
          return (
            <div key={s.id} className={`room-track ${isLatest ? 'is-latest' : ''}`}>
              <span className="room-track__num">#{i + 1}</span>
              <div className="room-track__bar">
                {s.diagnostics.lostAttentionTimes.map((t, j) => (
                  <span
                    key={j}
                    className="room-track__pip"
                    style={{ left: `${(t / s.durationSec) * 100}%` }}
                    title={mmss(t)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="lane-ticks">
        <span>open</span>
        <span>middle</span>
        <span>close</span>
      </div>

      <p className="lane-takeaway">
        {clusterPhrase || (lostLatest === 0 ? 'No drops this run.' : 'Drops spread across the talk.')}
      </p>
    </LaneCard>
  );
}

// =============================================================================
// MOVEMENT lane — donut + 3 reads
// =============================================================================

function MovementLane({ sessions }: { sessions: Session[] }) {
  const latest = sessions[sessions.length - 1].diagnostics;
  const first = sessions[0].diagnostics;
  const trendWord = (cur: string, prev: string): '▲' | '▼' | '–' => {
    const order: Record<string, number> = {
      Steady: 3, Forward: 3, Measured: 3,
      Light: 2, Scanning: 2, Active: 2,
      Restless: 1, Still: 1, Busy: 1,
    };
    if (!(cur in order) || !(prev in order)) return '–';
    if (order[cur] > order[prev]) return '▲';
    if (order[cur] < order[prev]) return '▼';
    return '–';
  };
  const groundedBetter = latest.groundedPct > first.groundedPct;
  const placementWord =
    latest.groundedPct >= first.groundedPct + 4 ? 'Less sway' : 'Steady stance';
  const wherePhrase = momentPhrase(latest);

  return (
    <LaneCard icon={<IconBodyScan />} eyebrow="MOVEMENT">
      <div className={`lane-hero__big ${sessions.length >= 2 ? (groundedBetter ? 'is-good' : 'is-neutral') : 'is-neutral'}`}>
        {sessions.length >= 2 ? (
          <>
            <span className="voice-hero__before">{first.groundedPct}%</span>
            <span className="voice-hero__arrow">→</span>
            <span className="voice-hero__after">{latest.groundedPct}%</span>
          </>
        ) : (
          `${latest.groundedPct}%`
        )}
      </div>
      <div className="lane-hero__sub">grounded</div>

      <div className="movement movement--row">
        <Donut value={latest.groundedPct} />
        <div className="movement__reads">
          <MoveRead label="Sway" value={latest.swayLevel} trend={trendWord(latest.swayLevel, first.swayLevel)} />
          <MoveRead label="Hand gestures" value={latest.handGestures} trend={trendWord(latest.handGestures, first.handGestures)} />
          <MoveRead label="Head turns" value={latest.headTurns} trend={trendWord(latest.headTurns, first.headTurns)} />
        </div>
      </div>

      <p className="lane-takeaway">
        {`${placementWord} in the ${wherePhrase}.`}
      </p>
    </LaneCard>
  );
}

function Donut({ value }: { value: number }) {
  const r = 36;
  const c = 2 * Math.PI * r;
  const dash = Math.max(0, Math.min(c, (value / 100) * c));
  return (
    <div className="donut donut--compact">
      <svg viewBox="0 0 96 96" aria-hidden>
        <circle cx="48" cy="48" r={r} fill="none" stroke="rgba(31, 34, 48, 0.08)" strokeWidth="12" />
        <circle
          cx="48" cy="48" r={r}
          fill="none" stroke="#7a8a6a" strokeWidth="12"
          strokeDasharray={`${dash} ${c}`}
          strokeLinecap="round"
          transform="rotate(-90 48 48)"
        />
        <text x="48" y="50" textAnchor="middle" dominantBaseline="middle" className="donut__pct">
          {value}%
        </text>
      </svg>
    </div>
  );
}

function MoveRead({
  label,
  value,
  trend,
}: {
  label: string;
  value: string;
  trend: '▲' | '▼' | '–';
}) {
  const cls = trend === '▲' ? 'is-up' : trend === '▼' ? 'is-down' : 'is-flat';
  return (
    <div className="moveread">
      <span className="moveread__label">{label}</span>
      <span className="moveread__value">
        {value}{' '}
        <span className={`moveread__trend ${cls}`}>{trend}</span>
      </span>
    </div>
  );
}

// =============================================================================
// Shared lane scaffolding
// =============================================================================

function LaneCard({
  icon,
  eyebrow,
  children,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <section className="lane">
      <header className="lane__head">
        <span className="lane__icon">{icon}</span>
        <span className="lane__eyebrow">{eyebrow}</span>
      </header>
      {children}
    </section>
  );
}

// =============================================================================
// Plain-language verdict + sentence generators
// =============================================================================

function progressVerdict(sessions: Session[]): string {
  if (sessions.length <= 1) return 'one rehearsal logged so far';
  const first = sessions[0].diagnostics;
  const last = sessions[sessions.length - 1].diagnostics;
  const settleDelta = first.settleTimeSec - last.settleTimeSec;
  const peakDelta = first.peakPulse - last.peakPulse;
  const fillerDelta = first.fillersPerMin - last.fillersPerMin;
  const lostDelta = first.lostAttentionTimes.length - last.lostAttentionTimes.length;
  const groundedDelta = last.groundedPct - first.groundedPct;
  if (settleDelta >= 10) return "you're settling faster";
  if (peakDelta >= 5) return 'calmer than the first time';
  if (fillerDelta >= 2) return 'cleaner delivery';
  if (lostDelta >= 1) return 'holding the room better';
  if (groundedDelta >= 6) return 'more grounded on your feet';
  if (settleDelta <= -10 || peakDelta <= -5) return 'still finding your feet';
  return 'holding steady';
}

function summaryHeadline(sessions: Session[]): string {
  if (sessions.length < 2) return 'One rehearsal logged so far.';
  const first = sessions[0].diagnostics;
  const last = sessions[sessions.length - 1].diagnostics;

  const phrases: string[] = [];
  if (first.fillersPerMin - last.fillersPerMin >= 2) phrases.push('cleaner');
  if (first.peakPulse - last.peakPulse >= 5) phrases.push('calmer');
  if (last.toneSteadiness - first.toneSteadiness >= 0.05) phrases.push('steadier');
  if (first.lostAttentionTimes.length - last.lostAttentionTimes.length >= 1)
    phrases.push('holding the room');
  if (last.groundedPct - first.groundedPct >= 4) phrases.push('more grounded');

  if (phrases.length === 0) {
    const slipped =
      last.fillersPerMin > first.fillersPerMin ||
      last.lostAttentionTimes.length > first.lostAttentionTimes.length ||
      last.peakPulse > first.peakPulse + 4;
    return slipped ? 'Still finding your feet.' : 'Holding the line.';
  }

  const capped = phrases.slice(0, 3).join(', ');
  return capped.charAt(0).toUpperCase() + capped.slice(1) + '.';
}

function focusNextLine(sessions: Session[]): string {
  const latest = sessions[sessions.length - 1].diagnostics;
  const recent = sessions.slice(-3);
  const drops = recent.flatMap((s) =>
    s.diagnostics.lostAttentionTimes.map((t) => t / s.durationSec),
  );
  if (drops.length >= 2) {
    const early = drops.filter((p) => p < 0.33).length;
    const mid = drops.filter((p) => p >= 0.33 && p < 0.66).length;
    const late = drops.filter((p) => p >= 0.66).length;
    if (early >= Math.max(mid, late))
      return 'Opening 30 seconds keeps slipping. A pause or question before your first line resets the room.';
    if (late >= Math.max(mid, early))
      return 'You lose them near the close. Land a one-sentence summary before the last beat.';
    if (mid > 0)
      return 'Attention dips mid-talk. Add a deliberate pause or eye-sweep around the halfway mark.';
  }
  if (latest.fillersPerMin >= 6)
    return "Fillers are still high. Pause instead of bridging with 'um' or 'so'.";
  if (latest.settleTimeSec >= 75)
    return 'Pulse takes a while to settle. Two slow exhales before opening.';
  if (latest.longPauses >= 3)
    return 'Long pauses cluster mid-talk. Shorter beats, then keep moving.';
  return 'Small tweak: pick one of the early markers and replay the seconds just before it.';
}

function strengthLine(sessions: Session[]): string {
  const latest = sessions[sessions.length - 1].diagnostics;
  if (latest.lostAttentionTimes.length === 0 && latest.fillersPerMin <= 3)
    return "Middle two minutes are clean — voice steady, room engaged. That's your baseline.";
  if (latest.groundedPct >= 78)
    return 'Your stance stays grounded — the visual steadiness is doing work for you.';
  if (latest.toneSteadiness >= 0.72)
    return 'Voice tone holds across the talk. Lean on that during the high-pressure beats.';
  if (latest.peakPulse < 100)
    return "You stay physically calm — peak pulse never crosses the spike line. Keep that baseline.";
  if (latest.settleTimeSec < 45)
    return 'You settle inside the first minute. That fast-recovery opening is rare — keep it.';
  return 'Energy is consistent across attempts. That stability is the floor; layer on from there.';
}

function lostMomentCluster(sessions: Session[]): string {
  const recent = sessions.slice(-3);
  const fractions = recent.flatMap((s) =>
    s.diagnostics.lostAttentionTimes.map((t) => t / s.durationSec),
  );
  if (fractions.length === 0) return '';
  const early = fractions.filter((p) => p < 0.33).length;
  const mid = fractions.filter((p) => p >= 0.33 && p < 0.66).length;
  const late = fractions.filter((p) => p >= 0.66).length;
  const max = Math.max(early, mid, late);
  if (max === 0) return '';
  if (early === max) return 'Still happens in the first 30s.';
  if (mid === max) return 'Drops cluster mid-talk.';
  return 'Most often near the close.';
}

function momentPhrase(d: Diagnostics): string {
  if (d.lostAttentionTimes.length === 0) return 'middle';
  const first = d.lostAttentionTimes[0];
  if (first < 25) return 'open';
  if (first > 70) return 'close';
  return 'middle';
}

function toneAdjective(latest: number, first: number): string {
  const delta = latest - first;
  if (latest >= 0.78) return 'steadier';
  if (latest <= 0.55) return 'wavering';
  if (delta >= 0.06) return 'steadier than before';
  if (delta <= -0.06) return 'less even than before';
  return 'consistent';
}

// =============================================================================
// Inline-editable talk name (lives in the eyebrow)
// =============================================================================

function InlineEditableName({
  value,
  onSave,
}: {
  value: string;
  onSave: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    if (el) {
      el.focus();
      el.select();
    }
  }, [editing]);

  function commit() {
    const next = draft.trim();
    if (next && next !== value) onSave(next);
    setEditing(false);
  }
  function cancel() {
    setDraft(value);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="inline-edit__input"
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          else if (e.key === 'Escape') cancel();
        }}
      />
    );
  }

  return (
    <button
      className="inline-edit__view"
      onClick={() => setEditing(true)}
      title="Rename this talk"
      aria-label={`Rename talk (current name: ${value})`}
    >
      <span>{value}</span>
      <span className="inline-edit__pencil" aria-hidden>
        <PencilIcon />
      </span>
    </button>
  );
}

function BackCornerButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="btn-icon progress__back-corner"
      onClick={onClick}
      aria-label="Back"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M15 6l-6 6 6 6" />
      </svg>
    </button>
  );
}

function PencilIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4" />
      <path d="M13.5 6.5l4 4" />
    </svg>
  );
}

// =============================================================================
// Tabler-style stroke icons for the lane eyebrows
// =============================================================================
function IconMicrophone() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="11" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <path d="M12 17v4" />
      <path d="M8 21h8" />
    </svg>
  );
}
function IconUsers() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="7" r="3" />
      <path d="M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" />
      <path d="M16 3.5a4 4 0 0 1 0 7.5" />
      <path d="M21 21v-2a4 4 0 0 0 -3 -3.85" />
    </svg>
  );
}
function IconBodyScan() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7v-2a2 2 0 0 1 2 -2h2" />
      <path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M21 17v2a2 2 0 0 1 -2 2h-2" />
      <path d="M7 21h-2a2 2 0 0 1 -2 -2v-2" />
      <circle cx="12" cy="9" r="2.5" />
      <path d="M9 21v-3a3 3 0 0 1 3 -3a3 3 0 0 1 3 3v3" />
    </svg>
  );
}
