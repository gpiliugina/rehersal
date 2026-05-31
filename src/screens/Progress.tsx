import { ReactNode, useMemo, useRef, useState } from 'react';
import { useStore, selectActiveEvent } from '../state/store';
import { ScreenTitle } from '../components/ScreenTitle';
import { ConfirmDialog } from '../components/Modal';
import { Aura } from '../components/Aura';
import { CloseButton } from '../components/CloseButton';
import { mmss, relativeTime } from '../lib/format';
import { ROOM_LABELS } from '../lib/rooms';
import type { Session } from '../state/types';

// =============================================================================
// Plain-language vocabulary used by the screen's sentences.
// =============================================================================

const WARMTH_WORDS = ['Skeptical', 'Reserved', 'Neutral', 'Warm', 'Friendly'];
const ATTENTION_WORDS = ['Distracted', 'Drifting', 'Listening', 'Focused', 'Engaged'];
function bucketWord(value: number, words: string[]): string {
  const idx = Math.min(
    words.length - 1,
    Math.max(0, Math.floor(value * words.length)),
  );
  return words[idx];
}

// =============================================================================
// Quoted-phrase generator — keyed to the talk name. No real speech-to-text;
// the article weaves these fake-but-plausible lines in at simulated moments.
// =============================================================================

const PHRASE_POOLS: Record<string, string[]> = {
  business: [
    '... our quarterly revenue exceeded projections ...',
    '... moving into the next quarter ...',
    '... the data tells a clear story ...',
    '... where the numbers take us ...',
  ],
  personal: [
    '... I remember the first time ...',
    '... what makes you two extraordinary ...',
    '... raise your glasses to ...',
    '... from the very beginning ...',
  ],
  conference: [
    '... this changes the way we think ...',
    "... what's interesting here is ...",
    '... let me show you something ...',
    '... the real question is ...',
  ],
  team: [
    '... where we landed this sprint ...',
    '... blockers worth flagging ...',
    '... the shipping target stays the same ...',
    '... what shipped this week ...',
  ],
  default: [
    '... where I want to take this ...',
    '... what this really means is ...',
    '... and that brings me to ...',
    '... the point I keep coming back to ...',
  ],
};

function phrasePool(name: string): string[] {
  const n = name.toLowerCase();
  const has = (...kw: string[]) => kw.some((k) => n.includes(k));
  if (has('pitch', 'board', 'q3', 'q4', 'revenue', 'investor', 'quarterly', 'finance', 'sales'))
    return PHRASE_POOLS.business;
  if (has('wedding', 'toast', 'best man', 'maid of honor', 'bride', 'groom', 'anniversary'))
    return PHRASE_POOLS.personal;
  if (has('conference', 'keynote', 'ted', 'talk', 'speech', 'lecture'))
    return PHRASE_POOLS.conference;
  if (has('team', 'update', 'standup', 'sprint', 'all-hands', 'allhands', 'retro'))
    return PHRASE_POOLS.team;
  return PHRASE_POOLS.default;
}

// Inline emphasis helpers for the insight papers. Single deep-purple ink:
// bold marks rehearsal refs + timestamps; quotes are italic + muted gray.
const B = ({ children }: { children: ReactNode }) => <strong>{children}</strong>;
const Q = ({ children }: { children: ReactNode }) => <span className="quote">“{children}”</span>;

export function Progress() {
  const event = useStore(selectActiveEvent);
  const events = useStore((s) => s.events);
  const goHome = useStore((s) => s.goHomeExpandingActiveEvent);
  const openInsights = useStore((s) => s.openInsights);
  const editSetup = useStore((s) => s.editSetup);
  const rehearseAgain = useStore((s) => s.rehearseAgain);
  const renameEvent = useStore((s) => s.renameEvent);
  const deleteRehearsal = useStore((s) => s.deleteRehearsal);
  const goto = useStore((s) => s.goto);

  // The single rehearsal pending a delete-confirm, and the one mid-exit-anim.
  const [confirmingRehearsal, setConfirmingRehearsal] = useState<{ id: string; num: number } | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Chronological so "first → latest" reads naturally.
  const sessions = useMemo(
    () => (event ? [...event.sessions].sort((a, b) => a.createdAt - b.createdAt) : []),
    [event],
  );

  if (!event) {
    goto('home');
    return null;
  }

  // Confirm a single-rehearsal delete: play the card's exit animation, then
  // drop it from the talk (and its IndexedDB recording) once it's faded out.
  function onConfirmDeleteRehearsal(id: string) {
    setConfirmingRehearsal(null);
    setRemovingId(id);
    window.setTimeout(() => {
      deleteRehearsal(event!.id, id);
      setRemovingId(null);
    }, 280);
  }

  const setup = event.homeSetup;
  const metaLine = [
    `${sessions.length} ${sessions.length === 1 ? 'rehearsal' : 'rehearsals'}`,
    setup ? (ROOM_LABELS[setup.roomType] ?? setup.roomType) : null,
    setup ? `${setup.audience.size}` : null,
    setup ? bucketWord(setup.audience.warmth, WARMTH_WORDS) : null,
    setup ? bucketWord(setup.audience.attention, ATTENTION_WORDS) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const titleStrip = (
    <>
      <CloseButton onClick={goHome} />
      <ScreenTitle>
        Progress ·{' '}
        <InlineEditableName value={event.name} onSave={(n) => renameEvent(event.id, n)} />
      </ScreenTitle>
      <div className="progress2__meta">{metaLine}</div>
    </>
  );

  if (sessions.length === 0) {
    return (
      <div className="progress-screen progress2 settle-in">
        <Aura className="aura--purple-pink aura--progress-hero" />
        {titleStrip}
        <div className="progress2__body">
          <article className="progress2__article">
            <div className="insight-pile">
              <div className="insight-paper">
                <div className="insight-paper__eyebrow">Insight #1</div>
                <p className="insight-paper__p">
                  No rehearsals yet. Start your first one and your coaching notes will
                  appear here — one insight paper per run.
                </p>
              </div>
            </div>
          </article>
          <aside className="progress2__rail">
            <div className="progress2__pile-wrap" />
            <div className="progress2__rail-actions">
              <div className="progress2__btn-row">
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
                  Start first rehearsal
                </button>
              </div>
            </div>
          </aside>
        </div>
      </div>
    );
  }

  // ---- Article inputs ------------------------------------------------------
  const N = sessions.length;
  const pool = phrasePool(event.name);
  const newestFirst = [...sessions].reverse();

  return (
    <div className="progress-screen progress2 settle-in">
      <Aura className="aura--purple-pink aura--progress-hero" />
      <Aura className="aura--orange aura--progress-bottom" />
      {titleStrip}

      <div className="progress2__body">
        {/* LEFT — a pile of insight papers, latest on top (scrolls). */}
        <article className="progress2__article">
          <div className="insight-pile">
            {newestFirst.map((s, i) => (
              <InsightPaper
                key={s.id}
                session={s}
                num={N - i}
                pool={pool}
                rot={i % 2 === 0 ? '-0.5deg' : '0.5deg'}
                z={N - i}
                overlap={i > 0}
              />
            ))}
          </div>
        </article>

        {/* RIGHT — scrollable newest-first video list + actions. */}
        <aside className="progress2__rail">
          <div className="progress2__pile-wrap">
            <div className="vpile">
              {newestFirst.map((s, i) => {
                const num = N - i;
                const removing = removingId === s.id;
                const style = {
                  backgroundImage: s.posterDataUrl
                    ? `url(${s.posterDataUrl}), linear-gradient(135deg, #4a4350 0%, #2c303d 100%)`
                    : undefined,
                } as React.CSSProperties;
                return (
                  <div
                    key={s.id}
                    className={`vcard${removing ? ' vcard--removing' : ''}`}
                    style={style}
                    role="button"
                    tabIndex={0}
                    onClick={() => openInsights(event.id, s.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openInsights(event.id, s.id);
                      }
                    }}
                    aria-label={`Open rehearsal #${num}`}
                  >
                    <button
                      className="vcard__trash"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmingRehearsal({ id: s.id, num });
                      }}
                      aria-label={`Delete rehearsal #${num}`}
                      title="Delete rehearsal"
                    >
                      <IconTrash />
                    </button>
                    <div className="vcard__overlay">
                      <span className="vcard__num">Rehearsal #{num}</span>
                      <span className="vcard__meta">
                        {relativeTime(s.createdAt)} · {mmss(s.durationSec)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="progress2__rail-actions">
            <div className="progress2__btn-row">
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
          </div>
        </aside>
      </div>

      {confirmingRehearsal && (
        <ConfirmDialog
          title={`Delete rehearsal #${confirmingRehearsal.num}?`}
          body="The recording in your browser will be removed. Files in your Downloads folder stay untouched."
          confirmLabel="Delete"
          onCancel={() => setConfirmingRehearsal(null)}
          onConfirm={() => onConfirmDeleteRehearsal(confirmingRehearsal.id)}
        />
      )}
    </div>
  );
}

// =============================================================================
// Insight paper — one per rehearsal. Deep-purple ink only; bold for rehearsal
// refs + timestamps, italic muted gray for quoted phrases. Papers stack into a
// pile (latest on top) via the overlap margin + alternating rotation.
// =============================================================================

function InsightPaper({
  session,
  num,
  pool,
  rot,
  z,
  overlap,
}: {
  session: Session;
  num: number;
  pool: string[];
  rot: string;
  z: number;
  overlap: boolean;
}) {
  const d = session.diagnostics;
  const [p0, p1] = pool;
  const fmt = (s: number) => mmss(Math.round(s));
  const t0 = fmt(d.lostAttentionTimes[0] ?? 12);
  const t1 = fmt(d.lostAttentionTimes[Math.min(1, d.lostAttentionTimes.length - 1)] ?? 24);
  const fillersHigh = d.fillersPerMin >= 5;
  const lost = d.lostAttentionTimes.length;
  const groundedLow = d.groundedPct < 70;

  // Tip matches the dominant observation: voice → audience → movement.
  const tip = fillersHigh
    ? 'Take a 2-second silent breath before key transitions. Stillness reads more confident than rushing.'
    : lost > 0
      ? 'Mark your transitions with a brief pause and an eye-contact sweep before the next point.'
      : groundedLow
        ? 'Plant your feet shoulder-width before emphasis moments. The room reads your stability.'
        : 'Keep doing what worked here — same pacing, same grounded stance — and push it one notch further.';

  const style = {
    '--rot': rot,
    zIndex: z,
    marginTop: overlap ? undefined : 0,
  } as React.CSSProperties;

  return (
    <article className="insight-paper" style={style}>
      <div className="insight-paper__eyebrow">Insight #{num}</div>

      <div className="insight-paper__body">
        <div className="insight-paper__obs">
          <p className="insight-paper__p">
            {fillersHigh ? (
              <>
                In <B>rehearsal #{num}</B> at <B>{t0}</B>, just before <Q>{p0}</Q>, the fillers
                crept in — “um” more than once 🫧, and your voice tightened.
              </>
            ) : (
              <>
                By <B>rehearsal #{num}</B> your voice holds steadier — fillers settled to{' '}
                <B>{d.fillersPerMin}/min</B>. Around <Q>{p0}</Q> at <B>{t0}</B> you let the line
                breathe, and it reads as confident ✨.
              </>
            )}
          </p>

          <p className="insight-paper__p">
            {lost > 0 ? (
              <>
                At <B>{t1}</B>, after <Q>{p1}</Q>, you held a touch too long and the room
                drifted 👀 — you can see them lean back in the playback. Stance sat at{' '}
                <B>{d.groundedPct}% grounded</B>.
              </>
            ) : (
              <>
                The room stayed with you through the middle — after <Q>{p1}</Q> around <B>{t1}</B>,
                attention held. Stance steady at <B>{d.groundedPct}% grounded</B> 🌱.
              </>
            )}
          </p>
        </div>

        <aside className="insight-tip">
          <IconBulb />
          <div className="insight-tip__eyebrow">Pay attention</div>
          <p className="insight-tip__p">{tip}</p>
        </aside>
      </div>
    </article>
  );
}

// =============================================================================
// Inline-editable talk name (lives in the title strip)
// =============================================================================

// Edits the talk-name span IN PLACE via contentEditable — same element, so the
// glyphs keep the title's Anek Telugu size/weight/ink-deep colour and position
// (no separate <input> that collapses or hides the typed text).
function InlineEditableName({
  value,
  onSave,
}: {
  value: string;
  onSave: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  function startEdit() {
    setEditing(true);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      const r = document.createRange();
      r.selectNodeContents(el);
      const s = window.getSelection();
      if (s) {
        s.removeAllRanges();
        s.addRange(r);
      }
    });
  }

  function commit() {
    if (!editing) return;
    setEditing(false);
    const next = ref.current?.textContent?.trim();
    if (next && next !== value) onSave(next);
  }

  return (
    <>
      <span
        ref={ref}
        className="talk-name"
        contentEditable={editing}
        suppressContentEditableWarning
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            setEditing(false);
          }
        }}
        onBlur={commit}
      >
        {value}
      </span>
      <button
        className="title-edit"
        onClick={startEdit}
        aria-label={`Rename talk (current name: ${value})`}
      >
        <PencilIcon />
      </button>
    </>
  );
}

// =============================================================================
// Icons
// =============================================================================

function IconEdit() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4" />
      <path d="M13.5 6.5l4 4" />
    </svg>
  );
}

// ti-bulb — lightbulb for the "Pay attention" tip eyebrow.
function IconBulb() {
  return (
    <svg className="insight-tip__bulb" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 12h1M12 3v1M20 12h1M5.6 5.6l.7 .7M18.4 5.6l-.7 .7" />
      <path d="M9 16a5 5 0 1 1 6 0a3.5 3.5 0 0 0 -1 3a2 2 0 0 1 -4 0a3.5 3.5 0 0 0 -1 -3" />
      <path d="M9.7 17h4.6" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 7h16" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" />
      <path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" />
    </svg>
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
