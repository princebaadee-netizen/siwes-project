# IT/SIWES & Final Year Project — Frontend + Backend

One repo: the Next.js frontend at the root, the NestJS backend in `backend/`. Next proxies `/api/*` to the backend (see `next.config.js`), so there's one origin and no CORS to configure.

## Run it

```bash
npm install
npm --prefix backend install
cp backend/.env.example backend/.env   # fill in DATABASE_URL + JWT_SECRET (optional: GROQ_API_KEY, PAYSTACK_SECRET_KEY)
npm --prefix backend run prisma:generate
npm --prefix backend run prisma:migrate
npm run dev                            # starts API (:4001) + web (:3000) together
```

Then open http://localhost:3000 — it'll route you into onboarding automatically. `npm run dev` runs both halves; you don't need to start the backend separately.

## Tests

No database or network needed — every suite mocks its dependencies.

```bash
npm test           # backend (Jest) + frontend (Vitest)
npm run test:api   # backend only — Jest + ts-jest
npm run test:web   # frontend only — Vitest (lib/sync.ts, lib/api.ts helpers)
```

## CI

`.github/workflows/ci.yml` runs on every push/PR: the **backend** job typechecks via `nest build`, runs the Jest suite, and builds; the **frontend** job runs `tsc --noEmit`, the Vitest suite, and `next build`. It needs no database or secrets (the tests are fully mocked). It only kicks in once the repo is pushed to GitHub.

## Deploying

Two pieces: the NestJS API and the Next.js frontend. Deploy the API first — you need its URL for the frontend.

### Backend (Render / Railway / Fly.io — any Node host)

- **Build**: `npm ci && npx prisma generate && npm run build`
- **Start**: `npm run start:prod` (runs `node dist/main.js`)
- **Release/once**: `npx prisma migrate deploy` to apply migrations (email verification, the SIWES report tables, and the rest)
- **Env**: `DATABASE_URL`, `DIRECT_URL` (Prisma Migrate uses this one — on Supabase, `DATABASE_URL` is the transaction pooler on `:6543` and `DIRECT_URL` the session pooler or direct host on `:5432`, since the migration engine can't run through a transaction pooler; they're the same for a plain Postgres), `JWT_SECRET` (long random), `FRONTEND_URL` (the deployed frontend URL — it's baked into reset and verification links), and `PORT` if the host needs one. Optional: `GROQ_API_KEY`/`AI_MODEL` (free key at https://console.groq.com/keys), `PAYSTACK_SECRET_KEY`, `RESEND_API_KEY`/`MAIL_FROM`, `ADMIN_EMAILS` (comma-separated allowlist that enables the admin topic-bank API and lets those accounts skip the paywall/free-trial limits for testing), and `REDIS_URL` (set it when running more than one instance so rate limits are shared instead of per-process)
- Keep `AI_DEV_UNLOCK`, `PAYSTACK_DEV_MODE` and `PASSWORD_RESET_DEV_MODE` **off** in production
- **PDF export uses Puppeteer**, which needs a Chromium binary plus its shared libraries. On a plain Node host (e.g. Render) set `PUPPETEER_SKIP_DOWNLOAD=true` and point `PUPPETEER_EXECUTABLE_PATH` at an installed Chrome/Chromium; the provided `backend/Dockerfile` already installs one. Uploaded logos/covers are written to `backend/uploads/` — mount a persistent volume there on hosts with ephemeral disks

### Frontend (Vercel — or any Node host)

- Set `API_PROXY_TARGET` to the deployed API URL (e.g. `https://your-api.onrender.com`). It's read when the Next server starts; on Vercel set it as a project env var and redeploy. Locally leave it unset and the proxy uses `backend/.env`'s `PORT`
- Build/start: `npm run build` / `npm run start`

### Docker (optional, one command)

For a self-contained API + database without installing Postgres:

```bash
docker compose up --build
```

This builds the API from `backend/Dockerfile`, starts Postgres, and runs `prisma migrate deploy` on boot — so the schema and all migrations apply automatically. The image installs Chromium for Puppeteer-based PDF export and keeps uploaded report images on a named volume. The API listens on http://localhost:4001; run the frontend with `npm run dev` (it proxies there by default). Replace the placeholder `JWT_SECRET` and drop the dev-only flags in `docker-compose.yml` before exposing it anywhere.

### Wiring the external callbacks

- Paystack webhook URL: `https://your-api.example.com/payments/webhook`
- The API's `FRONTEND_URL` must equal the deployed frontend so reset/verify links point to the right place

## What's built

- **Auth** — sign up, sign in, a **forgot-password** flow (`/forgot-password` → `/reset-password`) that emails a one-hour, single-use reset link, and **email verification** on signup (`/verify-email?token=...`, with a resend banner on the dashboard until confirmed). With no mail provider configured these links are written to the backend console, so both flows are testable locally.
- **`/onboarding`** — module choice → profile → **account (email/password — creates a real account)** → IT placement details → attendance pattern (day-count + constrained day-picker) → project topic (if chosen) → review. Clicking "Go to dashboard" now actually calls the backend: signup → save profile → create IT placement (which generates the holiday-aware calendar server-side) → create project (which auto-generates the 5 chapters). Local `localStorage` state is still kept as a working cache/draft while filling the form, matching the plan's "offline continuity" design.
- **`/dashboard`** — tabbed side navigation shell.
  - **Overview**: fetches real chapter-completion and logbook progress from the backend.
  - **IT/SIWES**: day-by-day logbook CRUD (edit or delete any entry) with per-entry review status (Draft → Reviewed → Finalized), the "did you work these public holidays?" confirmation question, AI bulk fill-up (draft entries from a plain-text description; first 7 days free), **AI single-day polish** (turn a rough note into a proper entry before saving), a live **free-trial indicator** (days left, or a nudge to buy the pass once it's spent), and **Print / Save as PDF** for a clean logbook with a cover page. Editing your placement rebuilds the calendar in place, keeping entries on days that are still on your attendance pattern.
  - **Project**: the real project/chapters, mark complete / reopen for revisions, per-chapter AI drafting (Chapter 1 free, the rest need the Project Pass) with a bounded number of **regenerations** per chapter, a **references list with citation verification** (Crossref/DataCite/Open Library, else link-check), and **Print / Save as PDF** for the chapters. When creating a project you can type your own topic, pick one from the **topic bank** — a filterable catalogue of curated topics (by field) — or let **AI suggest topics** tailored to your field/interests. Where the topic came from is recorded either way. Admins can curate the bank (add/edit/remove) from a **Topic bank** page, gated by the API's `ADMIN_EMAILS` allowlist.
  - **Report**: the AI-written IT/SIWES report (the IT/SIWES Pass gates generation). It assembles a **cover & title page** from editable details (institution, faculty/department, programme, level, matric no., supervisors, duration, submission date, and an optional uploaded logo or ready-made cover image), then writes the prose sections — Abstract, Dedication, Acknowledgment and Chapters 1–4 (Introduction, Industrial Experience, Skills Acquired, Discussion and Conclusion) — from your placement, logbook and project, one section per request to stay within the AI rate limit. Each section can be edited by hand and marked **Draft → Reviewed → Finalized**, rewritten with AI (bounded regenerations, with optional guidance), or all blank sections written at once. Export a print-ready **PDF** or an editable **Word (.docx)**. Reading/editing is free; only AI writing needs the pass.
  - **Account**: saves profile, module choice and IT placement for real, sells the two passes (or a bundle that unlocks both) through Paystack (instant dev-mode grant when no keys are set), shows an **AI usage** summary (generations, tokens and estimated cost, broken down by generation type), and lets a signed-in student **change their password** (current password required, rate-limited).
  - **Admin**: two admin pages behind the API's `ADMIN_EMAILS` allowlist — the **Topic bank** (curate the project-topic catalogue) and **Public holidays** (add/edit/remove the federal holiday list the attendance calendar is generated from; the seed ships 2026 and 2027 with the Eid dates marked as estimates, so an admin can correct them once the FG announces the real dates).

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
  verify-email/page.tsx    — confirm an email address from the signup link
  onboarding/page.tsx      — the wizard, now calling the real backend on finish
  dashboard/
    layout.tsx             — tabbed side nav shell
    page.tsx               — overview, fetches real project progress
    logbook/page.tsx       — logbook CRUD + calendar, wired to /logbook endpoints
    project/page.tsx
    report/page.tsx        — AI-written SIWES report: cover details, per-section generation/editing, PDF & DOCX export
    account/page.tsx
    admin/
      topics/page.tsx     — admin CRUD over the project-topic bank
      holidays/page.tsx   — admin CRUD over the federal public-holiday list
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

