@AGENTS.md

# doctor.id.bd — agent context

**What this is**: Next.js + MongoDB application for `doctor.id.bd` — a public,
SEO-first professional profile directory for Bangladeshi doctors. The
supply-side acquisition channel for Shafa Care Ltd's future EMR/HMS product.
Every doctor profile is a public landing page; doctors share their
`/[slug]` URL on WhatsApp bios, prescription pads, and business cards. The
data model is FHIR-Practitioner-aligned so it feeds the future EMR without a
rewrite.

**Status**: MVP build complete (all 10 build-sequence steps done in one
session, 2026-05-28). Production `next build` green. 26 Vitest tests passing.
See [`.claude/progress/mvp-progress.md`](./.claude/progress/mvp-progress.md)
for per-step status. See [`.claude/plans/mvp-plan.md`](./.claude/plans/mvp-plan.md)
for the approved architectural plan + reasoning.

---

## Locked tech choices (do not change without explicit user approval)

| Concern | Choice | Notes |
|---|---|---|
| Framework | **Next.js 16.2.6** (App Router, Turbopack) | Pinned **exact** — no `^`/`~` for `next` or `react`. React 19.2.4 pinned. |
| TypeScript | strict; `@/*` → `./src/*` | tsconfig set up by create-next-app |
| Database | MongoDB Atlas (prod), `docker-compose` Mongo 7 replica set (offline) | Connection via Mongoose 9.6 |
| Auth driver | NextAuth v5 (`next-auth@5.0.0-beta.31`) | JWT sessions (Credentials provider requires JWT) |
| Mongo driver | `mongodb@6.21.0` *pinned to 6.x* | `@auth/mongodb-adapter@3.11.2` peer-requires Mongo 6; Mongoose has its own bundled driver and is independent |
| Email | AWS SES v2 | No-ops to console.log when AWS creds absent |
| Shared state | Upstash Redis (`@upstash/redis` + `@upstash/ratelimit`) | Limiters degrade to "allow everything" without creds |
| Styling | Tailwind v4 + shadcn-style primitives (copied, not packaged) | Tokens in [`src/app/globals.css`](src/app/globals.css) |
| Forms | React Hook Form + Zod | Same Zod schemas used client- and server-side |
| Maps | Leaflet + OpenStreetMap (no API key) | Client-only via dynamic import; SSR-disabled wrapper in [`src/components/map/leaflet-lazy.tsx`](src/components/map/leaflet-lazy.tsx) |
| OG images | `next/og` (Satori) | 1200×630, day-long CDN cache, no emoji glyphs |
| i18n | `next-intl` patterns, English-only catalog at launch | Structure in place for future locales |
| Tests | Vitest + Testing Library (jsdom) | DB-less unit tests; no integration tests yet |
| Deploy target | AWS ECS Fargate behind ALB | `output: 'standalone'` in [next.config.ts](next.config.ts); Docker multi-stage |

---

## Project layout (App Router + route groups)

```
src/
  app/
    (public)/        homepage, /[slug] (polymorphic — see below), /search,
                     /[specialty]/[city]
    (auth)/          /auth/login, /register, /verify-email, /forgot-password,
                     /reset-password
    (dashboard)/     /dashboard/* (auth-gated by proxy + layout guard)
    admin/           /admin/* (role-gated — admin only)
    api/v1/          public REST API (doctors, doctors/[slug], specialties,
                     search) — FHIR Practitioner shape on /doctors endpoints
    api/og/[slug]/   dynamic OG image route
    api/health/      ECS healthcheck (Mongo ping)
    api/auth/[...nextauth]/  NextAuth handlers (delegates to lib/auth/handlers)
    sitemap.ts       dynamic XML sitemap
    robots.ts
  components/
    ui/              shadcn primitives: Button, Input, Label, Card
    profile/         ProfileHeader, ChamberCard, ScheduleGrid, ShareButton (QR),
                     WhatsappButton, ReportButton, VerifiedBadge
    search/          DoctorCard, Pagination, SpecialtyListing
    map/             LeafletMap (client) + LeafletLazy (client boundary)
    layout/          SiteHeader, SiteFooter, DashboardNav
  lib/
    db/              mongoose.ts (cached conn), models/, queries/doctors.ts
    auth/            config.ts (node), edge-config.ts (edge-safe), handlers.ts
    s3/              client + presign helpers
    email/           ses.ts + templates.ts (inline HTML)
    redis/           client + ratelimit factories
    fhir/            practitioner.ts ← THE EMR integration seam
    seo/             jsonld.ts (Physician + MedicalBusiness) + meta.ts
    utils/           cn, slug, bmdc, sanitize, completeness
    validators/      Zod schemas (auth.ts, doctor.ts) — single source of truth
    api/             withApiHandler() wrapper for /api/v1 routes
    env.ts           Zod-validated runtime env loader (lazy, fails fast)
  server/actions/    auth.ts, doctor.ts, photo.ts, verification.ts
  types/             plain TS types (DoctorDocLike) for RSC/client boundaries
  proxy.ts           auth proxy (formerly middleware — Next 16 rename)
scripts/
  seed.ts            idempotent (drops + reseeds; refuses NODE_ENV=production)
  pick-slug.ts       dev helper
tests/               Vitest — slug, bmdc, completeness, fhir, auth validators, jsonld
```

---

## Non-obvious constraints (these will bite if forgotten)

### 1. Auth proxy must stay edge-safe
[`src/proxy.ts`](src/proxy.ts) runs on the edge runtime. It imports
[`src/lib/auth/edge-config.ts`](src/lib/auth/edge-config.ts) — **not**
[`src/lib/auth/config.ts`](src/lib/auth/config.ts). The full config imports
Mongoose, bcrypt, and AWS SDK, all of which break the edge runtime
("the edge runtime does not support Node.js 'stream' module"). When
extending auth callbacks, ask: does the edge proxy need this? If yes, the
logic must avoid DB/native deps.

### 1a. Role-based portal isolation
Two separate portals, both gated by [`src/proxy.ts`](src/proxy.ts):
- `/admin/*` — **admin only**. Doctors get bounced to `/dashboard`.
- `/dashboard/*` — **doctor only**. Admins get bounced to `/admin`.

`loginAction` in [`src/server/actions/auth.ts`](src/server/actions/auth.ts)
picks the post-login destination from the user's role (admin → `/admin`,
otherwise → `/dashboard`). It also validates the `?next=` query string
against the user's allowed portal so a doctor with `?next=/admin` doesn't
bounce-loop. The dashboard layout has a defense-in-depth `redirect("/admin")`
for admins as well. Don't introduce a code path that lets an admin browse
the doctor dashboard — there's no `Doctor` document for an admin account,
so the dashboard would fail to load any context anyway.

### 2. Server Actions: every mutation follows this pattern
1. `await auth()` — fetch session
2. `Zod.safeParse` — re-validate input (never trust client-side parse)
3. Ownership check via `ownerId === session.user.id` (NOT `userId` — see #4)
4. Upstash rate-limit where relevant
5. Mutate via Mongoose
6. `revalidatePath` of the affected public URL
7. Return `{ ok: true }` or `{ ok: false, error: string }` — never throw to the client

See [`src/server/actions/doctor.ts`](src/server/actions/doctor.ts) for the
canonical `loadMyDoctor()` helper that handles steps 1 + 3.

### 3. The `/[slug]` route is polymorphic
[`src/app/(public)/[slug]/page.tsx`](src/app/(public)/[slug]/page.tsx) tries to
load the slug as a **specialty** first (e.g. `/cardiology`); if not found,
tries it as a **doctor profile**. This lets specialty landing pages and doctor
profiles share the one-segment URL space. When adding a new "named" slug type,
add it to the dispatch chain in this file. Doctor slugs generated by
[`generateSlug()`](src/lib/utils/slug.ts) include the specialty noun (e.g.
`karim-rahman-cardiologist`) so collisions with specialty slugs are unlikely.

### 4. Multi-tenant ownership
Every Doctor doc carries `ownerType: 'doctor' | 'clinic'` and `ownerId`. MVP
only writes `ownerType: 'doctor'` with `ownerId === userId`, but **Server
Actions authorize via `ownerId`, not `userId`**, so the model survives a
future "profile owned by a clinic group" requirement without a migration. Do
not introduce `userId`-based authorization in new code.

### 5. MongoDB cannot index two array fields together
The brief originally specified a compound index on
`specialties.name + chambers.city`. MongoDB rejects this with
"cannot index parallel arrays". The fix is **two separate single-field
indexes** — the query planner intersects them. See the comment block in
[`src/lib/db/models/Doctor.ts`](src/lib/db/models/Doctor.ts).

### 6. Satori (`next/og`) layout rules
Every `<div>` with more than one child must declare `display: flex`. Text
nodes count as children. No emoji glyphs (Satori tries to download a dynamic
font per glyph and the fetch is flaky). Inline styles only — no Tailwind in
the OG route. See [`src/app/api/og/[slug]/route.tsx`](src/app/api/og/[slug]/route.tsx).

### 7. `dynamic(..., { ssr: false })` is forbidden in Server Components in Next 16
For client-only components like the Leaflet map, wrap the dynamic import in a
`"use client"` boundary first. The server component imports the boundary; the
boundary imports the dynamic. See
[`src/components/map/leaflet-lazy.tsx`](src/components/map/leaflet-lazy.tsx).

### 8. `findOneAndUpdate({ new: true })` is deprecated in Mongoose 9
Use `returnDocument: 'after'` instead. (We have one lingering warning in the
seed script — cosmetic, but if you touch that area, please convert.)

### 9. Type-strict environment validation
[`src/lib/env.ts`](src/lib/env.ts) Zod-validates env vars on first call. It is
**lazy** — the validator only runs when `env()` is called, not at import time
— so the browser bundle doesn't crash on missing server vars. New env vars go
in the `ServerEnvSchema` or `PublicEnvSchema` and into `.env.example`.

### 10. The FHIR mapper is the EMR integration seam
[`src/lib/fhir/practitioner.ts`](src/lib/fhir/practitioner.ts) is the single
seam between internal schema and FHIR R4 Practitioner. When the EMR
integration starts (Phase 3), changes go here. BD-specific fields live on
`Practitioner.extension` entries under `https://doctor.id.bd/fhir/`.

### 11. Mongo `$text` search ceiling
`searchDoctors` in [`src/lib/db/queries/doctors.ts`](src/lib/db/queries/doctors.ts)
uses Mongo's built-in `$text` index. Good up to ~50k profiles. Past that,
swap to Atlas Search — only this file changes.

### 12. SES is in sandbox by default
New AWS accounts can only send to verified addresses until SES production
access is granted (~24h review). Until then, register + verify-email + reset
flows work only for verified test addresses. The `sendEmail()` helper
gracefully no-ops to console.log when AWS creds are absent, so dev isn't blocked.

---

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Next dev server with Turbopack |
| `npm run build` | Production build with `output: 'standalone'` |
| `npm start` | Run the production build |
| `npm run seed` | Wipe + reseed (20 specialties, 50 doctors, 1 admin). Refuses NODE_ENV=production |
| `npm test` | Run the Vitest suite (no DB required) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run format` | Prettier (writes) |

### Default seed credentials
- Admin: `admin@doctor.id.bd` / `ChangeMe!2026` (or the first email in `ADMIN_EMAILS`)
- 50 unclaimed doctor profiles (no passwords — register against the BMDC numbers to claim)

The Atlas dev URI in [`.env.local`](.env.local) was pasted in chat —
**rotate before sharing the repo broadly**.

---

## Known deferrals (intentional, not bugs)

These are documented stub surfaces — if the user asks for them, they're not
finished yet, but the integration seam exists:

- **Chambers editor**: [`/dashboard/chambers`](src/app/(dashboard)/dashboard/chambers/page.tsx)
  is read-only. The full editor (Leaflet location picker + day/time schedule
  grid) is a v2 ticket. Seed-time and signup-time chambers work fine.
- **Image cropper**: `react-easy-crop` is installed but not yet wired into
  [`PhotoUploader`](src/app/(dashboard)/dashboard/photos/photo-uploader.tsx).
  Uploads happen at the file's natural dimensions.
- **BMDC verification**: admin reviews uploaded certificates manually — no
  public BMDC API exists. Automation is v2.
- **Email change**: admin-only in MVP (no self-serve UI).
- **Soft delete grace period**: `softDeleteAccountAction` sets `deletedAt` and
  unpublishes the profile. A 30-day-grace hard-delete job is referenced in
  the README but not implemented.
- **Lighthouse + axe a11y audit**: deferred to staging post-merge.
- **i18n catalog**: structure in place via `next-intl`; only English shipped.

---

## How to make good changes here

- **Read the plan first**: [`.claude/plans/mvp-plan.md`](./.claude/plans/mvp-plan.md)
  explains *why* the architecture is the way it is. The progress file
  ([`.claude/progress/mvp-progress.md`](./.claude/progress/mvp-progress.md))
  is the authoritative status board — update it in the same commit that
  completes a step.
- **Don't add new dependencies casually**: the brief is strict about
  the tech stack. Mongoose, NextAuth v5, Tailwind v4, shadcn-style (copied,
  not packaged), Zod. Adding e.g. React Query or a different ORM needs
  user approval.
- **Don't introduce client-side state libraries**: React Server Components +
  Server Actions are the default. Client components are for interactivity only.
- **Don't bypass the Server Action pattern**: even one-line updates should
  route through a Server Action with auth + Zod + ownership check.
- **Don't write FHIR mapping inline**: it goes through
  [`lib/fhir/practitioner.ts`](src/lib/fhir/practitioner.ts).
- **Don't break SEO on `/[slug]`**: the public profile is the product's
  marketing surface. SSR, JSON-LD, OG meta, and `metadataBase` must stay
  intact. If you change anything in that page, run a Lighthouse pass.
- **Run `npm test` + `npm run typecheck` + `npm run build`** before declaring
  a change done. All three are fast (<60s combined).

---

## Quick references

- Plan: [`.claude/plans/mvp-plan.md`](./.claude/plans/mvp-plan.md)
- Progress board: [`.claude/progress/mvp-progress.md`](./.claude/progress/mvp-progress.md)
- README (human-facing): [`README.md`](./README.md)
- Env template: [`.env.example`](./.env.example)
- Dockerfile: [`Dockerfile`](./Dockerfile)
- Docker Compose (local Mongo fallback): [`docker-compose.yml`](./docker-compose.yml)
