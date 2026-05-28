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
| Auth | NextAuth v5 (Auth.js) — Credentials + Google OAuth, JWT sessions, bcrypt cost 12 |
| Styling | Tailwind v4 + shadcn/ui primitives |
| Forms | React Hook Form + Zod (shared schemas client + server) |
| File upload | S3 presigned PUT URLs via `@aws-sdk/client-s3` |
| Email | AWS SES v2 (no-ops to console logging without credentials) |
| Shared state | Upstash Redis for rate-limiting (degrades to no-op without creds) |
| Maps | Leaflet + OpenStreetMap (no API key) |
| OG images | `next/og` (Satori) — 1200 × 630, day-long CDN cache |
| i18n | `next-intl` patterns, English-only catalog at launch |
| Tests | Vitest + Testing Library — 26 tests at last count |
| Deployment | Docker (multi-stage standalone) → AWS ECS Fargate behind ALB |

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
npm run seed         # populates 20 specialties + 50 BD doctors + 1 admin
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
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | for prod | rate limiters allow every request (dev-friendly, prod-unsafe) |
| `AUTH_GOOGLE_ID` + `AUTH_GOOGLE_SECRET` | optional | Google sign-in button is hidden; credentials sign-in still works |

---

## Available scripts

| Script | What it does |
|---|---|
| `npm run dev` | Next dev server with Turbopack |
| `npm run build` | Production build with `output: 'standalone'` |
| `npm start` | Run the production build |
| `npm run seed` | Wipe + reseed the database (20 specialties, 50 BD doctors, 1 admin) |
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
    (public)/        # public pages: homepage, /[slug], /search, /[specialty][/[city]]
    (auth)/          # /auth/login, /register, /verify-email, /forgot-password, /reset-password
    (dashboard)/     # /dashboard/* (auth-gated)
    admin/           # /admin/* (role-gated)
    api/v1/          # public REST API, FHIR-shaped doctor endpoints
    api/og/[slug]/   # dynamic OG image (1200×630)
    api/health/      # ECS healthcheck
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
    s3/              # presign helpers
    email/           # SES + templates
    redis/           # Upstash client + ratelimit factories
    fhir/            # FHIR Practitioner mapper (the EMR integration seam)
    seo/             # JSON-LD + Metadata builders
    utils/           # cn, slug, bmdc, sanitize, completeness
    validators/      # Zod schemas (one per profile section)
  server/actions/    # Server Actions (every mutation routes through here)
  types/             # TypeScript types
  proxy.ts           # auth proxy (formerly middleware; Next 16 rename)
scripts/
  seed.ts            # idempotent seed (refuses to run in production)
tests/               # Vitest
```

---

## Architecture notes

### FHIR Practitioner alignment
`lib/fhir/practitioner.ts` is the **single seam** between our internal schema
and FHIR R4 Practitioner. Anything that exports to an EMR — `/api/v1` consumers
today, Shafa's HMS later — goes through this mapper. BD-specific fields
(WhatsApp, BMDC verification level, isClaimed) live on
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

---

## Deploying to AWS ECS

This section assumes you already have:
- an AWS account with IAM permissions to create ECS, ECR, ALB, IAM, and SES
- an MongoDB Atlas cluster (M10+ recommended for prod) and its URI
- an Upstash Redis instance and its REST URL + token
- a verified SES sender domain *or* the patience to file a sandbox-removal request

### One-time setup

1. **Create the S3 upload bucket** with public-read disabled, CORS allowing PUT
   from the app's origin, and a bucket policy that lets the app's IAM role
   write under any prefix.

2. **Push to ECR**
   ```bash
   aws ecr create-repository --repository-name doctor-id
   docker build -t doctor-id .
   docker tag doctor-id:latest $AWS_ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/doctor-id:latest
   aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com
   docker push $AWS_ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/doctor-id:latest
   ```

3. **Task definition** — minimum:
   - 0.5 vCPU / 1 GB memory (homepage + profile page peak under this)
   - Port mapping 3000 → 3000
   - Healthcheck command: `[ "CMD-SHELL", "wget -q -O- http://127.0.0.1:3000/api/health | grep -q '\"status\":\"ok\"'" ]`
   - Env vars from Secrets Manager: `MONGO_URI`, `AUTH_SECRET`, `AWS_*` (via task IAM role; the explicit access-key env vars are only required for local Docker), `UPSTASH_*`, `SES_FROM_EMAIL`
   - Task role with `s3:PutObject`/`GetObject` on the upload bucket and `ses:SendEmail`

4. **ALB → ECS service**
   - HTTPS listener on 443 (ACM cert for `doctor.id.bd`)
   - HTTP → HTTPS redirect on 80
   - Target group health check: `/api/health`, expects 200, deregistration delay 30s
   - Min 2 tasks for HA; auto-scale on `CPUUtilization > 60%`

5. **DNS** — Route 53 alias from `doctor.id.bd` → the ALB.

### SES sandbox heads-up
New SES accounts are sandboxed: only verified recipients receive mail. File a
production-access request (typically reviewed in ~24h). Until granted, register
+ verify-email + reset flows work only for addresses you've explicitly added in
the SES console.

### Atlas hardening
- Enable **IP access list**: ECS task NAT egress IP only, or use AWS PrivateLink
  for private connectivity
- Rotate the `db-production-user` credentials before launch
- Enable backup snapshots (built-in on Atlas M10+)

---

## Known limitations / v2 backlog

- **Chambers editor**: dashboard chambers view is read-only in MVP. Adding/editing
  chambers (with the Leaflet location picker + day/time schedule grid) ships in v2.
- **Image cropper**: `react-easy-crop` is installed but not yet wired into
  `PhotoUploader` — uploads happen at the file's natural dimensions for now.
- **BMDC verification is manual**: there's no public BMDC API. Admin reviews
  uploaded certificates. Automation is a v2 candidate once an API or scraping
  partnership is in place.
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
