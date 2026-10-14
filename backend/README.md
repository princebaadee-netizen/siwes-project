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

They target the places where a regression would be costly or silent — price resolution and the naira→kobo conversion (`pricing.spec.ts`), the password-reset flow including token expiry, single-use and email-enumeration safety (`auth.service.spec.ts`), the mail sender's provider/no-provider paths (`mail.service.spec.ts`), the AI token→cost model (`token-cost.spec.ts`), and the usage summary's aggregation and limit clamping (`usage.service.spec.ts`). No database or network is needed: Prisma, the mail provider and the token store are mocked. `tsconfig.build.json` keeps `*.spec.ts` out of the compiled `dist/`.

## Rate limiting

A global `ThrottlerGuard` (100 requests / minute / IP) covers every route. Auth tightens it further via `@Throttle` on `auth.controller.ts`: signup and login 5/min, `reset-password` 5/min, and `forgot-password` 3/min (it sends email). The AI-backed routes carry their own tighter caps because each call costs money — `POST /logbook/bulk` and both chapter draft/regenerate routes are 10/min, `POST /logbook/polish` is 20/min. The Paystack `/payments/webhook` opts out with `@SkipThrottle()` so provider callbacks are never dropped.

The global guard keys on IP, which is unfair on a shared campus/office NAT. So the AI routes add a second, route-level `AiThrottlerGuard` (`src/common/ai-throttler.guard.ts`) that tracks by `request.userId`. It is applied with `@UseGuards(AiThrottlerGuard)` on the methods — route guards run after the controller-level `JwtAuthGuard`, so the user id is set — and the two compose: a request must pass both the per-IP and per-account limit.

By default the counters live in the process's memory, which is fine for a single instance. Set `REDIS_URL` to store them in Redis instead so the limits hold across every API instance behind a load balancer (`src/common/redis-throttler.module.ts`; falls back to in-memory when unset).

## AI generation (optional)

Bulk logbook fill-up, single-day polish and chapter drafting call Groq's OpenAI-compatible Chat Completions API through `src/ai/llm.service.ts`. Groq's free tier needs no credit card and costs nothing to run — get a key at https://console.groq.com/keys. Configure these in `.env`:

- `GROQ_API_KEY` — enables the AI endpoints. Without it they return **503** and the UI buttons stay disabled.
- `AI_MODEL` — the Groq model id (default `openai/gpt-oss-120b`, served on the free tier). Change it to any id from the Groq model catalogue; Groq returns a 400 for an unknown model.
- `AI_MAX_REGENERATIONS` — how many times a chapter may be regenerated (each pass is a fresh AI call). Defaults to 3.
- `AI_INPUT_PRICE_KOBO_PER_MTOK` / `AI_OUTPUT_PRICE_KOBO_PER_MTOK` — kobo per million input/output tokens, used to estimate the cost recorded on each `GenerationLog` (see `src/ai/token-cost.ts`). They default to **0** because the free tier is free; set them to the model's rates if you move to a paid plan.
- `AI_DEV_UNLOCK=true` — dev-only: treats every pass and the free trial as unlocked so paid paths can be tested without a payment flow. Never enable in production.

The free trial (`AI_TRIAL_DAYS = 7` in `logbook.service.ts`) covers the first week of logbook entries — the first 7 confirmed attendance days — shared by bulk fill-up and single-day polish, and it is spent only once (`ITPlacement.trialWeekUsed`) so deleting entries can't re-farm it; the rest unlock with a successful `IT_SIWES_PASS` purchase. Chapter 1 drafts free; Chapters 2–5 unlock with a `PROJECT_PASS` purchase. `POST /logbook/polish` only returns the polished text — the student saves it, and that save records the entry's `source` (`AI_SINGLE_DAY`).

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
| `GET /it-placement/me` | Fetch placement + generated calendar, plus a `trial` summary (`total`/`used`/`remaining`/`spent`) for the free AI week |
| `POST /it-placement/confirm-holidays` | The one gating question from the plan — pass the list of holiday dates the student actually worked; everything else gets marked not-attended |
| `GET /logbook` | List the logbook entries for the placement |
| `POST /logbook` | Create one entry — `{ date, activity, evidenceUrl? }` |
| `PATCH /logbook/:id` | Edit an entry — `{ activity?, evidenceUrl?, status? }` |
| `DELETE /logbook/:id` | Delete an entry (reopens that day) |
| `POST /logbook/bulk` | AI bulk fill-up from a free-text description — `{ description }` (first 7 days free) |
| `POST /logbook/polish` | AI single-day polish — `{ date, notes }` → `{ activity }` (preview only; the client saves it). First 7 attendance days free |
| `GET /topics` | The topic bank — public catalogue, filter by `?field=` and search with `?q=` |
| `GET /topics/fields` | The distinct fields in the topic bank (public) |
| `GET /admin/topics` | Admin-only: list the topic bank (same field/search filters) |
| `POST /admin/topics` | Admin-only: add a topic — `{ title, field, description? }` |
| `PATCH /admin/topics/:id` | Admin-only: edit a topic (only provided fields change) |
| `DELETE /admin/topics/:id` | Admin-only: remove a topic (projects keep their own copy of the title) |
| `POST /projects` | Create a project — auto-creates all 5 chapters, Chapter 1 pre-marked free. Accepts `topicSource` (`MANUAL`/`BANK`/`AI_SUGGESTED`) |
| `POST /projects/suggest-topics` | AI-suggest up to 5 project topics from `{ field?, interests? }` → `{ field, topics }` (falls back to the student's department; per-account rate-limited) |
| `GET /projects` | List the student's projects |
| `GET /projects/:id` | One project + its chapters |
| `POST /projects/:id/chapters/:chapterNumber/draft` | AI-draft one chapter from `{ rawInputText }` (Chapter 1 free, the rest need the Project Pass) |
| `POST /projects/:id/chapters/:chapterNumber/regenerate` | Re-draft a chapter — `{ rawInputText? }` (falls back to the stored notes). Bounded by `AI_MAX_REGENERATIONS` |
| `GET /projects/:id/references` | List the project's references |
| `POST /projects/:id/references` | Add a reference — `{ citationText, sourceType, doiOrIsbnOrLink? }` |
| `POST /projects/:id/references/:referenceId/verify` | Verify one reference (Crossref → DataCite → Open Library, else link-check) |
| `DELETE /projects/:id/references/:referenceId` | Remove a reference |
| `POST /projects/:id/mark-complete` | Student explicitly marks the project done (read-only from here) |
| `GET /usage` | The caller's own AI usage — totals, a per-`GenerationType` breakdown and recent generations, all with estimated token counts and cost in kobo. `?limit=` caps the recent list (default 20, max 100) |
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
- **Topic bank** (`topics.service.ts`): a seeded, admin-maintained catalogue of project topics (`ProjectTopic`) that students can browse by field and pick from instead of inventing one. `create-project` records the `topicSource` so a topic's origin is never ambiguous. A student can also ask the AI for tailored suggestions (`projects.service.ts#suggestTopics`), recorded under the `TOPIC_SUGGESTION` generation type.
- **Admin topic management** (`topics-admin.controller.ts`): the CRUD routes above sit behind `JwtAuthGuard` + `AdminGuard` (`src/auth/admin.guard.ts`). Admins are chosen by the comma-separated `ADMIN_EMAILS` env allowlist rather than a role column — an admin signs in like anyone else, and the client learns they're an admin from `isAdmin` on `GET /users/me` (purely showing the UI; the guard is the real enforcement). An unset allowlist switches the admin API off entirely.
- **Admin paywall bypass**: admin accounts also skip the paid gates so the paid AI flows can be exercised without a purchase — `logbook.service.ts#hasPass` and `projects.service.ts#hasPass` treat an `ADMIN_EMAILS` user as owning both passes, and `regenerateChapter` ignores the per-chapter regeneration cap for them. This is independent of `AI_DEV_UNLOCK` (which unlocks *every* account and is dev-only); the bypass is per-admin, so real students still pay. The frontend mirrors it, folding `isAdmin` into the "owned passes" state on the Account, Logbook and Project pages.

## Report & PDF export

There is no report or PDF endpoint here — deliberately. The frontend assembles a printable SIWES report (`/dashboard/report`) from the placement, logbook and project data this API already serves, and exports the logbook, project chapters and report with the browser's **Print / Save as PDF**.

## Connecting the frontend

The frontend is wired to this API. The onboarding wizard calls `POST /auth/signup`, `PATCH /users/me`, `POST /it-placement` and `POST /projects`; the Account tab reads `GET /users/me`, saves the profile, module choice and IT placement, and starts pass purchases via `POST /payments/initialize`; the Project tab uses `GET /projects` plus `mark-complete`/`reopen` and the reference endpoints; the logbook page uses the logbook endpoints and the holiday-confirmation endpoint; and the Report tab reads `GET /it-placement/me`, `GET /logbook` and `GET /projects` to build the document. `lib/store.tsx` still keeps a localStorage draft/cache (the plan's offline-continuity design), but the server is the source of truth.
