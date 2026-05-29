import { create } from 'zustand';
import { loadEvents, newEventId, saveEvents } from '../lib/storage';
import { clearAllRecordings, deleteRecording } from '../lib/recordings';
import { buildSession, finalizeSession } from '../sim/session';
import type {
  AudienceConfig,
  DraftSession,
  Event,
  HomeSetup,
  RoomType,
  Screen,
  Session,
} from './types';

interface State {
  screen: Screen;
  events: Event[];

  // The Talk currently being practised. Sessions are saved under it.
  activeEventId: string | null;

  // Which talk is expanded on Home (single-open accordion).
  expandedEventId: string | null;

  draft: DraftSession;
  activeSession: Session | null;
  insightsSessionId: string | null;

  // When set, the Audience screen's primary action saves the chosen setup
  // as the talk's home setup AND returns to this screen instead of starting
  // a rehearsal. Used by the "Change setup" / "Edit setup" flows.
  editSetupReturnTo: Screen | null;

  // Where the user was when they entered Rehearsing. cancelRehearsal()
  // routes back here instead of always defaulting to Home.
  rehearsalSource: Screen | null;

  // Actions
  goto: (screen: Screen) => void;
  resetDraft: () => void;
  startNewEvent: (name: string) => void;
  toggleExpandedEvent: (eventId: string) => void;
  rehearseAgain: (eventId: string) => void;
  renameEvent: (eventId: string, name: string) => void;
  deleteEvent: (eventId: string) => void;
  pickRoom: (roomType: RoomType) => void;
  setAudience: (next: Partial<AudienceConfig>) => void;
  beginRehearsal: () => void;
  editSetup: (eventId: string, returnTo: Screen) => void;
  cancelEditSetup: () => void;
  endRehearsal: (
    elapsedSec: number,
    hasRecording?: boolean,
    posterDataUrl?: string,
  ) => void;
  cancelRehearsal: () => void;
  openInsights: (eventId: string, sessionId: string) => void;
  openProgress: (eventId: string) => void;
  goHomeExpandingActiveEvent: () => void;
  deleteAllRecordings: () => void;
}

const DEFAULT_AUDIENCE: AudienceConfig = {
  size: 12,
  warmth: 0.6,
  attention: 0.7,
};

function freshDraft(): DraftSession {
  return { roomType: undefined, audience: { ...DEFAULT_AUDIENCE } };
}

function draftFromSetup(setup: HomeSetup): DraftSession {
  return {
    roomType: setup.roomType,
    audience: { ...setup.audience },
  };
}

function updateEvent(
  events: Event[],
  id: string,
  fn: (e: Event) => Event,
): Event[] {
  return events.map((e) => (e.id === id ? fn(e) : e));
}

export const useStore = create<State>((set, get) => ({
  screen: 'home',
  events: loadEvents(),
  activeEventId: null,
  expandedEventId: null,
  draft: freshDraft(),
  activeSession: null,
  insightsSessionId: null,
  editSetupReturnTo: null,
  rehearsalSource: null,

  goto: (screen) => set({ screen }),

  resetDraft: () => set({ draft: freshDraft(), activeSession: null }),

  startNewEvent: (name) => {
    const event: Event = {
      id: newEventId(),
      name: name.trim() || 'Untitled talk',
      createdAt: Date.now(),
      sessions: [],
    };
    const next = [event, ...get().events];
    saveEvents(next);
    set({
      events: next,
      activeEventId: event.id,
      expandedEventId: event.id,
      draft: freshDraft(),
      activeSession: null,
      editSetupReturnTo: null,
      screen: 'roomSelect',
    });
  },

  toggleExpandedEvent: (eventId) =>
    set((s) => ({
      expandedEventId: s.expandedEventId === eventId ? null : eventId,
    })),

  /**
   * Click "Rehearse again" / "Start first rehearsal" on Home.
   *
   * If the talk already has a home setup, jump STRAIGHT into Rehearsing —
   * no intermediate screen — using that saved setup. Empty talks (no
   * homeSetup yet) still go through Room → Audience to capture one.
   */
  rehearseAgain: (eventId) => {
    const event = get().events.find((e) => e.id === eventId);
    // Where the user is right now — Home or Progress — determines where
    // they return to if they cancel the rehearsal mid-flow.
    const source = get().screen;
    if (event?.homeSetup) {
      const draft = draftFromSetup(event.homeSetup);
      const session = buildSession({
        roomType: draft.roomType!,
        audience: draft.audience,
      });
      set({
        activeEventId: eventId,
        expandedEventId: eventId,
        draft,
        activeSession: session,
        editSetupReturnTo: null,
        rehearsalSource: source,
        screen: 'rehearsing',
      });
      return;
    }
    set({
      activeEventId: eventId,
      expandedEventId: eventId,
      draft: freshDraft(),
      activeSession: null,
      editSetupReturnTo: null,
      rehearsalSource: null,
      screen: 'roomSelect',
    });
  },

  /**
   * Rename a talk in place. Updates everywhere `event.name` is read because
   * all consumers select from the events array in the store. Empty / blank
   * names are ignored so the user can't accidentally clear the title.
   */
  renameEvent: (eventId, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const next = updateEvent(get().events, eventId, (e) => ({
      ...e,
      name: trimmed,
    }));
    saveEvents(next);
    set({ events: next });
  },

  /**
   * Remove a talk and all its rehearsals. If the deleted talk is the
   * currently active or expanded one, clear those refs so we don't end up
   * pointing at a stale id.
   */
  deleteEvent: (eventId) => {
    // Best-effort: purge any on-device recordings for this talk's rehearsals
    // so deleting a talk doesn't orphan blobs in IndexedDB.
    const removed = get().events.find((e) => e.id === eventId);
    removed?.sessions.forEach((s) => {
      if (s.hasRecording) deleteRecording(s.id).catch(() => {});
    });
    const next = get().events.filter((e) => e.id !== eventId);
    saveEvents(next);
    set((s) => ({
      events: next,
      activeEventId: s.activeEventId === eventId ? null : s.activeEventId,
      expandedEventId: s.expandedEventId === eventId ? null : s.expandedEventId,
    }));
  },

  pickRoom: (roomType) =>
    set((s) => ({ draft: { ...s.draft, roomType } })),

  setAudience: (next) =>
    set((s) => ({
      draft: { ...s.draft, audience: { ...s.draft.audience, ...next } },
    })),

  /**
   * Audience screen's primary action. Always persists the chosen setup as
   * the talk's home setup. If we're in edit mode (Change setup / Edit setup
   * brought us here), return to the caller instead of starting a rehearsal.
   */
  beginRehearsal: () => {
    const { draft, activeEventId, events, editSetupReturnTo } = get();
    if (!draft.roomType || !activeEventId) return;

    const homeSetup: HomeSetup = {
      roomType: draft.roomType,
      audience: { ...draft.audience },
    };
    const nextEvents = updateEvent(events, activeEventId, (e) => ({
      ...e,
      homeSetup,
    }));
    saveEvents(nextEvents);

    if (editSetupReturnTo) {
      set({
        events: nextEvents,
        screen: editSetupReturnTo,
        editSetupReturnTo: null,
      });
      return;
    }

    const session = buildSession({
      roomType: draft.roomType,
      audience: draft.audience,
    });
    set({
      events: nextEvents,
      activeSession: session,
      // First-rehearsal flow lands here from the Audience screen, so cancel
      // returns there too.
      rehearsalSource: 'audiencePreview',
      screen: 'rehearsing',
    });
  },

  /**
   * Open the Room → Audience flow pre-filled with the talk's current home
   * setup. On Audience Begin we'll save the new setup and return to
   * `returnTo` (the recap or progress screen).
   */
  editSetup: (eventId, returnTo) => {
    const event = get().events.find((e) => e.id === eventId);
    if (!event) return;
    const setup = event.homeSetup;
    set({
      activeEventId: eventId,
      draft: setup ? draftFromSetup(setup) : freshDraft(),
      editSetupReturnTo: returnTo,
      screen: 'roomSelect',
    });
  },

  cancelEditSetup: () => {
    const { editSetupReturnTo } = get();
    set({
      editSetupReturnTo: null,
      screen: editSetupReturnTo ?? 'home',
    });
  },

  /**
   * Bail out of a rehearsal without saving it. Used by the Rehearsing X
   * button (either pre-Start or via the cancel-confirm modal mid-rehearsal).
   * Clears the active session and lands the user back on Home.
   */
  cancelRehearsal: () => {
    const source = get().rehearsalSource ?? 'home';
    set({
      activeSession: null,
      rehearsalSource: null,
      screen: source,
    });
  },

  endRehearsal: (elapsedSec, hasRecording = false, posterDataUrl) => {
    const { activeSession, activeEventId, events } = get();
    if (!activeSession || !activeEventId) return;
    const finalized = {
      ...finalizeSession(activeSession, elapsedSec),
      hasRecording,
      ...(posterDataUrl ? { posterDataUrl } : {}),
    };
    const nextEvents = updateEvent(events, activeEventId, (e) => ({
      ...e,
      sessions: [finalized, ...e.sessions],
    }));
    saveEvents(nextEvents);
    set({
      events: nextEvents,
      activeSession: finalized,
      insightsSessionId: finalized.id,
      rehearsalSource: null,
      screen: 'insights',
    });
  },

  openInsights: (eventId, sessionId) => {
    const ev = get().events.find((e) => e.id === eventId);
    if (!ev) return;
    const s = ev.sessions.find((x) => x.id === sessionId);
    if (!s) return;
    set({
      activeEventId: eventId,
      expandedEventId: eventId,
      activeSession: s,
      insightsSessionId: sessionId,
      screen: 'insights',
    });
  },

  openProgress: (eventId) =>
    set({
      activeEventId: eventId,
      expandedEventId: eventId,
      screen: 'progress',
    }),

  goHomeExpandingActiveEvent: () => {
    const { activeEventId } = get();
    set({
      expandedEventId: activeEventId ?? null,
      editSetupReturnTo: null,
      screen: 'home',
    });
  },

  /**
   * Wipe every in-browser recording (IndexedDB), app-wide, and strip the
   * recording metadata (hasRecording + poster) from all sessions so cards,
   * badges, and Insights reflect that the videos are gone — Insights now falls
   * back to the demo video. Progress data (scores/diagnostics) is untouched.
   * Files already in the user's Downloads folder are outside our reach.
   */
  deleteAllRecordings: () => {
    clearAllRecordings().catch((e) =>
      console.warn('Could not clear recordings store', e),
    );
    const next = get().events.map((e) => ({
      ...e,
      sessions: e.sessions.map((s) =>
        s.hasRecording || s.posterDataUrl
          ? { ...s, hasRecording: false, posterDataUrl: undefined }
          : s,
      ),
    }));
    saveEvents(next);
    set({ events: next });
  },
}));

export function selectActiveEvent(state: State): Event | null {
  if (!state.activeEventId) return null;
  return state.events.find((e) => e.id === state.activeEventId) ?? null;
}
