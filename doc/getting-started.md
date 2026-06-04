# Getting started

This is the **doctor.id.bd** local dev setup guide. It assumes nothing beyond
a working Node toolchain and gets you from `git clone` to a running app with
real seed data in about 10 minutes.

If you're an LLM agent, also read [`/CLAUDE.md`](../CLAUDE.md) for the project
constraints and architectural decisions.

---

## TL;DR

```bash
# 1. Install deps
npm install

# 2. Set up env
cp .env.example .env.local
# → edit .env.local: at minimum set MONGO_URI and AUTH_SECRET

# 3. Bootstrap the database (admin + 36 specialties — no fake doctors)
npm run seed

# 4. (optional) Ingest real BD doctor profiles
npm run seed -- --source=popular-diagnostic --limit=50

# 5. Run the dev server
npm run dev
# → open http://localhost:3000
```

Admin login: `admin@doctor.id.bd` / `ChangeMe!2026` at `/auth/admin/login`.

---

## 1. Prerequisites

| Tool | Version | Why |
|---|---|---|
| Node.js | ≥ 20 | Next.js 16 requires modern Node |
| npm | ships with Node | We don't pin `pnpm` / `yarn` |
| Git | any | Source control |
| MongoDB | 7.x | Either Atlas (preferred) or local via Docker |

Optional but useful:
- **Docker Desktop** — for the local Mongo replica-set fallback
- **MongoDB Compass** — GUI for inspecting data
- A device that can receive SMS to claim seeded doctor profiles (we can fake this in dev — see §5).

---

## 2. Clone & install

```bash
git clone <your-fork-url> doctor-id
cd doctor-id
npm install
```

Installs everything pinned in `package.json` including `@react-pdf/renderer`,
`qrcode`, `leaflet`, `next@16.2.6`, etc. The first install pulls AWS SDKs
which are heavyweight — give it a minute.

---

## 3. Environment variables

Copy the template:

```bash
cp .env.example .env.local
```

### Required for dev to boot

| Var | What it is | Where to get it |
|---|---|---|
| `MONGO_URI` | Mongo connection string | Atlas cluster URI, or `mongodb://localhost:27017/doctor-id-dev` for local Docker |
| `AUTH_SECRET` | NextAuth JWT secret (≥16 chars) | `openssl rand -hex 32` |

### Optional — flows degrade gracefully when absent

| Var | What it unlocks | Without it |
|---|---|---|
| `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` + `AWS_PUBLIC_BUCKET_NAME` + `AWS_PRIVATE_BUCKET_NAME` | Server-side S3 uploads — profile/cover photos (public bucket) + **mandatory registration selfie** & verification docs (private bucket). | Profile photos fall back to Popular CDN URLs; **selfie/verification uploads fail**, so registration can't complete without the private bucket set (even in dev). See CLAUDE.md #17. |
| `SES_FROM_EMAIL` | Email-verification + password-reset mail goes out via AWS SES. | `sendEmail()` logs the email to the console — fine for verifying tokens manually. |
| `SSL_SMS_API_TOKEN` + `SSL_SMS_SID` (`SMS_PROVIDER=ssl`, default) | Real SMS via **SSL Wireless iSMS Plus v3** (login OTPs, registration OTPs, appointment notifications, outbound campaigns). **Live sends require the request IP to be whitelisted** in the SSL portal. MDL is a one-env fallback (`SMS_PROVIDER=mdl` + `MDL_SMS_*`). | `sendSms()` logs the SMS body + 6-digit OTP to the dev console. **You can complete a full registration / login flow this way.** |
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | Real rate-limiting on login, OTPs, appointment submissions, outbound. | Limiters return `{ success: true }` — fine for solo dev, never for prod. |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth on admin login. | Credentials-only login still works. |
| `ADMIN_EMAILS` | Comma-separated list of emails granted `role: 'admin'` at signup or seed-bootstrap. | The seed script defaults to `admin@doctor.id.bd`. |
| `NEXT_PUBLIC_APP_URL` | Used in absolute-URL contexts (OG image, claim links, QR codes in the Rx pad). | Defaults to `http://localhost:3000`. |

The env loader at [`src/lib/env.ts`](../src/lib/env.ts) validates each var
lazily — you'll see a clear error on first request if anything required is
malformed.

---

## 4. Mongo

Three options, pick what fits.

### A. Atlas (recommended)

Create a free M0 cluster at <https://www.mongodb.com/atlas>. Grab the
connection string from the "Connect" → "Drivers" panel and paste into
`MONGO_URI`. Allow `0.0.0.0/0` (or your IP) in Network Access for dev.

### B. Local Docker replica set

```bash
docker compose up -d mongo
```

Spins up a Mongo 7 replica set on `mongodb://localhost:27017`. The
[`docker-compose.yml`](../docker-compose.yml) bundled with the repo handles
the `rs0` init. Set:

```
MONGO_URI=mongodb://localhost:27017/doctor-id-dev?replicaSet=rs0
```

### C. Local install

If you already run Mongo directly, just point `MONGO_URI` at it. The app
doesn't require transactions, so a standalone (no replica set) Mongo works
fine — drop the `?replicaSet=...` query string.

Sanity check the connection:

```bash
curl http://localhost:3000/api/health
# → {"ok":true,"mongo":"connected"}
```

---

## 5. Seed the database

Two seed paths. **Both are idempotent — re-running is always safe** and
neither drops any collection.

### 5.1 Bootstrap seed (admin + 36 specialties)

```bash
npm run seed
```

Outputs:

```
→ Bootstrap mode (admin + specialty catalog)
  ✓ admin: admin@doctor.id.bd
  ✓ 36 specialties ready

✓ Seed complete:
┌───────────────────┬────────┐
│ (index)           │ Values │
├───────────────────┼────────┤
│ specialties       │ 36     │
│ activeSpecialties │ 36     │
│ admins            │ 1      │
│ doctors           │ 0      │
└───────────────────┴────────┘
  Admin login: admin@doctor.id.bd / ChangeMe!2026 at /auth/admin/login
```

What this does:

- **Upserts the admin user** at `admin@doctor.id.bd` (or the first email in
  `ADMIN_EMAILS`), with `role: "admin"` and `approved: true`. Password is
  set on insert only — re-runs never overwrite a rotated password.
- **Upserts 36 specialties** by slug (Cardiology, Gynecology, Pediatrics, …
  through Nutrition & Dietetics). Re-running flips `active: true` but never
  back to `false`, so a manually deactivated specialty stays off.
- **Does NOT create fake doctor profiles.** You need real data — see §5.2.
- **Does NOT touch the Doctor collection** at all.

Use `--dry-run` to preview without writing.

### 5.2 Real BD doctor data (Popular Diagnostic, 3,237 doctors)

Already downloaded to `data/popular-diagnostic/`. Ingest as unclaimed
profiles — slugs, photos, schedules, chambers, all real.

```bash
# Preview without writing
npm run seed -- --source=popular-diagnostic --limit=10 --dry-run

# Insert 100 doctors
npm run seed -- --source=popular-diagnostic --limit=100

# Full ingest (3,237 doctors) — takes ~10 min
npm run seed -- --source=popular-diagnostic
```

The pipeline is **idempotent**: re-runs match by `(sourceProvider, sourceProviderId)`
and **never overwrite a claimed profile**. If S3 isn't configured, photos
remain as `legacy-external` URLs pointing at Popular's CDN (which is
already whitelisted in [`next.config.ts`](../next.config.ts)).

Browse:

```
http://localhost:3000/search
http://localhost:3000/dr-m-nazrul-islam-cardiologist
```

---

## 6. Run the app

```bash
npm run dev
```

Visit:

| URL | Audience |
|---|---|
| `http://localhost:3000` | Public homepage |
| `http://localhost:3000/search` | Browse doctors |
| `http://localhost:3000/<slug>` | Public profile (e.g. `/dr-m-nazrul-islam-cardiologist`) |
| `http://localhost:3000/auth/login` | Doctor sign-in (phone + OTP) |
| `http://localhost:3000/auth/register` | Doctor registration (phone + OTP + BMDC) |
| `http://localhost:3000/auth/admin/login` | Admin sign-in (email + password) |
| `http://localhost:3000/admin` | Admin portal (login-gated) |
| `http://localhost:3000/dashboard` | Doctor portal (login-gated) |

---

## 7. End-to-end flows

### 7.1 Claim a Popular Diagnostic profile as a doctor

Without SMS credentials, the SMS gateway is a no-op: **the OTP is printed
to your `npm run dev` console**. Walk through it:

1. Open `http://localhost:3000/dr-m-nazrul-islam-cardiologist` (or any unclaimed Popular profile).
2. Click **"Claim this profile"** → lands on `/auth/register?slug=...`.
3. Fill BMDC# (any 4–7 digit number for dev), phone (use the seeded phone on the doctor's contact — visible in Compass), name, and **a live-camera selfie** (mandatory — needs the private S3 bucket configured, even in dev — see §3).
4. Submit → check the `npm run dev` terminal for the OTP:

   ```
   ─── [SSL SMS no-op] would have sent SMS ───
   To:        +8801711563450
   Body:      doctor.id.bd: Your verification code is 348127. ...
   ```

5. Enter the OTP on the page → registration completes. **You'll see a "pending admin approval" card**, not a dashboard.
6. Log in as the seed admin at `/auth/admin/login`. Open `/admin/verifications` — the new ClaimRequest appears with a 24-hour SLA chip.
7. Click **"Approve & unlock login"** — flips `User.approved: true` and `Doctor.bmdcVerified: true`.
8. In the doctor's browser, hit `/auth/login` and enter the same phone → OTP arrives in the console → enter it → land on `/dashboard?welcome=1`.

> **Two verification axes.** `/dashboard/verification` now shows two cards: **BMDC** (what
> you just approved — it's the one that unlocks login) and **Account verification** (a
> government photo ID + legal name, reviewed separately at `/admin/account-verifications`).
> The blue **"Verified"** tick appears only once *both* are approved; account approval does
> **not** affect login. See CLAUDE.md #20.

### 7.2 Test the prescription-pad PDF

After claiming, in the doctor dashboard click **Prescription pad** in the
sidebar. You'll see a preview iframe + Download button. The PDF includes the
doctor's photo, name, degrees, BMDC#, chambers, schedule, and a QR pointing
back to the public profile. `Doctor.flags.rxPadGenerations` increments per
download.

### 7.3 Test the appointment-request inbox

In an incognito window, open the doctor's public profile (now claimed). The
"Request appointment" form appears in the sidebar. Submit it. Back in the
doctor's dashboard, the **Requests** nav entry gains a red badge and the new
request shows up. Hit "WhatsApp reply" to deep-link to `wa.me/`.

### 7.4 Test the EMR seat handoff

After registration, the doctor's dashboard shows a "Your free Shafa EMR
account is being set up" banner. As admin, open `/admin/emr-queue`, paste an
email, click "Mark ready". The banner flips to "Check `<email>` for your EMR
login" on the doctor's next dashboard load.

### 7.5 Run a bulk-outbound campaign

Add SSL Wireless credentials (or stay in dev no-op mode), then:

```bash
# Dry-run a campaign — prints what would happen, writes nothing
npm run outbound -- \
  --campaign=2026-w22-rxpad \
  --template=en-claim-rx-pad \
  --cohort=district=Dhaka \
  --limit=20 \
  --dry-run

# Real run
npm run outbound -- \
  --campaign=2026-w22-rxpad \
  --template=en-claim-rx-pad \
  --cohort=district=Dhaka \
  --limit=20
```

Output funnel:

```
→ Skipped (no phone):     0
→ Skipped (opt-out):      0
→ Skipped (recently sent):0
→ Queued to send:         20
→ Body groups: 1 (shared body) · ~1 ssl call(s) · 1 segment/SMS (ASCII)
```

The script honors the active provider's per-call cap — SSL Wireless batches
**up to 100** numbers per `/send-sms/bulk` call (same body) and up to 100
personalized messages per `/send-sms/dynamic` call (MDL caps at 20). See
`/admin/outbound` for the post-send funnel + campaign claim rate.

---

## 8. Tests + typechecking

Run the full quality-gate before committing:

```bash
npm test           # Vitest (467 tests, DB-less, ~3s)
npm run typecheck  # tsc --noEmit
npm run build      # production build (~10s)
```

All three are pre-merge requirements. The Vitest setup uses jsdom by
default; server-only test files (e.g. anything calling `env()`) declare
`// @vitest-environment node` at the top.

---

## 9. Codebase tour

The repo follows the App Router. High-level map (full version in
[`CLAUDE.md`](../CLAUDE.md)):

| Path | Purpose |
|---|---|
| `src/app/(public)/` | Homepage, search, public doctor profiles |
| `src/app/(auth)/auth/` | Login + registration (doctor + admin variants) |
| `src/app/(dashboard)/dashboard/` | Doctor dashboard |
| `src/app/admin/` | Admin portal (AdminLTE-style shell) |
| `src/lib/db/models/` | Mongoose schemas — start here when changing data |
| `src/lib/utils/verification.ts` | Verification level + name-binding helpers; identity queue = `/admin/account-verifications`, model `IdentityVerificationRequest` (#20) |
| `src/lib/sms/client.ts` | SMS provider facade (`sendSms`/`sendSmsBatch`) — SSL Wireless + MDL |
| `src/lib/geo/bd-districts.ts` | 8 divisions + 64 districts (chamber dropdowns + canonicalize) |
| `src/lib/rx-pad/dto.ts` + `src/components/pdf/rx-pad.tsx` | Rx pad pipeline (A.2) |
| `src/lib/outbound/templates.ts` | SMS template registry |
| `src/server/actions/` | Every mutation goes through here |
| `scripts/seed.ts` + `scripts/outbound.ts` | Operational CLIs |
| `tests/` | Vitest suite |

The full architectural rationale lives in
[`.claude/plans/mvp-plan.md`](../.claude/plans/mvp-plan.md).

---

## 10. Common operations

### Create a new admin

The seed script auto-bootstraps `admin@doctor.id.bd` with role=admin. To
promote a different email, set `ADMIN_EMAILS=foo@example.com,bar@example.com`
in `.env.local` before running the seed. Or update the User directly in
Mongo (Compass: set `role: "admin"`, `approved: true`).

### Approve a pending doctor (BMDC + login)

Visit `/admin/verifications`. Each row shows the requester's phone/email +
attached documents + a 24h SLA countdown. Click **Approve & unlock login**.
That flips both `Doctor.bmdcVerified` and `User.approved` — the doctor can
then sign in via phone-OTP. **This BMDC queue is the only one that unlocks login.**

### Approve account / identity verification

Visit `/admin/account-verifications` (a separate queue). Review the government
photo ID + legal name, then click **Approve & grant verification** — this flips
`Doctor.nidVerified` and, combined with BMDC, grants the blue **"Verified"** tick.
It does **not** touch login. See CLAUDE.md #20.

### Mark an EMR seat ready

`/admin/emr-queue` → paste the EMR-side email → **Mark ready**. The doctor's
dashboard banner updates on next reload.

### Add a phone to the opt-out list

`/admin/outbound` → opt-out roster card → enter phone + reason →
**Add opt-out**. The next `npm run outbound` invocation skips that phone.

### Re-run the Popular Diagnostic ingestion

```bash
npm run seed -- --source=popular-diagnostic
```

Always safe to re-run. Existing rows are refreshed (except for claimed
profiles, which are immutable to seed). New rows are added.

### Show a doctor's contact details (hidden by default)

Phone and email are **hidden by default** on every profile (privacy-first). A
doctor reveals them by unchecking "Hide phone / email" in Dashboard → Profile →
Contact; an admin can do the same in `/admin/doctors/<slug>/edit`. The "Chat on
WhatsApp" appointment button is separately opt-in (`whatsappAppointmentEnabled`).
The public `/api/v1` endpoints honour these flags — hidden contact never leaks.
Chamber/clinic phone numbers stay public (facility lines, not personal contact).

### Edit chamber location (division + district)

Each chamber stores a **division** and a **district** (the canonical 64-district
key, renamed from the old `city`). Both are dropdowns in Dashboard → Chambers
(and the admin editor), sourced from
[`src/lib/geo/bd-districts.ts`](../src/lib/geo/bd-districts.ts); picking a
division filters the district list. Location search is `/search?district=` and
`/<specialty>/<district>`.

### Reset & reseed (pre-production)

This app is pre-production — adopt schema changes by dropping the DB and
reseeding rather than running migrations. New docs pick up the current schema on
insert: contact is **hidden by default** and chambers store `district` (from the
ingestion writers + schema defaults).

```bash
# drop the dev DB first (Compass, or mongosh: `use doctor-id-dev; db.dropDatabase()`)
npm run seed                         # admin + 36 specialties
npm run seed:unified                 # or: npm run seed -- --source=popular-diagnostic
```

---

## 11. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `Invalid server environment variables` on boot | Missing required env | Set `MONGO_URI` + `AUTH_SECRET` in `.env.local` |
| `env.ts: server env accessed from the browser` in a test | jsdom test calling server-only code | Add `// @vitest-environment node` to the test file |
| Photos broken on `/[slug]` | Image host not whitelisted | Check `next.config.ts:images.remotePatterns`. Popular CDN is already in the list. |
| `Cannot overwrite model once compiled` in dev | Old code shape on a model file | All models use `(models.X as Model<…>) ?? model("X", schema)` — make sure new models follow that pattern |
| OTP never arrives | SMS creds unset (expected in dev) | Check the `npm run dev` console — the OTP prints there. If SSL creds **are** set but no SMS arrives, confirm your egress IP is whitelisted in the SSL portal (the server logs `[ssl SMS] … failed: …`). |
| Claim succeeds but doctor can't log in | Admin approval gate (intentional); login is unlocked by the **BMDC** queue only | Approve at `/admin/verifications`. (Account/identity verification at `/admin/account-verifications` does **not** affect login.) |
| `npm test` failing on seed dependencies | jsdom can't load server modules | Use `// @vitest-environment node` for any test touching `env()` / Mongoose |

For deeper debugging, the progress log at
[`.claude/progress/mvp-progress.md`](../.claude/progress/mvp-progress.md)
documents every shipped change in chronological order.

---

## 12. Reading list for new devs

1. [`CLAUDE.md`](../CLAUDE.md) — what NOT to break + invariants
2. [`.claude/plans/60-days-product-rodemap.md`](../.claude/plans/60-days-product-rodemap.md) — product strategy (the 60-day claim-acquisition plan)
3. [`.claude/plans/mvp-plan.md`](../.claude/plans/mvp-plan.md) — architectural rationale
4. [`.claude/progress/60-days-sprint-a-tasks.md`](../.claude/progress/60-days-sprint-a-tasks.md) — Sprint A engineering breakdown (what shipped + why)
5. [`README.md`](../README.md) — the human-facing project overview

Welcome to the team. If something here doesn't match what you see in the
code, open an issue — this doc is the contract for new devs and we keep it
honest.
