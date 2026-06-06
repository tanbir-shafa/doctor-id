# doctor.id.bd

Bangladesh's verified doctor directory. A Next.js + MongoDB application — the
supply-side acquisition channel for **Shafa Care Ltd**'s EMR/HMS product.

Every doctor profile is a public SEO landing page; doctors share their
`doctor.id.bd/[slug]` URL on WhatsApp bios, prescription pads, and business
cards. The data model is FHIR-Practitioner-aligned so it can feed the future
EMR without a schema rewrite.

> Plan + progress log live in [`.claude/plans/mvp-plan.md`](.claude/plans/mvp-plan.md)
> and [`.claude/progress/mvp-progress.md`](.claude/progress/mvp-progress.md).

---

## Tech stack

| Concern | Choice |
|---|---|
| Framework | Next.js 16.2.6 (App Router, React 19, Turbopack) — **pinned exact** |
| Language | TypeScript (strict) |
| Database | MongoDB Atlas (M10+ prod, M0/dev cluster fine for staging) via Mongoose 9 |
| Auth | NextAuth v5 (Auth.js), JWT sessions — **doctors: phone + SMS OTP** (no password); admins: email + bcrypt password |
| Styling | Tailwind v4 + shadcn/ui primitives |
| Forms | React Hook Form + Zod (shared schemas client + server) |
| File upload | **Server-side S3** (`@aws-sdk/client-s3` + `s3-request-presigner` + `credential-providers`) — two buckets (public/private), creds by `NODE_ENV` |
| Email | AWS SES v2 (no-ops to console logging without credentials) |
| SMS | **SSL Wireless iSMS Plus v3** (default) + MDL fallback via `SMS_PROVIDER`; no-ops to console without creds |
| Shared state | Upstash Redis for rate-limiting (degrades to no-op without creds) |
| Maps | Leaflet + OpenStreetMap (no API key) |
| OG images | `next/og` (Satori) — 1200 × 630, day-long CDN cache |
| i18n | `next-intl` patterns, English-only catalog at launch |
| Tests | Vitest + Testing Library — 467 tests (DB-less) |
| Deployment | **AWS EC2** — `next start` under PM2, behind nginx (TLS + reverse proxy). Multi-stage Docker image also provided. |

---

## Local development

### Prerequisites
- Node 20+ (Node 22 LTS recommended)
- npm 10+
- MongoDB connection — either an Atlas cluster URI or `docker compose up -d mongo`

### Setup
```bash
git clone <repo> doctor-id && cd doctor-id
cp .env.example .env.local
# Edit .env.local — at minimum, set MONGO_URI and AUTH_SECRET
npm install
npm run seed         # bootstraps admin + 36 specialties (idempotent, no fake doctors)
npm run dev
open http://localhost:3000
```

### Seed credentials
The seed script creates an admin user:

| Email | Password |
|---|---|
| `admin@doctor.id.bd` (or the first entry in `ADMIN_EMAILS`) | `ChangeMe!2026` |

**Rotate this password before exposing the staging environment.** The
`MONGO_URI` shipped in `.env.local` is a dev Atlas cluster; rotate it before
sharing the repo with collaborators.

---

## Environment variables

`.env.example` lists every required key. Behaviour when a key is absent:

| Key | Required | When absent |
|---|---|---|
| `MONGO_URI` | yes | boot fails at first DB call |
| `AUTH_SECRET` | yes | boot fails (NextAuth refuses to issue tokens) |
| `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` | for prod | S3 uploads return a friendly error; SES sends become `console.log` |
| `SES_FROM_EMAIL` | for prod | falls back to `no-reply@doctor.id.bd` |
| `SSL_SMS_API_TOKEN` + `SSL_SMS_SID` (`SMS_PROVIDER=ssl`) | for prod SMS | OTP + campaign SMS print to the dev console (no-op) instead of dispatching. **The request IP must be whitelisted** in the SSL portal for live sends. |
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | for prod | rate limiters allow every request (dev-friendly, prod-unsafe) |
| `AUTH_GOOGLE_ID` + `AUTH_GOOGLE_SECRET` | optional | Google sign-in button is hidden; credentials sign-in still works |

---

## Available scripts

| Script | What it does |
|---|---|
| `npm run dev` | Next dev server with Turbopack |
| `npm run build` | Production build with `output: 'standalone'` |
| `npm start` | Run the production build |
| `npm run seed` | Bootstrap: upsert admin + 36-specialty catalog. Idempotent — no drops, no fake doctors. |
| `npm run seed -- --source=popular-diagnostic [--limit=N] [--dry-run]` | Ingest the Popular Diagnostic JSON dump at `data/popular-diagnostic/` as unclaimed profiles. Idempotent (no drops). |
| `npm run outbound -- --campaign=<id> --template=<id> [--cohort=district=Dhaka,...] [--dry-run]` | Bulk SMS acquisition campaign via the active `SMS_PROVIDER`. |
| `npm test` | Run the Vitest suite (no DB required) |
| `npm run test:watch` | Vitest watch mode |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run format` | Prettier (writes) |

---

## Project structure (high level)

```
src/
  app/
    (public)/        # public pages: homepage, /[slug], /search, /[specialty]/[district]
    (auth)/          # /auth/login, /register, /verify-email, /forgot-password, /reset-password
    (dashboard)/     # /dashboard/* (auth-gated)
    admin/           # /admin/* (role-gated)
    api/v1/          # public REST API, FHIR-shaped doctor endpoints
    api/og/[slug]/   # dynamic OG image (1200×630)
    api/health/      # health probe (Mongo ping)
    sitemap.ts       # dynamic XML sitemap
    robots.ts
  components/
    ui/              # shadcn primitives (Button, Card, Input, Label)
    profile/         # ProfileHeader, ChamberCard, ShareButton, etc.
    search/          # DoctorCard, Pagination, SpecialtyListing
    map/             # LeafletMap (client-only) + LeafletLazy (boundary)
    layout/          # SiteHeader, SiteFooter, DashboardNav
  lib/
    db/              # mongoose connection + models + queries
    auth/            # NextAuth config (node + edge variants)
    s3/              # server-side S3 service (two-bucket, creds by NODE_ENV)
    email/           # SES + templates
    sms/             # SMS provider facade (SSL Wireless + MDL) — sendSms/sendSmsBatch
    redis/           # Upstash client + ratelimit factories
    fhir/            # FHIR Practitioner mapper (the EMR integration seam)
    seo/             # JSON-LD + Metadata builders
    geo/             # bd-districts.ts (8 divisions, 64 districts + canonicalize)
    utils/           # cn, slug, bmdc, sanitize, completeness
    validators/      # Zod schemas (one per profile section)
  server/actions/    # Server Actions (every mutation routes through here)
  types/             # TypeScript types
  proxy.ts           # auth proxy (formerly middleware; Next 16 rename)
scripts/
  seed.ts            # idempotent seed (refuses to run in production)
  seed-unified.ts    # seed the unified dataset into Doctor
  outbound.ts        # bulk SMS campaign dispatcher
tests/               # Vitest
```

---

## Architecture notes

### FHIR Practitioner alignment
`lib/fhir/practitioner.ts` is the **single seam** between our internal schema
and FHIR R4 Practitioner. Anything that exports to an EMR — `/api/v1` consumers
today, Shafa's HMS later — goes through this mapper. BD-specific fields
(WhatsApp, verification level (BMDC + identity), isClaimed) live on
`Practitioner.extension` entries under `https://doctor.id.bd/fhir/`. Specialty
codes are SNOMED CT where one exists.

### Multi-tenant readiness
Every Doctor doc carries `ownerType: 'doctor' | 'clinic'` and `ownerId` from
day one, even though MVP only writes `'doctor'`. Server Actions authorize via
`ownerId`, so clinic-group support can be added later without a migration.

### Edge-safe proxy
The auth proxy (`src/proxy.ts`) uses a slim `edge-config.ts` that has no DB or
bcrypt imports — Mongoose and `bcryptjs` cannot run in the Vercel/Next edge
runtime. The full NextAuth config (with the Credentials provider) lives in
`lib/auth/config.ts` and is used from Node-runtime routes only.

### Server Action pattern
Every mutation flows through a Server Action that does, in order:
1. `await auth()` — fetch the session
2. `Zod.safeParse` — re-validate input server-side (never trust the client schema)
3. ownership check (`ownerId === session.user.id`) for resource mutations
4. Upstash rate-limit where relevant
5. `revalidatePath` of the affected public URL

### View counter de-dup
`recordProfileViewAction` hashes `IP + daily salt` (SHA-256, truncated 16 chars)
so repeat visits from the same IP within a day only count once — no PII stored.

### Mongo `$text` ceiling
`$text` search is the right tool up to ~50k profiles. Beyond that, swap the
`searchDoctors` query helper for Atlas Search. It's the single seam — only
that file changes.

### SMS provider facade
`sendSms` / `sendSmsBatch` (`lib/sms/client.ts`) are a stable facade; the wire
protocol lives behind `SMS_PROVIDER` (`ssl` default — SSL Wireless iSMS Plus v3;
`mdl` fallback). The facade owns Unicode detection, segment estimation, the dev
no-op, and body-grouping; providers own only the HTTP. Bulk campaigns use SSL's
`/send-sms/bulk` (same body) + `/send-sms/dynamic` (personalized), ≤100 per call.
**The request IP must be whitelisted** in the SSL portal for live sends.

### Contact is private by default
`privacyHidePhone` / `privacyHideEmail` default to **hidden**; the public phone,
email, and WhatsApp number show only when a doctor opts in. A separate
`whatsappAppointmentEnabled` flag (opt-in) gates the "Chat on WhatsApp"
appointment button. All three are enforced at the profile page **and** the FHIR
mapper, so the public `/api/v1` endpoints never leak hidden contact.

### Chamber location = district
Each chamber stores `division` + `district` (the canonical 64-district key,
renamed from `city`), edited via cascading dropdowns sourced from
`lib/geo/bd-districts.ts`. Location search is `/search?district=` and
`/[specialty]/[district]`.

### Verification: two axes + the blue tick
A profile carries two independent verifications: **BMDC** (professional registration →
`bmdcVerified`; its admin approval also unlocks doctor sign-in) and **account/identity**
(government photo ID + legal name → `nidVerified`). `verificationLevel` is derived via
`computeVerificationLevel(bmdc, nid)`, and the blue **"Verified"** tick requires **both** —
partial states show a lesser chip. Each axis is reviewed in its own admin queue
(`/admin/verifications`, `/admin/account-verifications`). Account approval binds the profile
name to the ID's legal name and locks the display name to "prefix first last"; editing
first/last later **revokes** identity verification. On the public profile the badge is
click-to-explain (a popover breaks down what's verified). See CLAUDE.md #20.

---

## Deploying to AWS EC2 (PM2 + nginx)

The app runs as a long-lived Node process managed by **PM2**, behind **nginx**
(TLS termination + reverse proxy), on a single EC2 instance. Redis stays on
**Upstash over its REST API** — that runs fine on a long-running server, and
`@upstash/ratelimit` requires it (no TCP/`ioredis` client needed).

This section assumes you have:
- an **EC2 instance** (Amazon Linux 2023 or Ubuntu 22.04+, **≥ 2 GB RAM** — sharp
  + the image optimizer are memory-hungry) with an **Elastic IP**
- an **IAM instance profile** attached, so the production cross-account S3/SES
  role is assumed with no static keys (see `AWS_ASSUME_ROLE_ARN`, CLAUDE.md #17)
- two S3 buckets (public + private), a MongoDB Atlas URI, an Upstash Redis
  **REST** URL + token, and a verified SES sender (or a pending sandbox request)
- DNS for `doctor.id.bd` pointed at the Elastic IP

### 1. Install the runtime

```bash
# Node 22 LTS via NodeSource (Amazon Linux / RHEL shown; on Ubuntu use the apt variant)
curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
sudo dnf install -y nodejs gcc-c++ make nginx     # Ubuntu: apt-get install -y nodejs build-essential nginx
sudo npm install -g pm2
```

### 2. Build the app

```bash
git clone <repo> /var/www/doctor-id && cd /var/www/doctor-id
npm ci                       # resolves the glibc @img/sharp-linux-* binary on THIS host
npm run build
```

Put production secrets in **`.env.production.local`** (gitignored; `next start`
loads it automatically at boot). At minimum: `MONGO_URI`, `AUTH_SECRET`,
`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `AWS_REGION`,
`AWS_ASSUME_ROLE_ARN`, `AWS_PUBLIC_BUCKET_NAME`, `AWS_PRIVATE_BUCKET_NAME`,
`SES_FROM_ADDRESS`, `SSL_SMS_API_TOKEN`, `SSL_SMS_SID`, `NEXT_PUBLIC_APP_URL`,
`TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. See `.env.example`.

### 3. Run under PM2

```bash
pm2 start ecosystem.config.cjs     # → next start -H 127.0.0.1 -p 3000 (localhost only!)
pm2 save                           # snapshot the process list
pm2 startup                        # prints a systemd command to relaunch on boot — run it
```

`ecosystem.config.cjs` hard-codes `-H 127.0.0.1` so the app is reachable **only**
through nginx. Never bind it to `0.0.0.0` — a directly-reachable port lets a
client forge `X-Real-IP` and bypass the per-IP rate limits (see
[`doc/getting-started.md`](doc/getting-started.md) §11.5 and CLAUDE.md #21).

Redeploy: `git pull && npm ci && npm run build && pm2 reload doctor-id`.

### 4. nginx (TLS + reverse proxy)

Full config + rationale in [`doc/getting-started.md`](doc/getting-started.md)
§11.5. The essentials:

```nginx
server {
  listen 443 ssl;
  server_name doctor.id.bd;
  # ssl_certificate / ssl_certificate_key — issue with: sudo certbot --nginx -d doctor.id.bd

  client_max_body_size 12m;       # match next.config serverActions.bodySizeLimit (photo uploads)

  location / {
    proxy_pass         http://127.0.0.1:3000;
    proxy_set_header   Host              $host;
    proxy_set_header   X-Real-IP         $remote_addr;        # the trusted client IP
    proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
  }
}
# Also add a :80 server block that 301-redirects to https.
```

Set **`TRUSTED_PROXY_HOPS=1`** (just nginx; bump it if you later add Cloudflare or
an LB in front). `/api/health` returns `{"status":"ok"}` for an uptime monitor.

### 5. Security group

Inbound: **80 + 443 only** (plus 22 from your admin IP). Port 3000 must **not**
be open — the app binds to localhost.

### SES sandbox heads-up
New SES accounts are sandboxed: only verified recipients receive mail. File a
production-access request (typically reviewed in ~24h). Until granted, register
+ verify-email + reset flows work only for addresses you've explicitly added in
the SES console.

### Atlas hardening
- Enable **IP access list**: the EC2 instance's **Elastic IP** only, or use AWS
  PrivateLink for private connectivity
- Rotate the `db-production-user` credentials before launch
- Enable backup snapshots (built-in on Atlas M10+)

---

## Known limitations / v2 backlog

- **Image cropper**: `react-easy-crop` is installed but not yet wired into
  `PhotoUploader` — uploads happen at the file's natural dimensions for now.
- **Verification is manual**: both the BMDC certificate and the account/identity
  Gov-ID review are done by an admin — there's no public BMDC or NID API. Automation
  is a v2 candidate once an API or scraping partnership is in place.
- **Search**: Mongo `$text` index serves us up to ~50k profiles; swap to
  Atlas Search past that.
- **Reviews & ratings**: out-of-scope until legal review.
- **Mobile app**: Flutter app is on the v2+ roadmap.
- **Patient portal**: out-of-scope.
- **i18n UI**: `next-intl` patterns are in place but only English is shipped.

See [`.claude/progress/mvp-progress.md`](.claude/progress/mvp-progress.md) for
the live status of each MVP work-item.

---

## License

Proprietary © Shafa Care Ltd.
