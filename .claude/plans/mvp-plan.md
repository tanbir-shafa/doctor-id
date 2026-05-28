# doctor.id.bd — MVP Build Plan

> **Progress tracker:** [../progress/mvp-progress.md](../progress/mvp-progress.md)
> **Status:** approved 2026-05-28

## Context

Greenfield Next.js application for **doctor.id.bd**, the supply-side acquisition channel for Shafa Care Ltd's EMR/HMS product. Public-facing professional profile platform for Bangladeshi doctors — LinkedIn-style but specialized for medical professionals, with FHIR-aligned data so it can feed the future EMR without a rewrite.

The product's marketing channel **is** the profile page itself: doctors will paste their `doctor.id.bd/[slug]` URL into WhatsApp bios, prescription pads, and business cards. Every profile is therefore an SEO landing page. SSR correctness, schema.org tagging, and OG images matter more than dashboard polish.

Working directory is empty — full scaffold from scratch.

## Plan & Progress Artifacts (in-repo)

Before any code is written, **Step 0** of implementation creates two cross-linked files inside the repo so progress is trackable from the project itself (not just this global plan file):

- `/.claude/plans/mvp-plan.md` — verbatim copy of this plan, committed to the repo. Links to the progress file at the top.
- `/.claude/progress/mvp-progress.md` — task list mirroring the 10-step build sequence, each task with `status: not-started | in-progress | blocked | done`, `started`, `completed`, and `notes`. Links back to the plan file.

Every subsequent commit that finishes a task updates `mvp-progress.md` in the same commit. The plan file is updated only when scope or architecture changes (with a dated changelog entry at the bottom).

`mvp-progress.md` skeleton:

```markdown
# doctor.id.bd MVP — Progress

Plan: [./../plans/mvp-plan.md](../plans/mvp-plan.md)
Last updated: <ISO date>

| # | Task | Status | Started | Completed | Notes |
|---|---|---|---|---|---|
| 0 | Plan + progress artifacts checked in | not-started | | | |
| 1 | Scaffold (Next.js pinned, Tailwind, shadcn, Vitest, Mongo conn) | not-started | | | |
| 2 | Models + seed script (20 specialties, 50 BD doctors, 1 admin) | not-started | | | |
| 3 | Auth (NextAuth v5, SES verify, Upstash login rate-limit) | not-started | | | |
| 4 | Public profile `/[slug]` — SSR, JSON-LD, OG, share/QR | not-started | | | |
| 5 | Search + category pages + sitemap + robots | not-started | | | |
| 6 | Doctor dashboard (profile editor, chambers, settings) | not-started | | | |
| 7 | S3 photo + cover upload (presign + crop) | not-started | | | |
| 8 | Verification flow + admin panel | not-started | | | |
| 9 | Analytics + `/api/v1/*` (FHIR-shaped, rate-limited) | not-started | | | |
| 10 | Polish (a11y, Lighthouse, Dockerfile, README, ECS notes) | not-started | | | |
```

## Locked Architectural Decisions

| Concern | Choice | Notes |
|---|---|---|
| Framework | Next.js latest stable, **pinned exact** (no `^`/`~`), App Router, TS, RSC default | Use the React version Next ships with |
| Database (prod) | **MongoDB Atlas** | M10+ recommended for prod; M0 fine for dev. Keeps `$text` indexes + future Atlas Search path open |
| Database (dev) | **Atlas dev cluster (already provisioned)** | URI provided by user — written into `.env.local` for dev, into `.env.example` as a placeholder. `docker-compose.yml` still ships a local Mongo 7 replica-set service as a fallback for offline work |
| Auth | NextAuth.js v5 (Auth.js), Credentials + Google OAuth | bcrypt cost 12, server-side Zod on every action |
| Styling | Tailwind + shadcn/ui | shadcn copied in, not a dependency |
| Forms | React Hook Form + Zod (shared schemas client+server) | |
| File upload | S3 via presigned PUT URLs from a Server Action | `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` |
| Email | **AWS SES** | SES sandbox by default — README must call out the production-access request lead time |
| Shared state (rate limit, cache) | **Upstash Redis** | `@upstash/ratelimit` + `@upstash/redis`. Works on day one across multi-task ECS |
| Maps | Leaflet + OpenStreetMap tiles | No API key. Loaded client-only via dynamic import |
| OG images | `@vercel/og` (Satori) | Not Vercel-locked; runs fine in standalone Node on ECS |
| i18n | `next-intl` patterns, English-only catalog at launch | All UI strings keyed, no hardcoded copy |
| Deployment | Docker multi-stage → ECS Fargate behind ALB | `output: 'standalone'` in next.config |
| Tests | Vitest + Testing Library | ≥ 5 sample tests on auth, profile creation, search, slug generation, FHIR mapper |

## Project Structure

```
/src
  /app
    /(public)
      page.tsx                    # Homepage
      [slug]/page.tsx             # Doctor profile (SSR, JSON-LD, OG)
      search/page.tsx             # Faceted search
      [specialty]/page.tsx        # /cardiology
      [specialty]/[city]/page.tsx # /cardiology/dhaka
    /(auth)
      auth/login/page.tsx
      auth/register/page.tsx
      auth/verify-email/page.tsx
      auth/forgot-password/page.tsx
      auth/reset-password/page.tsx
    /(dashboard)
      dashboard/layout.tsx        # Auth guard via middleware + layout check
      dashboard/page.tsx
      dashboard/profile/page.tsx
      dashboard/chambers/page.tsx
      dashboard/photos/page.tsx
      dashboard/verification/page.tsx
      dashboard/analytics/page.tsx
      dashboard/settings/page.tsx
    /admin
      layout.tsx                  # Role-gated
      page.tsx
      doctors/page.tsx
      verifications/page.tsx
      specialties/page.tsx
    /api/v1
      doctors/route.ts
      doctors/[slug]/route.ts
      specialties/route.ts
      search/route.ts
    /api/og/[slug]/route.tsx      # Dynamic OG image
    /api/auth/[...nextauth]/route.ts
    sitemap.ts
    robots.ts
    layout.tsx
    globals.css
  /components
    /ui                           # shadcn primitives
    /profile                      # ProfileHeader, ChamberCard, QualificationsList, ScheduleGrid, ShareButton (with QR), ReportButton
    /forms                        # ProfileSectionForm, ChamberForm, PhotoUploader (react-easy-crop)
    /search                       # SearchBar, FacetSidebar, DoctorCard, Pagination
    /layout                       # Header, Footer, MobileNav, DashboardNav
    /map                          # LeafletMap (client-only), LocationPicker
  /lib
    /db
      mongoose.ts                 # Cached connection (Next.js dev HMR safe)
      models/User.ts
      models/Doctor.ts
      models/Specialty.ts
      models/ProfileView.ts
      models/ClaimRequest.ts
    /auth
      config.ts                   # NextAuth v5 config
      session.ts                  # auth() helper re-exports
    /s3
      client.ts
      presign.ts
    /email
      ses.ts
      templates/                  # React Email templates
    /redis
      client.ts
      ratelimit.ts
    /validators                   # Zod schemas (one per model section)
    /fhir
      practitioner.ts             # Doctor ⇄ FHIR Practitioner mapper
      codes.ts                    # SNOMED/LOINC tables used in the project
    /seo
      jsonld.ts                   # buildPhysicianJsonLd, buildMedicalBusinessJsonLd
      meta.ts                     # buildProfileMetadata
    /utils
      slug.ts                     # generateSlug, collision-safe
      bmdc.ts                     # BMDC format validator
      sanitize.ts                 # DOMPurify wrapper for bio markdown
      completeness.ts             # profileCompletenessScore
  /server
    /actions
      auth.ts                     # register, login, verify, reset
      doctor.ts                   # updateProfile sections, claim, report
      chamber.ts
      photo.ts                    # presign + confirm
      verification.ts             # request + admin approve/reject
      admin.ts
  /types
  middleware.ts                   # Auth guard for /dashboard, /admin
/scripts
  seed.ts                         # 20 specialties + 50 BD-realistic doctors + 1 admin
/public
.env.example
README.md
docker-compose.yml                # mongo (rs0) + app
Dockerfile                        # multi-stage, standalone output
vitest.config.ts
```

## Data Model

Schemas exactly as specified in the brief. Key reusable utilities:

- `lib/utils/slug.ts` — `generateSlug(displayName, specialty)` with collision suffix, used at signup and admin profile creation
- `lib/utils/completeness.ts` — single source of truth for the dashboard progress bar
- `lib/fhir/practitioner.ts` — `toFhirPractitioner(doctor)` used by `/api/v1/doctors/[slug]` and any future EMR export
- All MongoDB indexes (from the brief) created in the model files and idempotently ensured on connection

Multi-tenant readiness: every Doctor doc carries `ownerType: 'doctor' | 'clinic'` and `ownerId` from day one, even though MVP only writes `'doctor'`. Server Actions check `ownerId === session.user.id` for authorization (not `userId` directly) so the model survives clinic-group support later without a migration.

## Build Sequence

Follow the brief's 10-step order. One section = one PR-sized commit, in order:

1. **Scaffold**: `create-next-app` (pinned), Tailwind, shadcn init, Vitest, Prettier, ESLint, `output: 'standalone'`, env loader, mongoose connection helper. Smoke test: app boots, `/api/health` returns Mongo ping.
2. **Models + seed**: All Mongoose models with indexes. `scripts/seed.ts` populates 20 specialties (with Bangla names + SNOMED codes), 50 BD-realistic faker'd doctors (Dhaka/Chittagong/Sylhet areas, valid-format BMDC numbers, placeholder photos via `https://i.pravatar.cc`, `isClaimed: false`), 1 admin user (credentials documented in README).
3. **Auth**: NextAuth v5 with Credentials + Google. Email verification via SES. Forgot/reset flow. Middleware guards `/dashboard` and `/admin`. Rate-limit login via Upstash.
4. **Public profile page `/[slug]`** — *SEO first*: SSR fetch, `<Image>` for photos, JSON-LD (`Physician` + `MedicalBusiness`), OG meta, `/api/og/[slug]` Satori image, schedule table, chambers with Leaflet map, WhatsApp deep-link button, copy/QR share. Unclaimed banner. View counter via fire-and-forget Server Action that hashes IP.
5. **Search + category pages**: `/search`, `/[specialty]`, `/[specialty]/[city]`. Server-rendered, paginated 20/page. Sitemap + robots covers all published profiles and category combos.
6. **Doctor dashboard**: Multi-section profile editor with auto-save Server Actions; Zod-validated; live preview link. Chambers manager with Leaflet location picker and schedule grid. Settings (email/password, privacy toggles, soft delete).
7. **S3 photos**: Presigned PUT flow, `react-easy-crop`, 5MB / jpg|png|webp guard server-side, write `{url, s3Key}` to doctor doc. Cover photo same flow.
8. **Verification + admin**: BMDC entry, document upload to S3, `ClaimRequest` write. Admin pages: review queue, approve/reject (sets `bmdcVerified`, `verificationLevel`), suspend profiles, specialties CRUD.
9. **Analytics + public API**: 30-day views chart from `profileViews` aggregation; top referrers; city breakdown. `/api/v1/*` routes (FHIR-shaped for `/doctors/[slug]`), Upstash rate limit per IP+key, OpenAPI doc generated from Zod schemas.
10. **Polish**: a11y audit (axe), Lighthouse on three sample profile pages, bundle analysis, finalize Dockerfile + ECS task definition + `.env.example`, README pass.

## Critical Files & Reusable Utilities

- `lib/db/mongoose.ts` — single cached connection, survives Next.js HMR
- `lib/auth/config.ts` — re-exported `auth`, `signIn`, `signOut`; used by every Server Action that mutates
- `lib/validators/doctor.ts` — Zod schemas split per profile section, imported by both forms and Server Actions (one source of truth)
- `lib/fhir/practitioner.ts` — used by `/api/v1` and called out as the integration seam for the future EMR
- `lib/seo/jsonld.ts` + `lib/seo/meta.ts` — keep all SEO concerns colocated, easy to audit
- `server/actions/*` — every mutation goes through a Server Action that: (1) `await auth()`, (2) Zod parse, (3) ownership check via `ownerId`, (4) Upstash rate limit where relevant, (5) `revalidatePath` of the affected public URL

## Environment Variables

`.env.example` (committed) lists every key with placeholders. `.env.local` (gitignored) holds the real dev values. Initial set:

```
# Mongo (Atlas dev cluster provided by user — used as-is for dev)
MONGO_URI=mongodb+srv://db-production-user:****@devcluster0.qo4rtmr.mongodb.net/doctor-id-dev

# NextAuth
AUTH_SECRET=                # openssl rand -hex 32
AUTH_URL=http://localhost:3000
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=

# AWS (S3 + SES)
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
S3_BUCKET=doctor-id-uploads
SES_FROM_EMAIL=no-reply@doctor.id.bd

# Upstash
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Heads-up**: the user pasted the Atlas dev URI inline in chat. I'll write it into `.env.local` only, never into `.env.example` or any committed file. README will note that this credential should be rotated before going to a wider team, since it has been pasted into a chat transcript.

## Out-of-Scope (explicit non-goals)

Appointment booking, chat, reviews/ratings, payments, mobile apps, multi-locale UI, EMR integration, patient portal. Bilingual structure is in place (`next-intl`) but only English is shipped.

## Verification

End-to-end manual + automated checks before declaring done:

1. **Boot**: `docker-compose up` → `npm run seed` → `npm run dev` → homepage renders with seeded counts.
2. **SEO**: `view-source:` on three seeded profile pages shows complete HTML, JSON-LD validates against [Schema.org validator](https://validator.schema.org/), OG image renders at `/api/og/[slug]`.
3. **Auth**: Register a doctor, receive SES verification email (use SES sandbox + verified test address), login, edit profile, save, see changes on public page within one revalidation.
4. **Search**: `/search?specialty=cardiology&city=dhaka` returns seeded results, facets filter correctly, pagination works, all server-rendered (disable JS — page still works).
5. **Upload**: Upload a profile photo end-to-end, confirm S3 object, confirm public page shows it via `next/image`.
6. **Verification flow**: Submit BMDC + document as doctor, approve as admin, badge appears on public page.
7. **API**: `curl /api/v1/doctors/[slug]` returns FHIR-shaped JSON; hammer it past the rate limit to confirm 429.
8. **Tests**: `npm test` — Vitest suite green (≥5 tests covering auth registration, slug uniqueness, Zod profile validation, search query builder, FHIR mapper round-trip).
9. **Lighthouse**: Profile page mobile LCP < 2.5s on a throttled run.
10. **Build**: `docker build` produces a standalone image that boots against Atlas + SES + Upstash env vars only.

## Risks / Heads-Up

- **SES sandbox**: New SES accounts only send to verified addresses until production access is granted (review takes ~24h, sometimes more). Surfaced in README so launch isn't blocked by this.
- **BMDC verification is manual**: No public BMDC API exists; admin reviews uploaded certificates. Documented as a v2 candidate for automation.
- **Mongo `$text` search ceiling**: Fine for 50–50k docs; once profiles grow, swap to Atlas Search. The search Server Action is the single seam to change.
- **OG image cold start**: Satori inside Node on ECS can add ~300ms on first request after deploy. Cache headers set to `s-maxage=86400` on `/api/og/[slug]` so CDN absorbs it.
