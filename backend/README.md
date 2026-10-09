# Backend — Auth + Database Schema

NestJS + Prisma + PostgreSQL, matching the data model from the planning document.

## ⚠️ One honest caveat

This code was written and carefully reviewed by hand, but **could not be fully build-tested** in the sandbox this was created in — `npx prisma generate` needs to download a query engine binary from `binaries.prisma.sh`, which that sandbox's network doesn't allow (same reason the frontend's Google Fonts build had to be worked around). On your own machine with normal internet access, this will not be an issue. Run the steps below and let me know immediately if anything errors — happy to fix it.

## Setup

```bash
npm install
cp .env.example .env
```

Edit `.env`:
- `DATABASE_URL` — point this at a real PostgreSQL database. Easiest options: install Postgres locally, or use a free hosted one (Supabase, Neon, Railway all have free tiers) and paste their connection string.
- Leave `JWT_SECRET` as-is for local dev, change it for anything real.

Then:

```bash
npx prisma generate
npx prisma migrate dev --name init
npx prisma db seed
```

- `generate` builds the typed database client from `prisma/schema.prisma`.
- `migrate dev` creates all the tables in your actual database.
- `db seed` loads the federal Nigerian public holidays for 2026 (see the caveat in `prisma/seed.ts` — the Eid dates are estimates that need confirming closer to the actual date, per the plan's note that this list needs ongoing admin maintenance, not just yearly).

Run it:

```bash
npm run start:dev
```

Server runs on **http://localhost:4001** (set by `PORT` in `.env`, which the frontend's `/api` proxy reads). Health check: `GET /health`.

Prefer not to install Postgres? `docker compose up --build` from the repo root starts this API plus a Postgres database and applies migrations automatically (see the root README's Deploying section).

## Tests

Unit tests run with Jest + ts-jest:

```bash
npm test            # or: npm run test:api   (from the repo root)
npm run test:watch
```

They target the places where a regression would be costly or silent — price resolution and the naira→kobo conversion (`pricing.spec.ts`), the password-reset flow including token expiry, single-use and email-enumeration safety (`auth.service.spec.ts`), and the mail sender's provider/no-provider paths (`mail.service.spec.ts`). No database or network is needed: Prisma, the mail provider and the token store are mocked. `tsconfig.build.json` keeps `*.spec.ts` out of the compiled `dist/`.

## Rate limiting

A global `ThrottlerGuard` (100 requests / minute / IP) covers every route. Auth tightens it further via `@Throttle` on `auth.controller.ts`: signup and login 5/min, `reset-password` 5/min, and `forgot-password` 3/min (it sends email). The Paystack `/payments/webhook` opts out with `@SkipThrottle()` so provider callbacks are never dropped.

## AI generation (optional)

Bulk logbook fill-up and chapter drafting call the Anthropic Messages API through `src/ai/llm.service.ts`. Configure these in `.env`:

- `ANTHROPIC_API_KEY` — enables the AI endpoints. Without it they return **503** and the UI buttons stay disabled.
- `AI_MODEL` — the Claude model id (default `claude-sonnet-4-5`). Change it if your account uses a different model; Anthropic returns a 400 for an unknown model.
- `AI_DEV_UNLOCK=true` — dev-only: treats every pass and the free trial as unlocked so paid paths can be tested without a payment flow. Never enable in production.

The free trial (`AI_TRIAL_DAYS = 7` in `logbook.service.ts`) drafts the first week of logbook entries; the rest unlock with a successful `IT_SIWES_PASS` purchase. Chapter 1 drafts free; Chapters 2–5 unlock with a `PROJECT_PASS` purchase.

## Password reset email (optional)

The "Forgot password?" flow (`POST /auth/forgot-password`, `POST /auth/reset-password`) emails a one-hour, single-use reset link. Only the SHA-256 digest of the token is stored, so a database leak can't hand out working links. Configure in `.env`:

- `RESEND_API_KEY` — enables real delivery via Resend's HTTP API. Without it the reset link is written to the **backend console** instead, so the flow still works locally.
- `MAIL_FROM` — the verified sender (Resend's default only delivers to your own address in test mode).
- `PASSWORD_RESET_DEV_MODE=true` — dev-only: when no mail provider is configured, also returns the link in the API response so the UI shows a clickable "Open your reset link". Never enable in production.

`forgot-password` always returns the same message whether or not the account exists, so it can't be used to discover registered emails. The `npm run reset:password` CLI still exists as an offline fallback.

## Email verification

Signing up sends a confirmation email (`/verify-email?token=...`); the link is a signed JWT with a `purpose: 'verify-email'` claim and a 24-hour expiry, so no extra table is needed — verification just flips `User.emailVerified`. The dashboard shows a resend banner until the address is confirmed. Like the reset flow, when no mail provider is configured the link is written to the backend console, and verification never blocks access (it's a nudge, not a gate). This adds one column (`emailVerified`); apply it with `npm run prisma:migrate` (migration `add_email_verification`).

## Payments (optional)

Pass purchases go through Paystack. Configure in `.env`:

- `PAYSTACK_SECRET_KEY` — from your Paystack dashboard. Without it the payment endpoints return **503**.
- `PAYSTACK_PUBLIC_KEY` — only needed if you later add inline checkout; the current flow redirects to Paystack's hosted page.
- `PAYSTACK_DEV_MODE=true` — dev-only: when no secret key is set, **Buy** grants the pass instantly so the gated features can be tested. Never enable in production.

Prices are read at call time from env (`pricing.ts`, in naira) so fees can be raised or lowered without code changes. Defaults: IT/SIWES Pass ₦10,000, Project Pass ₦20,000, Bundle ₦27,000 (10% off). Override with `PRICE_IT_SIWES_PASS_NAIRA`, `PRICE_PROJECT_PASS_NAIRA`, `PRICE_BUNDLE_NAIRA`; the live figures are exposed publicly at `GET /payments/prices` and the whole UI reads them. The naira amounts are converted to kobo only at the Paystack call and in the `amountKobo` column. A successful Bundle grants both passes (the gating checks accept either the individual pass or the bundle). The webhook is validated by an HMAC-SHA512 signature over the raw request body (`rawBody` is enabled in `main.ts`), and `/payments/verify/:reference` re-checks the transaction with Paystack once the student is redirected back.

## What's built

| Endpoint | What it does |
|---|---|
| `POST /auth/signup` | Create an account — `{ fullName, email, password }` |
| `POST /auth/login` | Returns a JWT — `{ email, password }` |
| `POST /auth/forgot-password` | Email a reset link — `{ email }`. Same response whether or not the account exists |
| `POST /auth/reset-password` | Set a new password from a reset token — `{ token, password }` |
| `POST /auth/verify-email` | Confirm an email address from the link token — `{ token }` |
| `POST /auth/resend-verification` | Re-send the verification link (auth required) |
| `GET /users/me` | Current user's profile + placement + projects (needs `Authorization: Bearer <token>`) |
| `PATCH /users/me` | Update fullName/school/department/moduleChoice |
| `POST /it-placement` | Set up (or edit) the IT placement — generates the full holiday-aware attendance calendar in one call |
| `GET /it-placement/me` | Fetch placement + generated calendar |
| `POST /it-placement/confirm-holidays` | The one gating question from the plan — pass the list of holiday dates the student actually worked; everything else gets marked not-attended |
| `GET /logbook` | List the logbook entries for the placement |
| `POST /logbook` | Create one entry — `{ date, activity, evidenceUrl? }` |
| `PATCH /logbook/:id` | Edit an entry — `{ activity?, evidenceUrl?, status? }` |
| `DELETE /logbook/:id` | Delete an entry (reopens that day) |
| `POST /logbook/bulk` | AI bulk fill-up from a free-text description — `{ description }` (first 7 days free) |
| `POST /projects` | Create a project — auto-creates all 5 chapters, Chapter 1 pre-marked free |
| `GET /projects` | List the student's projects |
| `GET /projects/:id` | One project + its chapters |
| `POST /projects/:id/chapters/:chapterNumber/draft` | AI-draft one chapter from `{ rawInputText }` (Chapter 1 free, the rest need the Project Pass) |
| `GET /projects/:id/references` | List the project's references |
| `POST /projects/:id/references` | Add a reference — `{ citationText, sourceType, doiOrIsbnOrLink? }` |
| `POST /projects/:id/references/:referenceId/verify` | Verify one reference (Crossref → DataCite → Open Library, else link-check) |
| `DELETE /projects/:id/references/:referenceId` | Remove a reference |
| `POST /projects/:id/mark-complete` | Student explicitly marks the project done (read-only from here) |
| `POST /projects/:id/reopen` | Free reopen for revisions, per the plan |
| `GET /payments/prices` | Current pass prices in naira (public) |
| `POST /payments/initialize` | Start a pass purchase — `{ productType }` → Paystack checkout URL (or an instant dev-mode grant) |
| `GET /payments/verify/:reference` | Verify a purchase after Paystack redirects the student back |
| `POST /payments/webhook` | Paystack server callback (HMAC-signed, public) |
| `GET /payments` | List the student's purchases |

## What's implemented from the plan, specifically

- **Holiday-aware calendar generation** (`it-placement.service.ts`): scans the whole placement duration day by day, keeps only days matching the attendance pattern, flags any that land on a federal holiday, and leaves those `confirmedAttended: null` until the student answers the single gating question via `confirm-holidays`.
- **Chapter 1 always free** (`projects.service.ts`): baked into project creation, not a runtime check that could drift.
- **Project completion/reopen**: matches the "read-only after complete, free reopen for revisions" design exactly.
- **Citation verification** (`reference-verifier.ts`): a DOI is looked up in Crossref, then DataCite; an ISBN in Open Library; a bare URL is only reachability-checked. Results are stored with a tier — `API_VERIFIED`, `LINK_CHECKED`, or `STUDENT_CONFIRMED` — so a citation is never silently marked verified.
- **Money stored in kobo** (`amountKobo` on `Purchase`) to avoid floating-point currency bugs.

## Report & PDF export

There is no report or PDF endpoint here — deliberately. The frontend assembles a printable SIWES report (`/dashboard/report`) from the placement, logbook and project data this API already serves, and exports the logbook, project chapters and report with the browser's **Print / Save as PDF**.

## Connecting the frontend

The frontend is wired to this API. The onboarding wizard calls `POST /auth/signup`, `PATCH /users/me`, `POST /it-placement` and `POST /projects`; the Account tab reads `GET /users/me`, saves the profile, module choice and IT placement, and starts pass purchases via `POST /payments/initialize`; the Project tab uses `GET /projects` plus `mark-complete`/`reopen` and the reference endpoints; the logbook page uses the logbook endpoints and the holiday-confirmation endpoint; and the Report tab reads `GET /it-placement/me`, `GET /logbook` and `GET /projects` to build the document. `lib/store.tsx` still keeps a localStorage draft/cache (the plan's offline-continuity design), but the server is the source of truth.
