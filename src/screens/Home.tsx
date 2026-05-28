import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { relativeTime } from '../lib/format';
import type { Event } from '../state/types';
import { ScreenTitle } from '../components/ScreenTitle';

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

export function Home() {
  const events = useStore((s) => s.events);
  const rehearseAgain = useStore((s) => s.rehearseAgain);
  const openProgress = useStore((s) => s.openProgress);
  const renameEvent = useStore((s) => s.renameEvent);
  const deleteEvent = useStore((s) => s.deleteEvent);

  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="screen home">
      <div className="home__brand">
        <span className="logo__dot" /> Rehearsal
      </div>
      <ScreenTitle>Let’s train your speech.</ScreenTitle>

      <TalksCarousel
        events={events}
        onNewTalk={() => setModalOpen(true)}
        onRehearseAgain={(id) => rehearseAgain(id)}
        onOpenProgress={(id) => openProgress(id)}
        onRename={(id, name) => renameEvent(id, name)}
        onDelete={(id) => deleteEvent(id)}
      />

      {modalOpen && <NameTalkModal onClose={() => setModalOpen(false)} />}
    </div>
  );
}

// ====== TalksCarousel ====================================================

interface CarouselProps {
  events: Event[];
  onNewTalk: () => void;
  onRehearseAgain: (id: string) => void;
  onOpenProgress: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

function TalksCarousel({
  events,
  onNewTalk,
  onRehearseAgain,
  onOpenProgress,
  onRename,
  onDelete,
}: CarouselProps) {
  // The carousel is: [NewTalk card] + [talks newest → oldest]. Events are
  // already stored newest-first, so we just prepend the new-talk slot.
  const itemCount = 1 + events.length;
  const [focusedIndex, setFocusedIndex] = useState(0);
  const stripRef = useRef<HTMLDivElement>(null);
  const rafIdRef = useRef<number | null>(null);
  // Pointer-drag state: when the user click-drags the strip horizontally, we
  // manipulate scrollLeft directly. Threshold suppresses the click that
  // browsers fire after a drag so cards don't activate on release.
  const dragRef = useRef<{ x: number; scrollLeft: number; moved: boolean } | null>(null);
  const justDraggedRef = useRef(false);

  function scrollToIndex(i: number) {
    const strip = stripRef.current;
    if (!strip) return;
    const clamped = Math.max(0, Math.min(itemCount - 1, i));
    const card = strip.children[clamped] as HTMLElement | undefined;
    if (!card) return;
    card.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    setFocusedIndex(clamped);
  }

  /** Click on a peek card → snap it to centre. Click on the focused card
   *  passes through to its inner buttons. Drag-released clicks are ignored. */
  function onSlotClick(slotIndex: number) {
    if (justDraggedRef.current) return;
    if (slotIndex !== focusedIndex) scrollToIndex(slotIndex);
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const strip = stripRef.current;
    if (!strip) return;
    dragRef.current = {
      x: e.clientX,
      scrollLeft: strip.scrollLeft,
      moved: false,
    };
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = dragRef.current;
    const strip = stripRef.current;
    if (!d || !strip) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) > 6) {
      d.moved = true;
      // Take pointer capture so the drag survives leaving the strip.
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    }
    if (d.moved) {
      strip.scrollLeft = d.scrollLeft - dx;
    }
  }
  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (!d.moved) return;
    // Drag ended — suppress the synthetic click and snap to the closest card.
    justDraggedRef.current = true;
    setTimeout(() => { justDraggedRef.current = false; }, 80);
    const strip = stripRef.current;
    if (!strip) return;
    const center = strip.scrollLeft + strip.clientWidth / 2;
    let best = 0;
    let bestD = Infinity;
    Array.from(strip.children).forEach((el, i) => {
      const c = (el as HTMLElement).offsetLeft + (el as HTMLElement).offsetWidth / 2;
      const dist = Math.abs(c - center);
      if (dist < bestD) { bestD = dist; best = i; }
    });
    scrollToIndex(best);
  }

  // Update focused index from scroll position (whichever card sits closest
  // to the viewport center wins).
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    function recompute() {
      const strip = stripRef.current;
      if (!strip) return;
      const center = strip.scrollLeft + strip.clientWidth / 2;
      let best = 0;
      let bestD = Infinity;
      Array.from(strip.children).forEach((el, i) => {
        const c = (el as HTMLElement).offsetLeft + (el as HTMLElement).offsetWidth / 2;
        const d = Math.abs(c - center);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      setFocusedIndex(best);
    }
    function onScroll() {
      if (rafIdRef.current != null) return;
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        recompute();
      });
    }
    strip.addEventListener('scroll', onScroll, { passive: true });
    // Initial compute (in case of resize / mount).
    recompute();
    return () => {
      strip.removeEventListener('scroll', onScroll);
      if (rafIdRef.current != null) cancelAnimationFrame(rafIdRef.current);
    };
  }, [itemCount]);

  // Keyboard navigation: ← → moves between cards.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Don't hijack arrows while the user is editing text somewhere.
      const tag = (document.activeElement?.tagName ?? '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        scrollToIndex(focusedIndex - 1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        scrollToIndex(focusedIndex + 1);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedIndex, itemCount]);

  // Re-snap the focused card after a resize (the centering padding changes).
  useEffect(() => {
    function onResize() {
      scrollToIndex(focusedIndex);
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedIndex]);

  const positionLabel =
    focusedIndex === 0
      ? events.length === 0
        ? 'Add your first talk'
        : `Add a new talk · ${events.length} ${events.length === 1 ? 'talk' : 'talks'} below`
      : `Talk ${focusedIndex} of ${events.length}`;

  const atStart = focusedIndex === 0;
  const atEnd = focusedIndex === itemCount - 1;

  return (
    <div className="talks-carousel">
      <button
        className={`carousel-nav carousel-nav--left ${atStart ? 'is-disabled' : ''}`}
        onClick={() => scrollToIndex(focusedIndex - 1)}
        disabled={atStart}
        aria-label="Previous talk"
      >
        <ChevronLeftIcon />
      </button>

      <div
        className="carousel-strip"
        ref={stripRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          className={`carousel-card ${focusedIndex === 0 ? 'is-focused' : ''}`}
          onClick={() => onSlotClick(0)}
        >
          <NewTalkCard onClick={onNewTalk} />
        </div>
        {events.map((ev, i) => {
          const slotIndex = i + 1;
          return (
            <div
              key={ev.id}
              className={`carousel-card ${focusedIndex === slotIndex ? 'is-focused' : ''}`}
              onClick={() => onSlotClick(slotIndex)}
            >
              <TalkCard
                event={ev}
                onRehearseAgain={() => onRehearseAgain(ev.id)}
                onOpenProgress={() => onOpenProgress(ev.id)}
                onRename={(name) => onRename(ev.id, name)}
                onDelete={() => onDelete(ev.id)}
              />
            </div>
          );
        })}
      </div>

      <button
        className={`carousel-nav carousel-nav--right ${atEnd ? 'is-disabled' : ''}`}
        onClick={() => scrollToIndex(focusedIndex + 1)}
        disabled={atEnd}
        aria-label="Next talk"
      >
        <ChevronRightIcon />
      </button>

      <div className="carousel-indicator muted small">{positionLabel}</div>
    </div>
  );
}

function ChevronLeftIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}
function ChevronRightIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 6l6 6 -6 6" />
    </svg>
  );
}

// ====== NewTalkCard =======================================================

function NewTalkCard({ onClick }: { onClick: () => void }) {
  return (
    <button className="newtalk-card" onClick={onClick}>
      <div className="newtalk-card__inner">
        <span className="newtalk-card__plus" aria-hidden>
          <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
        </span>
        <span className="newtalk-card__label">New talk</span>
        <span className="newtalk-card__hint muted small">
          Name a new talk to start rehearsing
        </span>
      </div>
    </button>
  );
}

// ====== TalkCard (unchanged shape, lives inside a carousel slot) ==========

interface TalkCardProps {
  event: Event;
  onRehearseAgain: () => void;
  onOpenProgress: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}

function TalkCard({
  event,
  onRehearseAgain,
  onOpenProgress,
  onRename,
  onDelete,
}: TalkCardProps) {
  const hasSessions = event.sessions.length > 0;
  const totalSessions = event.sessions.length;
  const latest = event.sessions[0];
  const setup = event.homeSetup;

  const peekBack1 = totalSessions >= 2;
  const peekBack2 = totalSessions >= 3;

  const [renaming, setRenaming] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <article className="talk-card">
      <header className="talk-card__head">
        <div className="talk-card__head-row">
          {renaming ? (
            <InlineRenameField
              value={event.name}
              onSave={(name) => {
                onRename(name);
                setRenaming(false);
              }}
              onCancel={() => setRenaming(false)}
            />
          ) : (
            <h4 className="talk-card__name">{event.name}</h4>
          )}
          <KebabMenu
            onRename={() => setRenaming(true)}
            onDelete={() => setConfirmingDelete(true)}
          />
        </div>
        <div className="talk-card__sub muted small">
          {hasSessions
            ? `${totalSessions} ${totalSessions === 1 ? 'rehearsal' : 'rehearsals'} · last ${relativeTime(latest.createdAt)}`
            : 'no rehearsals yet'}
        </div>
      </header>

      <div className={`talk-pile-wrap ${peekBack1 ? 'has-back1' : ''} ${peekBack2 ? 'has-back2' : ''}`}>
        {hasSessions ? (
          <>
            {peekBack2 && <div className="talk-pile__back talk-pile__back--2" aria-hidden />}
            {peekBack1 && <div className="talk-pile__back talk-pile__back--1" aria-hidden />}
            <button
              className="talk-pile__front"
              onClick={onOpenProgress}
              aria-label={`Open progress for ${event.name}`}
              title="See progress"
            >
              <span className="talk-pile__play" aria-hidden>
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
                  <path d="M8 5 L19 12 L8 19 Z" fill="white" />
                </svg>
              </span>
            </button>
          </>
        ) : (
          <div className="talk-pile__empty">
            <span className="muted small">no rehearsals yet</span>
          </div>
        )}
      </div>

      {setup && (
        <div className="talk-card__setup muted small">
          {ROOM_LABELS[setup.roomType] ?? setup.roomType} ·{' '}
          {setup.audience.size} ·{' '}
          {bucketWord(setup.audience.warmth, WARMTH_WORDS)} ·{' '}
          {bucketWord(setup.audience.attention, ATTENTION_WORDS)}
        </div>
      )}

      <div className="talk-card__actions">
        <button className="btn btn--pill" onClick={onRehearseAgain}>
          {hasSessions ? 'New rehearsal' : 'Start first rehearsal'}
        </button>
        {hasSessions && (
          <button className="btn btn--ghost btn--pill" onClick={onOpenProgress}>
            See progress
          </button>
        )}
      </div>

      {confirmingDelete && (
        <DeleteConfirmModal
          sessionCount={totalSessions}
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={() => {
            setConfirmingDelete(false);
            onDelete();
          }}
        />
      )}
    </article>
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
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="kebab-wrap" ref={wrapRef}>
      <button
        className="kebab-btn"
        onClick={() => setOpen((o) => !o)}
        aria-label="Talk actions"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <DotsIcon />
      </button>
      {open && (
        <div className="kebab-popover" role="menu">
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onRename();
            }}
          >
            Rename
          </button>
          <button
            role="menuitem"
            className="is-destructive"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
          >
            Delete talk
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

// ====== Delete confirmation ===============================================

function DeleteConfirmModal({
  sessionCount,
  onCancel,
  onConfirm,
}: {
  sessionCount: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const subtitle = sessionCount > 0
    ? `All ${sessionCount} ${sessionCount === 1 ? 'rehearsal' : 'rehearsals'} will be removed. This can’t be undone.`
    : null;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
    >
      <div
        className="modal-card modal-card--confirm"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="modal-card__title">Delete this talk?</h2>
        {subtitle && <p className="modal-card__sub muted">{subtitle}</p>}
        <div className="modal-card__actions">
          <button className="btn btn--ghost btn--pill" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn--pill btn--destructive" onClick={onConfirm}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ====== Name-talk modal (unchanged) =======================================

interface NameTalkModalProps {
  onClose: () => void;
}

function NameTalkModal({ onClose }: NameTalkModalProps) {
  const [name, setName] = useState('');
  const startNewEvent = useStore((s) => s.startNewEvent);
  const canSubmit = name.trim().length > 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = () => {
    if (!canSubmit) return;
    startNewEvent(name.trim());
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-card__close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <div className="modal-card__title">
          <ScreenTitle>Name your talk</ScreenTitle>
        </div>
        <p className="modal-card__sub muted">What are you rehearsing for?</p>
        <input
          type="text"
          autoFocus
          placeholder="e.g. Q3 Board Pitch"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />
        <button
          className={`btn modal-card__cta ${canSubmit ? '' : 'is-muted'}`}
          disabled={!canSubmit}
          onClick={submit}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
