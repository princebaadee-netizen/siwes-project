# IT/SIWES & Final Year Project — Frontend + Backend

One repo: the Next.js frontend at the root, the NestJS backend in `backend/`. Next proxies `/api/*` to the backend (see `next.config.js`), so there's one origin and no CORS to configure.

## Run it

```bash
npm install
npm --prefix backend install
cp backend/.env.example backend/.env   # fill in DATABASE_URL + JWT_SECRET (optional: ANTHROPIC_API_KEY, PAYSTACK_SECRET_KEY)
npm --prefix backend run prisma:generate
npm --prefix backend run prisma:migrate
npm run dev                            # starts API (:4001) + web (:3000) together
```

Then open http://localhost:3000 — it'll route you into onboarding automatically. `npm run dev` runs both halves; you don't need to start the backend separately.

## Tests

Backend unit tests (Jest + ts-jest; no database or network needed):

```bash
npm run test:api        # runs `npm test` in backend/
```

## What's built

- **Auth** — sign up, sign in, and a **forgot-password** flow (`/forgot-password` → `/reset-password`) that emails a one-hour, single-use reset link. With no mail provider configured the link is written to the backend console, so the flow is testable locally.
- **`/onboarding`** — module choice → profile → **account (email/password — creates a real account)** → IT placement details → attendance pattern (day-count + constrained day-picker) → project topic (if chosen) → review. Clicking "Go to dashboard" now actually calls the backend: signup → save profile → create IT placement (which generates the holiday-aware calendar server-side) → create project (which auto-generates the 5 chapters). Local `localStorage` state is still kept as a working cache/draft while filling the form, matching the plan's "offline continuity" design.
- **`/dashboard`** — tabbed side navigation shell.
  - **Overview**: fetches real chapter-completion and logbook progress from the backend.
  - **IT/SIWES**: day-by-day logbook CRUD, the "did you work these public holidays?" confirmation question, AI bulk fill-up (draft entries from a plain-text description; first 7 days free), and **Print / Save as PDF** for a clean logbook with a cover page.
  - **Project**: the real project/chapters, mark complete / reopen for revisions, per-chapter AI drafting (Chapter 1 free, the rest need the Project Pass), a **references list with citation verification** (Crossref/DataCite/Open Library, else link-check), and **Print / Save as PDF** for the chapters.
  - **Report**: a ready-to-print SIWES report assembled automatically from your placement, logbook and project, with a cover page (**Print / Save as PDF**).
  - **Account**: saves profile, module choice and IT placement for real, and sells the two passes (or a bundle that unlocks both) through Paystack, with an instant dev-mode grant when no keys are set.

## Design system

- **Colors**: deep academic green (`forest`) + muted gold (`gold`) + warm ivory paper (`paper`) + rust for warnings/locked states — see `tailwind.config.ts`.
- **Type**: Zilla Slab for headings, IBM Plex Sans for body, IBM Plex Mono for data.

## Structure

```
app/
  layout.tsx              — fonts + global providers
  page.tsx                — routes to /onboarding or /dashboard based on saved state
  login/page.tsx          — real login screen (email/password → JWT)
  forgot-password/page.tsx — request a reset link by email
  reset-password/page.tsx  — set a new password from the emailed token
  onboarding/page.tsx      — the wizard, now calling the real backend on finish
  dashboard/
    layout.tsx             — tabbed side nav shell
    page.tsx               — overview, fetches real project progress
    logbook/page.tsx       — logbook CRUD + calendar, wired to /logbook endpoints
    project/page.tsx
    report/page.tsx        — printable SIWES report assembled from real data
    account/page.tsx
components/
  ui.tsx
  attendance-picker.tsx
lib/
  types.ts                — shared TypeScript types matching the plan's data model
  store.tsx               — React Context + localStorage (local draft/cache)
  api.ts                  — the backend API client (all calls go to same-origin /api)
scripts/
  dev.mjs                 — runs the API and web dev servers together
backend/                  — NestJS + Prisma API (its own package.json, .env, README)
```

