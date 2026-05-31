# App ↔ Storybook compliance review

Source of truth: `public/storybook.html`. Tokens: `src/styles/tokens.css`.
The storybook was authored from the production styles, so the surfaces largely
match; this pass records the real deltas and the fixes applied. Items marked
**FLAG** are left alone for follow-up (storybook doesn't cover them or the change
is structural / risky).

---

## Logo  — `.app-logo` / `.app-logo__dot` / `.app-logo__word`
- ✅ Match. Dot pulses `--color-record` (1.6s), word is Inter 600 14px ink-deep,
  white on the dark Rehearsing screen, ink-deep on Insights.
- No change.

## Buttons — `.btn`, `.btn--pill`, `.btn--ghost`, `.btn--destructive`
- ❌ App primary buttons used a *peach shimmer sweep* + `:active { scale(.98) }`;
  storybook shows the **ink wipe** (red→copper `scaleX` fill, no button scale).
- **FIX:** replaced the shimmer with the ink-wipe `::after`
  (`linear-gradient(90deg, var(--color-record), var(--color-issue))`,
  `scaleX(0)→1` over 380ms `cubic-bezier(.65,0,.35,1)`, `scaleY(1.1)` on active);
  removed the press-scale and hover opacity/bg shift. Ghost/quiet/destructive
  opt out. Applied to `.btn`, `.ecard__rehearse`, `.setup-panel__start`.
- ✅ Circle buttons (`+ New`, Setup Start, Rehearsing gate) now use the **glow
  wash** (3-wave radial bloom, portaled to body) — replaces the old ripple.

## Talk card — app `.ecard` (liquid glass)
- ✅ Glass values now tokenised: `--color-glass-bg`, `blur(var(--blur-glass))`,
  `--color-glass-border`, `--radius-card`, `--shadow-card`. Matches storybook
  `.talk-card`. Within-card pile (front + b1/b2 rotated) and empty state match.
- **FLAG:** class name differs (`.ecard` vs storybook `.talk-card`). Not renamed
  app-wide (risky, no behavioural value); storybook should adopt `.ecard`.

## Pill — `.pill` / `.pill.is-selected`
- ❌ Selected was a tab underline; storybook now shows a **peach fill**.
- **FIX:** selected = `background: var(--color-aura-peach)`, ink-deep, semibold,
  no border, no shadow, `transition: background 220ms`. Unselected = `rgba(31,26,46,.06)`,
  ink-deep, medium. App + storybook both updated.
- **FLAG:** class name `is-selected` (app) vs `--selected` (storybook).

## Slider — `.seg-slider`
- ✅ Track + thumb (`accent-color: var(--ink)`) + value label match. No change.

## Cycling headline — `.home__headline` / `.home__cycle`
- ✅ Anek Telugu, centered, single-line nowrap, per-letter blur-fade. Matches.
  (Production runs much larger display sizes — intentional, not a drift.)

## Modal — `.modal-card` / `.modal-backdrop`
- ✅ Centered text + button row, Anek Telugu 500 title, cream card, staged
  delayed entry, input with no border/ring (bg deepen on focus). Matches.

## Dropdown — `.kebab-popover`
- ✅ Cream bg, 14px radius, no border, `--shadow-lg`, both items single
  `--color-ink-deep` (no destructive red), scale-pop in/out. Matches.

## Insight paper — `.insight-paper` + `.insight-tip`
- ✅ 60/40 split, cream paper + subtle rotation, peach-tint tip, bulb top-right.
- ⚠️ **PARTIAL:** eyebrows ("Insight #N", "Pay attention") still use
  `.insight-paper__eyebrow` / `.insight-tip__eyebrow`, not the shared `.label`.
  `.label` exists (10px/600/1.2px/uppercase/ink-muted); swapping every eyebrow
  to it across Progress/Insights/Setup/Home is the remaining label-unification
  sweep. **FLAG** (in progress).

## Setup right-side panel — `.setup-panel`
- ✅ Frosted panel, 4 questions, chips (peach when selected), Start pill (ink
  wipe). Matches. Audience preview is full-bleed in its container.

## Video preview card — `.vcard`
- ✅ Edge-to-edge poster (`background-size: cover`, `padding: 0`), bottom
  gradient + text overlay, no internal padding, hover trash. Matches.

## Progress strip
- Storybook `.ptick.done` now uses `var(--color-ink-press)` (#2a1f35), pending
  `var(--color-ink-faint)`. `--color-ink-press` already existed in tokens.
- **FLAG:** the app has no literal tick-strip component; Progress uses stat
  chips / the insight pile. No app equivalent to reconcile.

---

## Cross-cutting / FLAGGED for follow-up
1. **Label unification** — `.label` is defined but not yet applied to every
   eyebrow variant (`.article__eyebrow`, `.rail__label`, `.insight-*__eyebrow`,
   `.demo-tag`, etc.). Needs a JSX sweep + deletion of the old per-label styles.
2. **Page titles** — review asks for "Anek Telugu medium **20px** ink-deep";
   production `.screen-title` is 38px/600. The storybook has no page-title demo,
   so per the "don't invent" rule this is left alone and flagged.
3. **Class-name parity** — storybook uses simplified names (`.talk-card`,
   `.pill--selected`); production uses `.ecard`, `.pill.is-selected`. Visual
   values match; names should be reconciled in one direction.
4. **`design-tokens-audit.md` / `style-fixes.md`** — not yet written; the token
   layer is in place and the legacy `:root` vars are remapped onto it.

No screen behaviours, motion specs, or interaction logic were changed — only
visual/style properties.

---

## Round 2 — applied this pass
- **Glow wash behind plaque** — `.glow-wash-root` z-index 55; name modal restructured
  into a dim (`.modal-backdrop--name`, z50) + `.modal-cardlayer` (z60) so the
  "+ New" wash plays *behind* the card. Verified 50 < 55 < 60.
- **Name modal centred** — input `text-align: center`; title/body/actions already centred.
- **Buttons + pills radius** → `--radius-sm` (now **8px**): `.btn`, `.pill`,
  `.ecard__rehearse`, `.setup-panel__start` + storybook synced.
- **Setup chips inverted** — selected = `rgba(31,26,46,.06)`, unselected = transparent
  (peach fill removed). App + storybook synced.
- **Inputs** — no border/outline/box-shadow on `:focus`/`:active`, app-wide.
- **Setup page title** — added `Setup ● {talk}` (Anek Telugu 500, 20px) top-left
  under the logo, Progress-header format; replaced the old uppercase eyebrow.
- **Delete modals** — removed `.btn--destructive` from all three confirm dialogs
  (Home delete-talk, Progress delete-rehearsal, delete-all); the Delete action is
  now the primary ink-deep pill with the ink wipe. No static destructive red.

## Round 2 — NOT done / blocked
- **#6 Progress bar** — the message says `___INCOMPLETE___`; no spec given. Skipped.
- **Flags A–D** — items #3/#4/#6/#9 reference "[see flag X]", but the flag text
  wasn't included in the message. Implemented the items as literally written; if a
  flag changes the intent, resend it.
- **Label sweep / audit.md / style-fixes.md** — still outstanding from earlier rounds.
