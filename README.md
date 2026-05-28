# Rehearsal

A clickable concept demo of an AR smart-glasses **speech rehearsal** app.

You pick a setting, dial in an audience, and rehearse a talk in a calm 3D space. After the rehearsal you scrub back through it like a video — overlays surface the moments where you wobbled, where you held the room, and where your pulse spiked. Over time, a progress view shows whether you’re getting better.

> **All signals are simulated.** No camera, no microphone, no sensors, no permissions, no backend. On real glasses the same screens would be driven by pulse from a PPG, voice from on-device ML, and audience attention from eye-tracking / scene cameras.

## Run it

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173`). All state is stored in `localStorage` — no account, no server.

## The flow

```
Home → Room select → Audience preview → Rehearsing → Insights → Progress
```

- **Home** — your past rehearsals, plus a single "Start new session" button.
- **Room select** — pick *Meeting room* or *Your space*. The cards are live mini 3D scenes.
- **Audience preview** — set the audience *size* (exact number), *warmth*, and *attention*. A live 3D preview fills the chosen room with exactly that many semi-stylized avatars before you start.
- **Rehearsing** — first-person POV inside the room. The avatars react over time, driven by a scripted-plus-randomised engagement curve. Only a subtle attention meter, a timer, and an *End* button — no anxiety-spike vitals.
- **Insights** — play / pause / scrub the rehearsal as a video. Overlay captions appear synced to the timeline: pulse spikes, voice wavers, attention drops, confident stretches.
- **Progress** — a session-score trend chart plus *last vs best* side-by-side. Plain-language metrics with a one-line explanation on hover.

## Where the tunable simulation lives

Everything that affects the demo's *feel* sits in three small files. Tune these to change how the simulated talks behave; no other code needs to know.

- `src/sim/engagement.ts` — the engagement curve. The `TUNABLES` block at the top sets baseline pulse, opening-nerve bump, wobble frequency, etc. The simulator is deterministic given a seed (the session id), which is what makes Insights replay possible without re-running anything.
- `src/sim/session.ts` — assembles the simulation into a `Session` and truncates it to the actual elapsed time when the user ends early.
- `src/lib/scoring.ts` — turns the timeline into the five user-facing scores (Calm, Audience held, Confidence, Recovery, Overall) plus the plain-language explainers shown on hover.
- `src/lib/takeaways.ts` — turns markers and the timeline into the human-readable overlay captions that surface during Insights replay.

## Architecture

```
src/
  state/      store.ts (Zustand), types.ts
  scene/      Room, Avatar, AudienceLayout, AudiencePreview (the <Canvas>), ReplayController
  sim/        session.ts, engagement.ts        ← tunable
  screens/    Home, RoomSelect, AudiencePreview, Rehearsing, Insights, Progress
  lib/        scoring.ts, takeaways.ts, storage.ts, format.ts   ← scoring/takeaways tunable
  components/ shared UI (ScreenShell, Slider, AttentionMeter, MetricChip)
  App.tsx     screen switch driven by store.screen
```

### Data model

```ts
Session = {
  id, createdAt, roomType,
  audience { size, warmth, attention },
  durationSec,
  timeline [{ t, pulse, voiceSteadiness, attention, confidence }],
  markers  [{ t, type: 'weak' | 'strong', label }],
  scores   { calm, audienceHeld, confidence, recovery, overall }
}
```

The full timeline is pre-generated the moment you hit *Begin* (deterministic, seeded from the session id). Rehearsal plays through it in real time; ending early just slices the timeline at the elapsed second and re-scores. Insights replays the saved timeline exactly.

## Notes

- Desktop is the target; the UI works on mobile too.
- The avatars are composed from primitives (capsule torso, sphere head) rather than imported GLTFs — keeps the bundle tiny and the look intentionally calm and stylised, not game-like.
- No telemetry, no analytics, no network calls.
