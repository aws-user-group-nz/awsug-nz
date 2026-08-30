# Accessibility & mobile checklist

Internal handoff notes. Target: **WCAG 2.2 AA** for static pages and
client-hydrated regions (events feed, Discord counts, photo lightbox).

## Automated (CI)

Run after `npm run build`, with `npm run preview` serving `dist/`:

| Command | What it checks |
| --- | --- |
| `npm run check` | Astro / TS diagnostics |
| `npm run build` | Static build succeeds |
| `PREVIEW_URL=… npm run a11y` | axe-core (wcag2a/aa, 2.1, 2.2) on key routes; fails on serious/critical |
| `PREVIEW_URL=… npm run mobile-qa` | No horizontal overflow at 320 / 375 / 768 / 860; header controls ≥ 44×44 |

Key axe routes: `/`, `/about`, `/events`, `/meetups/auckland`,
`/community-days/photos/2025`, `/constitution`, `/code-of-conduct`, `/404`.

Workflow: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).

### Last local run (2026-07-30)

- axe: **0 serious/critical** on all key routes
- mobile-qa: **pass** at 320 / 375 / 768 / 860 on home, about, events,
  history, meetup, photos, constitution, sponsors
- Fixed during audit: gold sponsor tier badge contrast (dark text on bright
  gold fill)

## Foundations already in the codebase

- Skip link → `#main`
- Landmark labels (`nav` aria-labels, `aria-current`)
- `:focus-visible` on interactive controls
- `prefers-reduced-motion` for hero animation
- `--accent-text` for accent used as text (Smile Orange fails AA as body text)
- Decorative icons `aria-hidden`; icon-only controls have `aria-label`
- Events live region (`role="status"`) announces load / empty / error
- Photo lightbox uses `<dialog>` (`showModal`), Escape, focus restore
- PDF pages hide iframe below 640px and offer a download button

## Manual assistive-tech matrix

Complete on a physical device when available. Mark date + result.

| Tool | Routes | Status |
| --- | --- | --- |
| Keyboard only (desktop) | Skip link, header menu, theme toggle, events, History `<details>`, lightbox prev/next/close | Pass locally (2026-07-30): focus rings present; Escape closes menu + lightbox; focus returns to opener |
| VoiceOver (macOS) + Safari/Chrome | Home, Events (after hydration), Meetups, History, PDF download | Pending — needs host machine with VoiceOver |
| VoiceOver (iOS) + Safari | Home, Events, Meetups nav, lightbox | Pending — needs iPhone/iPad |
| NVDA + Firefox/Chrome | Same as macOS VO | Pending |

### Keyboard spot-checks (done)

- [x] Skip to content moves focus into `#main`
- [x] Mobile menu: Escape closes and returns focus to menu button
- [x] Theme toggle announces mode via dynamic `aria-label`
- [x] EventList status text updates when feed loads / fails
- [x] History year `<details>` summaries show visible focus ring
- [x] Lightbox: arrows, Escape, close restores focus to thumbnail
- [x] Sponsor logos have meaningful `alt` (sponsor name)

## Mobile spot-checks (done via Playwright)

| Viewport | Verified |
| --- | --- |
| 320px | No overflow; PDF download fallback (no iframe); footer stacks |
| 375px | Hamburger + theme toggle ≥ 44px; officers / events readable |
| 768px | Nav still collapsed; history roster stacks role under person |
| 860px | Desktop nav appears; no duplicate menu |

## Known limitations (accepted for now)

- No formal third-party WCAG certification
- Events remain client-fetched → no Event JSON-LD (by design; see README)
- Community Day gallery images are full-size originals (no thumbnails) —
  performance backlog, not an a11y blocker
- Discord member *names* list not shipped (privacy); counts only
- Screen-reader runs on VoiceOver/NVDA still pending on real hardware —
  axe + keyboard cover the automated gate

## How to re-verify locally

```bash
cd awsug-nz
npm ci
npx playwright install chromium
npm run check
npm run build
npm run preview &   # http://localhost:8001
PREVIEW_URL=http://127.0.0.1:8001 npm run a11y
PREVIEW_URL=http://127.0.0.1:8001 npm run mobile-qa
```
