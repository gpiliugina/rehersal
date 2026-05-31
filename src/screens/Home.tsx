import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { useGlowWash } from '../components/Ripple';
import { Modal, ConfirmDialog } from '../components/Modal';
import { relativeTime } from '../lib/format';
import type { Event } from '../state/types';

// The trailing word of the headline cycles through these. Only this word
// animates (per-letter blur-fade); the march of the talk cards is synced to it.
const CYCLE_WORDS = [
  'speech',
  'pitch',
  'keynote',
  'wedding toast',
  'TED talk',
  'board meeting',
  'interview',
  'presentation',
  'demo',
];
const LETTER_STAGGER = 65; // ms between letters
const LETTER_DUR = 320; // ms per letter
const HOLD_MS = 2600; // fully-visible hold before the word cycles
const GAP_MS = 150; // empty gap between words
const SCROLL_THROTTLE = 900; // min ms between scroll-driven card advances

const mod = (a: number, m: number) => ((a % m) + m) % m;

export function Home() {
  const events = useStore((s) => s.events);
  const rehearseAgain = useStore((s) => s.rehearseAgain);
  const openProgress = useStore((s) => s.openProgress);
  const renameEvent = useStore((s) => s.renameEvent);
  const deleteEvent = useStore((s) => s.deleteEvent);

  const [modalOpen, setModalOpen] = useState(false);

  // The card march is scroll-driven only. dir carries the scroll direction so
  // the cascade leads from the correct side. (The cycling word runs on its own
  // independent loop — see <CyclingWord> — and is NOT synced to the cards.)
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const wheelAtRef = useRef(0);

  // Scroll advances the cards forward / back, throttled.
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      const now = performance.now();
      if (now - wheelAtRef.current < SCROLL_THROTTLE) return;
      const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (Math.abs(delta) < 2) return;
      wheelAtRef.current = now;
      const d = delta > 0 ? 1 : -1;
      setDir(d);
      setStep((s) => s + d);
    };
    window.addEventListener('wheel', onWheel, { passive: true });
    return () => window.removeEventListener('wheel', onWheel);
  }, []);

  return (
    <div className="screen home settle-in">
      {/* Ambient aura — two slowly orbiting blobs behind all content (z0). */}
      <div className="home-aura" aria-hidden="true">
        <span className="home-aura__blob home-aura__blob--peach" />
        <span className="home-aura__blob home-aura__blob--pink" />
      </div>

      {/* Wordmark is rendered globally as <Logo /> (top-left on every page). */}
      <h1 className="home__headline">
        <span className="home__headline-prefix">Let’s train your</span>
        <CyclingWord />
      </h1>

      {/* Empty / first-time state is just the normal Home with NO cards. The
          gallery renders only once a talk exists — events come from synchronous
          localStorage, so there's no async load that could flash an empty grid. */}
      {events.length > 0 && (
        <TalkGallery
          events={events}
          step={step}
          dir={dir}
          onOpenProgress={(id) => openProgress(id)}
          onRehearse={(id) => rehearseAgain(id)}
          onRename={(id, name) => renameEvent(id, name)}
          onDelete={(id) => deleteEvent(id)}
        />
      )}

      {/* "+ New" stays bottom-centre in BOTH states (same coords + size). */}
      <PlusButton onClick={() => setModalOpen(true)} />

      {modalOpen && <NameTalkModal onClose={() => setModalOpen(false)} />}
    </div>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

// "+ New" button (bottom-centre). Clicking blooms the 3-wave glow wash out
// from the button centre. The button itself never moves.
function PlusButton({ onClick }: { onClick: () => void }) {
  const { layer, spawn } = useGlowWash();
  return (
    <div className="home__plus-wrap">
      {layer}
      <button
        className="home__plus"
        onClick={(e) => {
          spawn(e);
          onClick();
        }}
        aria-label="New talk"
      >
        <PlusIcon />
      </button>
    </div>
  );
}

// ====== Cycling last word ================================================
// "Let's train your ___" — only the trailing word animates: a staggered,
// per-letter blur-fade on entrance + exit. Self-contained: it loops on its OWN
// timer, independent of the card march (they are not synced).

function CyclingWord() {
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState(false); // target: letters visible?
  const [easing, setEasing] = useState<'ease-out' | 'ease-in'>('ease-out');

  const word = CYCLE_WORDS[index];
  const words = word.split(' ');
  const letterCount = word.replace(/ /g, '').length;

  useEffect(() => {
    const stagger = (letterCount - 1) * LETTER_STAGGER;
    const enterDur = stagger + LETTER_DUR;
    const exitDur = stagger + LETTER_DUR;
    const timers: number[] = [];

    // Entrance: start hidden (ease-out), then flip to shown next frame.
    setEasing('ease-out');
    setShown(false);
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setShown(true));
    });

    // After entrance + hold → exit (ease-in, staggered blur-out).
    timers.push(
      window.setTimeout(() => {
        setEasing('ease-in');
        setShown(false);
      }, enterDur + HOLD_MS),
    );
    // After exit + gap → advance to the next word (loops forever).
    timers.push(
      window.setTimeout(() => {
        setIndex((i) => (i + 1) % CYCLE_WORDS.length);
      }, enterDur + HOLD_MS + exitDur + GAP_MS),
    );

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      timers.forEach((t) => window.clearTimeout(t));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);


  // Each word is a no-wrap unit (letters never break mid-word); phrases keep a
  // normal space between units. The blur stagger uses a continuous left-to-right
  // index across the whole phrase.
  let gi = 0;
  return (
    <span className="home__cycle" aria-label={word}>
      {words.map((w, wi) => {
        const unit = (
          <span className="home__cycle-word" aria-hidden>
            {[...w].map((ch) => {
              const i = gi++;
              // Entrance staggers left-to-right; exit staggers right-to-left
              // (the word disappears from its end).
              const delay =
                easing === 'ease-in'
                  ? (letterCount - 1 - i) * LETTER_STAGGER
                  : i * LETTER_STAGGER;
              return (
                <span
                  key={i}
                  style={{
                    display: 'inline-block',
                    opacity: shown ? 1 : 0,
                    filter: shown ? 'blur(0px)' : 'blur(6px)',
                    transition: `opacity ${LETTER_DUR}ms ${easing} ${delay}ms, filter ${LETTER_DUR}ms ${easing} ${delay}ms`,
                  }}
                >
                  {ch}
                </span>
              );
            })}
          </span>
        );
        return wi === 0 ? (
          <Fragment key={wi}>{unit}</Fragment>
        ) : (
          <Fragment key={wi}> {unit}</Fragment>
        );
      })}
    </span>
  );
}

// ====== Arch gallery =====================================================
// Talk cards ride a symmetric arch: off-screen low-left → rise → peak centre →
// descend → off-screen low-right, across 7 slots (0 and 6 are off-screen
// buffers; 1–5 are visible). The `step` (scroll-driven from Home) advances
// every card one slot to the right with a right-to-left cascade; the card
// crossing the 6↔0 wrap teleports with no transition that frame.

interface CarouselProps {
  events: Event[];
  step: number;
  dir: number;
  onOpenProgress: (id: string) => void;
  onRehearse: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

// 7 arch slots — card centre as a % of the viewport (x across, y down) plus a
// per-slot scale. The peak (slot 3) is biggest; edges shrink. Tight x spacing
// (~16%) makes neighbours lightly overlap.
const ARCH = [
  { x: -8, y: 90, scale: 0.45, blur: 4, opacity: 0 }, // 0 — off-screen left, low
  { x: 18, y: 80, scale: 0.64, blur: 3, opacity: 1 }, // 1 — left edge, low (blurred, a bit bigger)
  { x: 35, y: 71, scale: 0.78, blur: 0, opacity: 1 }, // 2 — left mid, rising
  { x: 50, y: 65, scale: 1.0, blur: 0, opacity: 1 }, // 3 — PEAK (top of arch)
  { x: 65, y: 71, scale: 0.78, blur: 0, opacity: 1 }, // 4 — right mid, descending
  { x: 82, y: 80, scale: 0.64, blur: 3, opacity: 1 }, // 5 — right edge, low (blurred, a bit bigger)
  { x: 108, y: 90, scale: 0.45, blur: 4, opacity: 0 }, // 6 — off-screen right, low
];
const LANES = [0, 1, 2, 3, 4, 5, 6];
const CARD_MS = 750;
const EASE = 'cubic-bezier(0.55, 0, 0.7, 0.95)';

function TalkGallery({
  events,
  step,
  dir,
  onOpenProgress,
  onRehearse,
  onRename,
  onDelete,
}: CarouselProps) {
  const n = events.length;

  // Remember the previous step so we can spot the 6↔0 wrap and kill the
  // transition for that single teleport frame.
  const prevStepRef = useRef(step);
  const prevStep = prevStepRef.current;
  useEffect(() => {
    prevStepRef.current = step;
  });

  return (
    <div className="home__gallery">
      {LANES.map((lane) => {
        const slot = mod(lane + step, 7);
        const prevSlot = mod(lane + prevStep, 7);
        const teleported = Math.abs(slot - prevSlot) > 1;
        // Cascade leads from the side the scroll moves toward: forward → the
        // rightmost (slot 6) leads; backward → the leftmost (slot 0) leads.
        const delayMs = (dir >= 0 ? 6 - slot : slot) * 100;
        const a = ARCH[slot];
        const visible = a.opacity === 1;
        const style: React.CSSProperties = {
          left: `${a.x}%`,
          top: `${a.y}%`,
          transform: `translate(-50%, -50%) scale(${a.scale})`,
          opacity: a.opacity,
          // Edge cards (slots 1 & 5) are softly blurred so the peak reads sharpest.
          filter: a.blur > 0.05 ? `blur(${a.blur}px)` : 'none',
          transition: teleported
            ? 'none'
            : `left ${CARD_MS}ms ${EASE} ${delayMs}ms, top ${CARD_MS}ms ${EASE} ${delayMs}ms, transform ${CARD_MS}ms ${EASE} ${delayMs}ms, filter ${CARD_MS}ms ${EASE} ${delayMs}ms, opacity ${CARD_MS}ms ${EASE} ${delayMs}ms`,
          // Bigger (peak) cards sit on top so they overlap their neighbours.
          zIndex: Math.round(a.scale * 100),
          pointerEvents: visible ? 'auto' : 'none',
        };
        // The card carries its talk as it marches; content only changes
        // off-screen at the wrap.
        const ev = events[mod(step - slot + 1, n)];
        return (
          <TalkSheet
            key={lane}
            event={ev}
            isActive={false}
            style={style}
            onCardClick={() => onOpenProgress(ev.id)}
            onRehearse={() => onRehearse(ev.id)}
            onRename={(name) => onRename(ev.id, name)}
            onDelete={() => onDelete(ev.id)}
          />
        );
      })}
    </div>
  );
}

// ====== Talk card — rehearsal pile inside ================================

interface TalkSheetProps {
  event: Event;
  isActive: boolean;
  style: React.CSSProperties;
  onCardClick: () => void;
  onRehearse: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}

function TalkSheet({ event, isActive, style, onCardClick, onRehearse, onRename, onDelete }: TalkSheetProps) {
  const [renaming, setRenaming] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const total = event.sessions.length;
  const latest = event.sessions[0];
  const docs = event.sessions.slice(0, 3); // newest-first
  const meta =
    total > 0
      ? `${total} ${total === 1 ? 'rehearsal' : 'rehearsals'} · last ${relativeTime(latest.createdAt)}`
      : 'no rehearsals yet';
  const ps = (s?: typeof latest): React.CSSProperties | undefined =>
    s?.posterDataUrl
      ? { backgroundImage: `url(${s.posterDataUrl}), linear-gradient(135deg, #4a4350 0%, #2c303d 100%)` }
      : undefined;

  return (
    <div
      className="ecard"
      style={style}
      onClick={onCardClick}
      title={isActive ? 'See progress' : event.name}
    >
      <div className="ecard__head">
        <div className="ecard__head-text">
          {renaming ? (
            <div onClick={(e) => e.stopPropagation()}>
              <InlineRenameField
                value={event.name}
                onSave={(name) => {
                  onRename(name);
                  setRenaming(false);
                }}
                onCancel={() => setRenaming(false)}
              />
            </div>
          ) : (
            <span className="ecard__name">{event.name}</span>
          )}
          <span className="ecard__meta">{meta}</span>
        </div>
        <div className="ecard__kebab" onClick={(e) => e.stopPropagation()}>
          <KebabMenu
            onRename={() => setRenaming(true)}
            onDelete={() => setConfirmingDelete(true)}
          />
        </div>
      </div>

      {/* Rehearsal pile: latest poster on top, 1–2 older ones peeking behind
          (offset + rotated). 1 rehearsal → single poster; 0 → muted blank. */}
      <div className="ecard__pile">
        {total === 0 ? (
          <span className="ecard__doc ecard__doc--front ecard__doc--empty">
            <button
              className="ecard__rehearse"
              onClick={(e) => {
                e.stopPropagation();
                onRehearse();
              }}
            >
              Rehearse
            </button>
          </span>
        ) : (
          <>
            {docs[2] && <span className="ecard__doc ecard__doc--b2" style={ps(docs[2])} aria-hidden />}
            {docs[1] && <span className="ecard__doc ecard__doc--b1" style={ps(docs[1])} aria-hidden />}
            <span className="ecard__doc ecard__doc--front" style={ps(docs[0])}>
              <button
                className="ecard__rehearse"
                onClick={(e) => {
                  e.stopPropagation();
                  onRehearse();
                }}
              >
                Rehearse
              </button>
            </span>
          </>
        )}
      </div>

      {confirmingDelete && (
        <ConfirmDialog
          title="Delete this talk?"
          body={
            total > 0
              ? `All ${total} ${total === 1 ? 'rehearsal' : 'rehearsals'} will be removed. This can’t be undone.`
              : undefined
          }
          confirmLabel="Delete"
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={() => {
            setConfirmingDelete(false);
            onDelete();
          }}
        />
      )}
    </div>
  );
}

// ====== KebabMenu =========================================================

function KebabMenu({
  onRename,
  onDelete,
}: {
  onRename: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Play the close animation (140ms), then unmount the menu.
  const close = useCallback(() => {
    setClosing(true);
    window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 140);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  return (
    <div className="kebab-wrap" ref={wrapRef}>
      <button
        className="kebab-btn"
        onClick={() => (open ? close() : setOpen(true))}
        aria-label="Talk actions"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <DotsIcon />
      </button>
      {open && (
        <div className={`kebab-popover${closing ? ' is-closing' : ''}`} role="menu">
          <button
            role="menuitem"
            onClick={() => {
              close();
              onRename();
            }}
          >
            Rename
          </button>
          <button
            role="menuitem"
            onClick={() => {
              close();
              onDelete();
            }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

function DotsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="12" cy="6" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="18" r="1.6" />
    </svg>
  );
}

// ====== Inline rename =====================================================

function InlineRenameField({
  value,
  onSave,
  onCancel,
}: {
  value: string;
  onSave: (next: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.focus();
      el.select();
    }
  }, []);

  function commit() {
    const next = draft.trim();
    if (!next || next === value) {
      onCancel();
      return;
    }
    onSave(next);
  }

  return (
    <input
      ref={inputRef}
      className="talk-card__rename-input"
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        else if (e.key === 'Escape') onCancel();
      }}
    />
  );
}

// ====== Name-talk modal ===================================================

interface NameTalkModalProps {
  onClose: () => void;
}

function NameTalkModal({ onClose }: NameTalkModalProps) {
  const [name, setName] = useState('');
  const startNewEvent = useStore((s) => s.startNewEvent);
  const canSubmit = name.trim().length > 0;

  const submit = () => {
    if (!canSubmit) return;
    startNewEvent(name.trim());
  };

  return (
    <Modal onClose={onClose}>
      <h2 className="modal-title">Name your talk</h2>
      <p className="modal-body">What are you rehearsing for?</p>
      <input
        className="modal-input"
        type="text"
        autoFocus
        placeholder="e.g. Q3 Board Pitch"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
      />
      <div className="modal-actions">
        <button className="btn btn--ghost btn--pill" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn--pill" disabled={!canSubmit} onClick={submit}>
          Continue
        </button>
      </div>
    </Modal>
  );
}
