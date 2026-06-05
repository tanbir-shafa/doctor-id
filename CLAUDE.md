@AGENTS.md

# doctor.id.bd — agent context

**What this is**: Next.js + MongoDB application for `doctor.id.bd` — a public,
SEO-first professional profile directory for Bangladeshi doctors. The
supply-side acquisition channel for Shafa Care Ltd's future EMR/HMS product.
Every doctor profile is a public landing page; doctors share their
`/[slug]` URL on WhatsApp bios, prescription pads, and business cards. The
data model is FHIR-Practitioner-aligned so it feeds the future EMR without a
rewrite.

**Status**: MVP shipped + **Sprint A complete** (all 8 features Day 1–30
of the 60-day acquisition plan) + **S3 re-platform & mandatory live-selfie
registration** (#17) + **SSL Wireless SMS** (#14) + **contact-private-by-default
& opt-in WhatsApp appointment button** (#18) + **chamber `city`→`district` rename
with cascading division/district dropdowns** (#19) + **two verification axes
(BMDC + account/identity) with combined blue tick, name binding & click-to-explain
public badge** (#20).
Production `next build` green.
**494 Vitest tests passing** (`npm run lint` clean). Real public-Bangladesh data ingested (Popular
Diagnostic, 3,237 doctors). See [`.claude/progress/mvp-progress.md`](./.claude/progress/mvp-progress.md)
for the changelog. New devs start at [`doc/getting-started.md`](./doc/getting-started.md).

---

## Locked tech choices (do not change without explicit user approval)

| Concern | Choice | Notes |
|---|---|---|
| Framework | **Next.js 16.2.6** (App Router, Turbopack) | Pinned **exact** — no `^`/`~` for `next` or `react`. React 19.2.4 pinned. |
| TypeScript | strict; `@/*` → `./src/*` | tsconfig set up by create-next-app |
| Database | MongoDB Atlas (prod), `docker-compose` Mongo 7 replica set (offline) | Connection via Mongoose 9.6 |
| Auth driver | NextAuth v5 (`next-auth@5.0.0-beta.31`) | JWT sessions (Credentials provider requires JWT) |
| Mongo driver | `mongodb@6.21.0` *pinned to 6.x* | `@auth/mongodb-adapter@3.11.2` peer-requires Mongo 6; Mongoose has its own bundled driver and is independent |
| Email | **AWS SES v2** (TS port of shafa `emailService.js`) | Cross-account creds by `NODE_ENV` (same as S3), `From` display name + config set + reply-to, DynamoDB suppression list. No-ops to console.log when AWS creds absent. See #13. |
| **Storage / uploads** | **AWS S3, server-side** (`@aws-sdk/client-s3` + `s3-request-presigner` + `credential-providers`) | Port of shafa `apps/api`. Creds resolve by `NODE_ENV`: prod → cross-account STS role, else → static keys. **Public** bucket (profile/cover, stable URLs) + **private** bucket (selfie/verification, presigned-GET). See #17. |
| **SMS** | **SSL Wireless iSMS Plus v3** (JSON API; MDL legacy fallback via `SMS_PROVIDER`) | Server-side `fetch` through a provider facade. Bulk via `/send-sms/bulk` (≤100 same-body) + `/send-sms/dynamic` (≤100 per-number). Same dev-mode no-op as SES. **Request IP must be whitelisted** in the SSL portal for live sends. See #14. |
| Shared state | Upstash Redis (`@upstash/redis` + `@upstash/ratelimit`) | Limiters degrade to "allow everything" without creds |
| Styling | Tailwind v4 + shadcn-style primitives (copied, not packaged) | Tokens in [`src/app/globals.css`](src/app/globals.css) |
| Forms | React Hook Form + Zod | Same Zod schemas used client- and server-side |
| **PDF** | **`@react-pdf/renderer`** (JSX-based, server-rendered) | A.2 Rx pad. Sibling lib `qrcode` for server-side QR data URLs. |
| Maps | Leaflet + OpenStreetMap (no API key) | Client-only via dynamic import; SSR-disabled wrapper in [`src/components/map/leaflet-lazy.tsx`](src/components/map/leaflet-lazy.tsx). Picker mode supports click-to-pin + drag. |
| OG images | `next/og` (Satori) | 1200×630, day-long CDN cache, no emoji glyphs |
| i18n | `next-intl` patterns, English-only catalog at launch | Structure in place for future locales |
| Tests | Vitest + Testing Library (jsdom) | DB-less unit tests; no integration tests yet |
| Deploy target | AWS ECS Fargate behind ALB | `output: 'standalone'` in [next.config.ts](next.config.ts); Docker multi-stage |

---

## Project layout (App Router + route groups)

```
src/
  app/
    (public)/        homepage, /[slug] (polymorphic — see #3), /search,
                     /[specialty]/[district], /[slug]/[district] (see #19),
                     /preview (owner-only profile preview, auth-gated — see #1c)
    (auth)/
      auth/login              doctor phone+OTP sign-in
      auth/register           doctor register: BMDC + phone + name + mandatory
                              live selfie (selfie-capture.tsx, getUserMedia) → OTP
      auth/admin/login        admin email+password sign-in (new)
      auth/{forgot,reset,verify-email}
    (dashboard)/     /dashboard/* (auth-gated by proxy + layout guard)
      dashboard/{profile,chambers,photos,analytics,settings}
      dashboard/verification         BMDC + account (identity) request forms (#20)
      dashboard/requests             appointment inbox (A.3)
      dashboard/prescription-pad     Rx pad preview + download (A.2)
        download/route.ts            GET → application/pdf via @react-pdf/renderer
    admin/           /admin/* (role-gated — admin only)
      admin/{doctors,specialties}
      admin/verifications            BMDC claim review queue (A.7)
      admin/account-verifications    identity (Gov ID + legal name) review queue (#20)
      admin/emr-queue                manual EMR seat provisioning (A.5)
      admin/outbound                 campaign telemetry + opt-out roster (A.8)
    api/v1/          public REST API (doctors, doctors/[slug], specialties,
                     search) — FHIR Practitioner shape on /doctors endpoints
    api/og/[slug]/   dynamic OG image route (renders verified pill)
    api/health/      ECS healthcheck (Mongo ping)
    api/auth/[...nextauth]/  NextAuth handlers
    sitemap.ts       dynamic XML sitemap
    robots.ts
  components/
    ui/              shadcn primitives: Button, Input, Label, Card
    profile/         DoctorProfileView (shared public + /preview body — #1c),
                     ProfileHeader, ChamberCard, ScheduleGrid, ShareButton (QR),
                     WhatsappButton, ReportButton, VerifiedBadge,
                     VerifiedBadgeExplainer (click-to-explain public badge — #20),
                     AppointmentRequestForm (A.3)
    search/          DoctorCard, Pagination, SpecialtyListing
    map/             LeafletMap (client, picker-aware) + LeafletLazy boundary
    layout/          SiteHeader (session-aware), SiteFooter,
                     DashboardNav, DashboardMobileNav, MobileMenu
    dashboard/       ScheduleEditor (A.6)
    pdf/             RxPad component (A.2 — @react-pdf/renderer JSX)
    admin/           AdminShell, AdminSidebar, StatBox, PageHeader (AdminLTE-style)
  lib/
    db/              mongoose.ts (cached conn), models/ (loosely-typed `Model<unknown>`
                     exports + `loose.ts` = lint-safe cast surface), queries/{doctors,admin}.ts
    auth/            config.ts (node), edge-config.ts (edge-safe), handlers.ts
    s3/              client.ts (S3Client; creds by NODE_ENV — STS role prod / static keys else)
                     + aws-credentials.ts (STS provider) + s3-service.ts (computeSha256/
                     buildS3Key/uploadBufferToS3/getPresignedUrl — port of shafa apps/api)
                     + buckets.ts (public/private routing + UPLOAD_PURPOSE) + file-doc.ts
                     + doctor-photo.ts + upload-doc.ts. See #17.
    email/           ses.ts (SESv2 sendEmail + isSuppressed/SuppressedRecipientError —
                     port of shafa emailService.js, #13) + templates.ts (inline HTML)
    sms/             client.ts (facade: sendSms/sendSmsBatch) + provider.ts (SMS_PROVIDER
                     selector) + providers/{ssl,mdl}.ts + types.ts + estimate.ts
    redis/           client + ratelimit factories (login + OTP + appointment + outbound limiters)
    fhir/            practitioner.ts ← THE EMR integration seam
    rx-pad/          dto.ts (pure DTO + schedule formatter) — A.2
    qr/              server.ts — renderQrPngDataUrl() — A.2
    outbound/        templates.ts — renderTemplate(), segmentCount() — A.8
    sla.ts           classifySla() + formatDuration() — A.7 (model-free; client-safe)
    seo/             jsonld.ts (Physician + MedicalBusiness) + meta.ts
    geo/             bd-districts.ts (8 divisions, 64 districts + canonicalize) — see #19
    utils/           cn, slug, bmdc, sanitize, completeness, phone, name-parser, otp,
                     verification (computeVerificationLevel + resolveVerifiedNameUpdate — #20)
    validators/      Zod: auth, doctor, appointment, verification — single source of truth
    api/             withApiHandler() wrapper for /api/v1 routes
    env.ts           Zod-validated runtime env loader (lazy, fails fast)
  server/actions/
    auth.ts          startRegistrationAction, completeRegistrationAction,
                     requestLoginOtpAction, loginAction (admin), forgotPassword,
                     resetPassword, logoutAction
    doctor.ts        loadMyDoctor, updateProfile*, updateChambersAction (A.6),
                     setPublishStatus, recordProfileView, reportProfile
    photo.ts         uploadProfilePhotoAction, uploadVerificationDocAction,
                     uploadIdentityDocAction (Gov ID — #20),
                     uploadRegistrationSelfieAction (unauth live selfie) — server-side S3 (#17)
    verification.ts  requestVerification + approve/reject claim (BMDC; flips User.approved),
                     requestAccountVerification + approve/rejectAccountVerification (identity — #20)
    appointment.ts   createAppointmentRequestAction (public), updateStatus (A.3)
    emr.ts           markEmrReadyAction (admin), declineEmrAction (doctor) — A.5
    outbound.ts      addOptOutAction, removeOptOutAction — A.8
  types/             plain TS types (DoctorDocLike) for RSC/client boundaries
  proxy.ts           auth proxy (edge runtime, role-gated /admin and /dashboard)
scripts/
  seed.ts            default seed + --source=popular-diagnostic ingestion
  seed-unified.ts    seed the unified dataset (data/unified) into Doctor
  outbound.ts        batched SMS campaign dispatcher — A.8
  lib/providers/     popular.ts + ibn-sina/sasthyaseba/doctor-bangladesh normalizers
  fetch-*.ts         one-shot snapshot scripts (Popular, Ibn Sina)
data/
  popular-diagnostic/{doctor-ids,details,photos,meta}.json   (3,237 doctors)
tests/               46 files, 467 tests — Vitest, DB-less
doc/                 developer guides (getting-started.md)
.claude/
  plans/             roadmaps + plan files
  progress/          mvp-progress.md + 60-days-sprint-a-tasks.md
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

### 1a. Role-based portal isolation + login URL by role
Two separate portals, both gated by [`src/proxy.ts`](src/proxy.ts):
- `/admin/*` — **admin only**. Doctors get bounced to `/dashboard`. Unauthed visits → `/auth/admin/login`.
- `/dashboard/*` — **doctor only**. Admins get bounced to `/admin`. Unauthed visits → `/auth/login` (phone-OTP).

Login pages themselves redirect already-authenticated visitors to the right portal
(see [auth/login/page.tsx](src/app/(auth)/auth/login/page.tsx) and
[auth/admin/login/page.tsx](src/app/(auth)/auth/admin/login/page.tsx)), so "Sign in" on
the public header bounces signed-in users back to their dashboard instead of
showing a stale login form.

### 1b. Doctor auth is phone + SMS OTP, *not* password
- **Registration** ([startRegistrationAction → completeRegistrationAction](src/server/actions/auth.ts)): doctor submits BMDC + phone + name + **a mandatory live-camera selfie** (email optional) → OTP sent → OTP verified → User + Doctor + ClaimRequest materialized atomically inside `completeRegistrationAction` (which also mints the selfie's `File` doc). **No password is ever set on a doctor User row.** After verify, the client **auto-signs-in** by reusing the just-entered OTP (`completeRegistrationAction` leaves the OTP valid) and lands on `/dashboard?welcome=1` — no second code. See #17 for the selfie path and #1c for what's gated until approval.
- **Login** ([requestLoginOtpAction + NextAuth `sms-otp` provider](src/server/actions/auth.ts)): phone → OTP → signed in. NextAuth's `sms-otp` Credentials provider in [auth/config.ts](src/lib/auth/config.ts) is the trust boundary — it re-validates the OTP hash and clears OTP state on success (**no approval gate on login** — see #1c). An **unknown phone returns a clear "No account found with this number. Please register first."** — the old silent enumeration-protection no-op was removed (UX over enumeration resistance; the per-phone rate limiter still applies). If a real SMS provider is configured but the send fails, the action returns an error instead of pretending success (the dev no-op still "succeeds" so offline testing works). Same send-failure handling on registration.
- **Admin auth** unchanged: email + bcrypt password via the original Credentials provider, at `/auth/admin/login`.
- Sessions persist for **30 days** via explicit cookie `maxAge` (see [auth/config.ts](src/lib/auth/config.ts) `cookies.sessionToken.options.maxAge`). Without this, NextAuth falls back to a session cookie that drops on browser close.

### 1c. `User.approved` gates PUBLISHING, not login
A new doctor (`approved: false`) **can log in, edit, and preview immediately** — they are
NOT blocked from sign-in. `approved` gates whether the profile can go **public**:
- **Login is open** — neither `requestLoginOtpAction` nor the `sms-otp` `authorize` checks
  `approved` (that gate was removed). OTP validity is the only sign-in boundary.
- **Publishing is gated** — [`setPublishStatusAction`](src/server/actions/doctor.ts) refuses
  to set `status: "published"` while `approved === false`; the dashboard
  [`PublishToggle`](src/app/(dashboard)/dashboard/profile/publish-toggle.tsx) disables the
  Publish button and the overview shows an "under review" banner. Unpublish is always allowed.
- **Public surfaces stay private** — the public `/[slug]`, search, sitemap, OG, and API all
  gate on `status === "published"`. Because publish is gated by `approved`, an unapproved
  profile can't be published, so it never appears publicly and the link 404s. (The public
  page does NOT do a per-render `User.approved` lookup — `status === "published"` already
  implies the owner was approved, keeping the SEO hot path fast.)
- **Preview** — the owner sees their profile (any status) via the auth-gated
  [`/preview`](src/app/(public)/preview/page.tsx) route, which reuses the shared
  [`DoctorProfileView`](src/components/profile/doctor-profile-view.tsx) (also used by `/[slug]`).
- **Approval** — admin's "Approve & allow publishing" button in
  [`/admin/verifications`](src/app/admin/verifications/page.tsx) (`approveClaimAction`) flips
  `approved → true`, which unlocks the Publish button (the doctor then publishes — approval
  does not auto-publish).
- Existing admins + legacy/seed rows default to `approved: true`, so only new doctor
  registrations are gated.

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
`specialties.name + chambers.district`. MongoDB rejects this with
"cannot index parallel arrays". The fix is **two separate single-field
indexes** — the query planner intersects them. See the comment block in
[`src/lib/db/models/Doctor.ts`](src/lib/db/models/Doctor.ts). (The location key
was renamed `chambers.city` → `chambers.district` — see #19.)

### 5a. Sparse-unique indexes need a partial filter when the field has `default: null`
Mongoose's `default: null` materializes the field, which means a plain
`sparse: true` index treats `null` as "present" — multiple null rows then
collide. For `Doctor.bmdcNumber` and `User.phone` we use
`partialFilterExpression: { <field>: { $type: "string" } }` instead. See
the indexes at the bottom of [Doctor.ts](src/lib/db/models/Doctor.ts) and
[User.ts](src/lib/db/models/User.ts).

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

### 8. Mongoose 9 pre-hooks: prefer async style over `next` callbacks
Hooks like `pre("validate", ...)` should be declared as `async function (this: any) { ... }`
with no `next` parameter — Mongoose detects function arity and awaits the
returned promise. The callback-style `function (next) { ...; next(); }` is
fragile under loose casts; we shipped a regression with it on `ClaimRequest`
once (see `tests/claim-request-hooks.test.ts` for the regression guard).
`findOneAndUpdate({ new: true })` is deprecated — use `returnDocument: 'after'`.

### 9. Type-strict environment validation
[`src/lib/env.ts`](src/lib/env.ts) Zod-validates env vars on first call. It is
**lazy** — the validator only runs when `env()` is called, not at import time
— so the browser bundle doesn't crash on missing server vars. New env vars go
in the `ServerEnvSchema` or `PublicEnvSchema` and into `.env.example`. The
validator throws if it detects browser-side access (`typeof window !== 'undefined'`)
— Vitest tests that hit env() must declare `// @vitest-environment node` at
the top of the file (default is jsdom).

### 10. The FHIR mapper is the EMR integration seam
[`src/lib/fhir/practitioner.ts`](src/lib/fhir/practitioner.ts) is the single
seam between internal schema and FHIR R4 Practitioner. When the EMR
integration starts (Phase 3), changes go here. BD-specific fields live on
`Practitioner.extension` entries under `https://doctor.id.bd/fhir/`.

### 11. Mongo `$text` search ceiling
`searchDoctors` in [`src/lib/db/queries/doctors.ts`](src/lib/db/queries/doctors.ts)
uses Mongo's built-in `$text` index. Good up to ~50k profiles. Past that,
swap to Atlas Search — only this file changes.

### 12. PhotoSchema is a denormalized cache of File
Doctor.photo (and future `*Photo` subdocs) caches `s3Bucket`, `s3Key`, and
`visibility` so reads don't need a `.populate("photo.file")` round-trip on
every profile load. The authoritative record lives in the `File` collection
([src/lib/db/models/files.ts](src/lib/db/models/files.ts)) — `photo.file` is
the ObjectId ref. **When a photo is replaced, both the File doc and the
cached PhotoSchema fields must be updated atomically** (write the new File
doc first, then update Doctor.photo to point at it; soft-delete the old File
via `deletedAt`). This is **now implemented** for profile + cover uploads via
the shared [`uploadDoctorPhotoFromForm`](src/lib/s3/doctor-photo.ts) helper
(used by both the dashboard and admin actions) — `photo.file` is populated, no
longer null. Linked-entity types currently supported: `USER | ADMIN | DOCTOR`.

### 13. Email is a TS port of shafa's SES v2 service (+ DynamoDB suppression)
[`src/lib/email/ses.ts`](src/lib/email/ses.ts) is a faithful TypeScript port of
`shafa-monorepo/apps/api/app/services/emailService.js` (the two apps share one
AWS account). It exposes `sendEmail({ email, subject, body })` (HTML body) →
`{ messageId? }`, plus `isSuppressed(email)` + `SuppressedRecipientError`:
- **Credentials resolve by `NODE_ENV`, exactly like [`getS3()`](src/lib/s3/client.ts)
  (#17)**: production → cross-account STS role via the shared
  [`crossAccountCredentialsProvider`](src/lib/s3/aws-credentials.ts); any other
  env → static access keys. The SES client never used the cross-account role
  before this port, so it couldn't authenticate in prod.
- **From / options**: optional display name (`SES_FROM_NAME` →
  `"name" <addr>`), optional `ConfigurationSetName` (`SES_CONFIG_SET`), optional
  `ReplyToAddresses` (`SES_REPLY_TO`); the sender is `SES_FROM_ADDRESS` (renamed
  from the old `SES_FROM_EMAIL`).
- **Suppression list**: before every send, `isSuppressed` checks the DynamoDB
  table named by `SES_SUPPRESSION_TABLE` (partition key `email`, lowercased) via
  `@aws-sdk/lib-dynamodb`; a hit throws `SuppressedRecipientError` (`code:
  "SUPPRESSED"`). Unset table or absent creds → returns `false` (skip the check);
  SES still enforces its own native account-level suppression list on send.
- **Dev no-op (kept)**: when the active mode's creds are absent, `sendEmail`
  logs the payload and returns `{}` instead of throwing, so offline dev /
  register / reset flows stay exercisable (same fallback the SMS client uses).
- **SES sandbox**: new AWS accounts can only send to verified addresses until
  SES production access is granted (~24h review); the `From` domain must be
  SES-verified.

### 14. SMS provider facade: SSL Wireless (default) + MDL fallback
`sendSms`/`sendSmsBatch` in [`src/lib/sms/client.ts`](src/lib/sms/client.ts) are
a **stable facade** — call sites never change. The wire protocol is delegated
to the provider chosen by `SMS_PROVIDER` (default `ssl`; `mdl` is a one-env
rollback) via [`provider.ts`](src/lib/sms/provider.ts). The facade owns Unicode
detection, segment estimation, the dev no-op, body-grouping, and input-order
result shaping; providers ([`providers/ssl.ts`](src/lib/sms/providers/ssl.ts),
[`providers/mdl.ts`](src/lib/sms/providers/mdl.ts)) own only the HTTP.

**SSL Wireless iSMS Plus v3** (`https://smsplus.sslwireless.com/api/v3`, JSON
POST, `api_token`+`sid` auth — **the request IP must be whitelisted** or every
call returns `status:"FAILED"`). `sendSmsBatch` partitions a cohort: same-body
groups → `/send-sms/bulk` (≤100 msisdn/call); unique/personalized bodies →
`/send-sms/dynamic` (≤100 messages/call — a strict win over MDL's 1-per-call).
Per-recipient status comes from the `smsinfo[]` array (matched back by msisdn,
returned in input order); `reference_id` → our `messageId`. `csms_id`/
`batch_csms_id` are capped at 20 chars (see `makeCsmsId`). A failed chunk halts
the campaign by default (`stopOnFailure`). Chunk size is provider-aware
(`opts.chunkSize ?? provider.maxBatch`), so the outbound script auto-uses 100
under SSL / 20 under MDL with no change.

**MDL fallback** (`SMS_PROVIDER=mdl`): GET with up to **20** numbers per
`contactNumbers` CSV sharing one `textBody`, sequential, halt-on-failure. No
per-recipient status and no dynamic endpoint, so personalized bodies degrade to
1-per-call. A 3,237-doctor shared-body campaign is ~33 calls under SSL (100/call)
vs ~165 under MDL (20/call).

### 15. EMR bundling is manual in Sprint A
The "free Shafa EMR account" perk is a manual ops flow — no API integration,
no SSO. New registrations set `User.emr.seatStatus: 'pending'`. The admin
queue at [`/admin/emr-queue`](src/app/admin/emr-queue/page.tsx) lets ops paste
the EMR-side email after provisioning, which flips the row to `'ready'` and
the doctor dashboard banner. When the real EMR API lands, replace
`markEmrReadyAction` with a real provisioning call — schema stays the same.

### 16. Registration uses a server-side `regDraft` subdoc for two-step OTP
[`startRegistrationAction`](src/server/actions/auth.ts) stashes the
registration payload (BMDC, name, **selfie key + sha256/size/mime**, claim slug)
in `User.regDraft` and sends an OTP. [`completeRegistrationAction`](src/server/actions/auth.ts)
re-validates the OTP, then atomically materializes Doctor + ClaimRequest
from `regDraft` (minting the selfie `File` doc from the stashed metadata — no
S3 re-read) and clears it. **An abandoned registration (OTP never
verified) leaves no half-bound profile** — the `regDraft.expiresAt` field
gates materialization, and the User row is harmless without an attached
Doctor.

### 17. S3 uploads are server-side, credential-by-`NODE_ENV`, two-bucket
A TypeScript port of `shafa-monorepo/apps/api`'s S3 service (the two apps can
share one S3 setup). Rules that will bite if forgotten:
- **All uploads stream server-side** through a Server Action → [`uploadBufferToS3`](src/lib/s3/s3-service.ts) (SSE-AES256) → authoritative `File` doc. The old browser presigned-PUT path is **gone**. Because files now pass through Server Actions, [next.config.ts](next.config.ts) raises `experimental.serverActions.bodySizeLimit` to `12mb`.
- **Credentials resolve strictly by `NODE_ENV`** in [`getS3()`](src/lib/s3/client.ts): `production` → cross-account STS role (`AWS_ASSUME_ROLE_ARN` + `AWS_S3_EXTERNAL_ID`, base creds from the ECS task role via the default chain); any other env → static keys (`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`). `getS3()` returns `null` when the selected mode's creds are absent → actions surface a "not configured" error (no silent dev no-op — uploads genuinely require S3).
- **Two buckets** ([`buckets.ts`](src/lib/s3/buckets.ts)): `AWS_PUBLIC_BUCKET_NAME` (profile/cover photos → stable region-qualified URL, so SSR/OG/`next/image` keep working) and `AWS_PRIVATE_BUCKET_NAME` (identity docs — selfie, verification — **read only via presigned GET**). Public falls back to `S3_BUCKET`; the **private bucket has no fallback** (selfie/verification uploads need it set, including in local dev).
- **`File`-doc persistence** via [`createFileDoc`](src/lib/s3/file-doc.ts). Admin claim review reads private objects through `getPresignedUrl` (inline disposition) in [admin.ts](src/lib/db/queries/admin.ts) — never reconstruct an S3 URL client-side.
- **Loose model casts**: the deliberately-untyped `Model<unknown>` exports are reached via `(X as unknown as Loose)` ([`loose.ts`](src/lib/db/models/loose.ts)) — **not** the old `{ method: Function }` shape (which trips `@typescript-eslint/no-unsafe-function-type`).
- **ESLint**: `no-explicit-any` is off for `tests/**` + `scripts/**`; `no-unused-vars` ignores `^_`-prefixed bindings (see [eslint.config.mjs](eslint.config.mjs)). New AWS env vars are in `.env.example`.

### 18. Contact is private by default + WhatsApp appointment is opt-in
[`ContactSchema`/`DoctorSchema`](src/lib/db/models/Doctor.ts) carry
`privacyHidePhone` + `privacyHideEmail` — both **default `true`** (a doctor opts
*in* to showing contact) — and `whatsappAppointmentEnabled` (default **`false`**)
which gates the "Chat on WhatsApp" appointment button on the public profile. All
three are enforced at **every** public surface, not just the page:
- the profile-page conditionals ([`[slug]/page.tsx`](src/app/(public)/[slug]/page.tsx)),
- the **FHIR mapper** ([practitioner.ts](src/lib/fhir/practitioner.ts)) filters
  `telecom` by the flags, so `/api/v1/doctors[/slug]` never leak hidden contact,
- the dashboard + admin contact forms ([contact-form.tsx](src/app/(dashboard)/dashboard/profile/contact-form.tsx))
  persist them via `updateProfileContactAction` / `adminUpdateProfileContactAction`.

The WhatsApp button never falls back to a *hidden* public phone (no `wa.me`
leak). Pre-production: a fresh seed/reseed materializes docs with the
hidden-by-default schema, so no data migration is needed.
**Chamber/facility phone numbers** (JSON-LD, `ChamberCard`) are intentionally
**not** gated — they're clinic lines, not personal contact.

### 19. Chamber location key is `district` (renamed from `city`) + dropdowns
`Doctor.chambers[].district` (was `city`; it always *held* a district) is the
canonical 64-district location query key — indexed `{"chambers.district": 1}`
and powering `/search?district=`, `/[specialty]/[district]`, the homepage stats,
and the sitemap combos. The embedded subdoc now matches the separate `Chamber`
catalog model, which already used `district`. **Division + district are
dropdowns** in the shared dashboard/admin chamber editor
([chambers-editor.tsx](src/app/(dashboard)/dashboard/chambers/chambers-editor.tsx)),
sourced from [`src/lib/geo/bd-districts.ts`](src/lib/geo/bd-districts.ts) (8
divisions, 64 districts, `divisionForDistrict`/`canonicalizeDistrict`); picking a
division filters the district list, and a legacy non-canonical value stays
selectable so editing never silently rewrites it. The public REST API accepts
`?district=` with a **deprecated `?city=` alias**. The **FHIR output is
unchanged** — `address.city` is still emitted (now sourced from
`chamber.district`), so the EMR seam stays stable. Pre-production: a drop +
reseed adopts the rename — the ingestion writers (`seed-unified.ts`,
`scripts/lib/providers/*`) emit `district` directly, so no data migration is
needed. When renaming chamber fields, always update those writers too — they
write the embedded subdoc and Mongoose `required` would fail a stale key at save.

### 20. Two verification axes + the "blue tick" + name binding
A profile has **two independent verifications**, each with its own dashboard
card, request model, and admin queue — never conflate them:
- **BMDC** (professional) → `Doctor.bmdcVerified`, via `ClaimRequest` +
  [`/admin/verifications`](src/app/admin/verifications/page.tsx). Approval also
  flips `User.approved` (the **sign-in gate**).
- **Account / identity** (Gov photo ID + legal name) → `Doctor.nidVerified`, via
  the separate [`IdentityVerificationRequest`](src/lib/db/models/IdentityVerificationRequest.ts)
  model + [`/admin/account-verifications`](src/app/admin/account-verifications/page.tsx).
  Approval **never** touches `User.approved` — keep the identity flow off the
  login gate.

`verificationLevel` is a **derived** field, never set ad-hoc — always recompute
via [`computeVerificationLevel(bmdc, nid)`](src/lib/utils/verification.ts):
both→`fully_verified`, bmdc→`bmdc_verified`, nid→`identity_verified`,
neither→`unverified`. The **blue "Verified" tick** = `fully_verified` (both
axes); partial states show their own chip. The dashboard card for each axis
hides its form based on the doctor's **own flag** (`bmdcVerified`/`nidVerified`),
not on a stray pending request — that was the original BMDC bug.

**Name binding (will bite if forgotten):** account approval sets the profile
`name.first`/`last` to the verified NID legal name, locks the public
`name.displayName` to `prefix + first + last`, and snapshots `Doctor.legalName
{first,last}`. Any later edit of first/last **revokes** identity verification.
This is enforced by the pure [`resolveVerifiedNameUpdate`](src/lib/utils/verification.ts),
which **must** be called from every action that writes the name — currently
both [`updateProfileBasicAction`](src/server/actions/doctor.ts) (doctor) and
[`adminUpdateProfileBasicAction`](src/server/actions/admin-doctor.ts) (admin). A
prefix-only change does not revoke. New name-write paths must route through it.

**Admin override:** ops can set either axis directly from
[`/admin/doctors/[slug]/edit`](src/app/admin/doctors/[slug]/edit/page.tsx) (the Verification
card → [`adminUpdateVerificationAction`](src/server/actions/admin-doctor.ts)) — no
request/queue — for profiles created on a doctor's behalf. It sets `bmdcNumber` + the two
flags and recomputes the level. **Granting identity requires uploading a Gov photo ID**
(`adminUploadIdentityDocAction` → private bucket → stored on `Doctor.identityDocumentFileId`,
shown back as a presigned "view" link); it then snapshots the **current** profile name as the
`legalName` binding and locks the display name. It deliberately does **not** touch
`User.approved` — login stays gated by the BMDC claim queue.

On the **public profile** the badge is click-to-explain:
[profile-header.tsx](src/components/profile/profile-header.tsx) renders
[`VerifiedBadgeExplainer`](src/components/profile/verified-badge-explainer.tsx) — a
client popover that breaks down the BMDC + identity state for that profile — instead of
the bare `VerifiedBadge`. The badge stays **static everywhere else** (admin list, search
cards, home, dashboard), so only the public surface pays for the client island.

---

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Next dev server with Turbopack |
| `npm run build` | Production build with `output: 'standalone'` |
| `npm start` | Run the production build |
| `npm run seed` | Bootstrap mode: upsert admin + 36-specialty catalog. **Idempotent — no drops, no fake doctors.** Refuses NODE_ENV=production. |
| `npm run seed -- --source=popular-diagnostic [--limit=N] [--dry-run]` | Ingest the Popular Diagnostic dump in `data/popular-diagnostic/` as unclaimed profiles. Idempotent (no drops). |
| `npm run outbound -- --campaign=<id> --template=<id> [--cohort=k=v,...] [--limit=N] [--dry-run]` | Bulk SMS acquisition campaign via the active provider (`SMS_PROVIDER`). Honors per-provider batching (SSL bulk+dynamic ≤100, MDL ≤20). Cohort filter is `--cohort=district=Dhaka,...`. |
| `npm test` | Run the Vitest suite (no DB required) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run format` | Prettier (writes) |

### Default seed credentials
- Admin: `admin@doctor.id.bd` / `ChangeMe!2026` (or the first email in `ADMIN_EMAILS`). Login at `/auth/admin/login`. Upserted with `approved: true` so the new-doctor approval gate doesn't trap them.
- 36 specialties (Cardiology, Gynecology, …, Nutrition & Dietetics) upserted by slug. Re-running never flips a manually-deactivated specialty back to active.
- **No fake doctor profiles.** The default seed is purely a bootstrap. To populate doctors, run `npm run seed -- --source=popular-diagnostic` — that ingests the ~3,237 real BD doctors in `data/popular-diagnostic/` (claim flow binds via seeded phone, not BMDC#).

The Atlas dev URI in [`.env.local`](.env.local) was pasted in chat —
**rotate before sharing the repo broadly**.

See [`doc/getting-started.md`](./doc/getting-started.md) for a step-by-step
onboarding flow including local Mongo options and credential bootstrapping.

---

## Known deferrals (intentional, not bugs)

These are documented stub surfaces — if the user asks for them, they're not
finished yet, but the integration seam exists:

- **WhatsApp Business API**: explicitly OUT of Sprint A. A.8 ships SMS-only. WhatsApp is a Sprint B add — gateway approval is 2–4 weeks.
- **SMS delivery webhook**: `OutboundMessage.deliveredAt` is reserved but never populated. SSL Wireless's public v3 docs expose no delivery-report webhook or status-query endpoint; if/when one is provisioned, add `POST /api/webhooks/sms` to fill it in. (Same gap existed on MDL.)
- **SSL secure OTP endpoint** (`/secure/otp-sms`, HMAC-SHA256 + AES-256-CBC): OTP currently ships via the standard `/send-sms` (the trust boundary is our hashed, TTL'd, rate-limited OTP state, not the channel). The secure endpoint is a future hardening option — add a `sendSecureOtp` provider method behind an env flag; the auth actions already centralize OTP send through `sendSms`, so no call-site change.
- **MDL retained as fallback**: the legacy MDL gateway stays wired behind `SMS_PROVIDER=mdl` for a one-env rollback if SSL onboarding (IP whitelist, sender-id approval) slips. Remove it once SSL is proven in production.
- **Real EMR API integration**: A.5 ships the manual queue. The "Open EMR" SSO + provisioning API is deferred until the EMR team's endpoint contract lands.
- **Image cropper**: `react-easy-crop` is installed but not yet wired into [`PhotoUploader`](src/app/(dashboard)/dashboard/photos/photo-uploader.tsx). Uploads happen at the file's natural dimensions.
- **BMDC verification automation**: admin reviews uploaded certificates manually — no public BMDC API exists.
- **Email change**: admin-only in MVP (no self-serve UI).
- **Self-serve doctor account recovery**: a doctor who loses access to their phone has no self-serve path. Admin support handles. Document in any UX that promises "log in again on a new phone".
- **Soft delete grace period**: `softDeleteAccountAction` sets `deletedAt` and unpublishes the profile. A 30-day-grace hard-delete job is referenced in the README but not implemented.
- **Lighthouse + axe a11y audit**: deferred to staging post-merge.
- **i18n catalog**: structure in place via `next-intl`; only English shipped.
- **District canonicalization**: imported chambers may carry non-canonical district spellings ("Chittagong" vs "Chattogram"). `canonicalizeDistrict()` + the alias table in [bd-districts.ts](src/lib/geo/bd-districts.ts) can drive a follow-up normalization migration; the editor dropdown tolerates legacy values meanwhile (#19).

---

## How to make good changes here

- **Read the plan first**: [`.claude/plans/`](./.claude/plans/) explains *why* the architecture is the way it is. The progress file ([`.claude/progress/mvp-progress.md`](./.claude/progress/mvp-progress.md)) is the authoritative status board — update it in the same commit that completes a step.
- **Don't add new dependencies casually**: the brief is strict about the tech stack. Mongoose, NextAuth v5, Tailwind v4, shadcn-style (copied, not packaged), Zod, `@react-pdf/renderer`, SMS via plain `fetch` (SSL Wireless / MDL — no SDK), `@aws-sdk/{client-s3,s3-request-presigner,credential-providers,client-sesv2,client-dynamodb,lib-dynamodb}`. Adding e.g. React Query or a different ORM needs user approval.
- **Don't introduce client-side state libraries**: React Server Components + Server Actions are the default. Client components are for interactivity only.
- **Don't bypass the Server Action pattern**: even one-line updates should route through a Server Action with auth + Zod + ownership check.
- **Don't write FHIR mapping inline**: it goes through [`lib/fhir/practitioner.ts`](src/lib/fhir/practitioner.ts).
- **Don't break SEO on `/[slug]`**: the public profile is the product's marketing surface. SSR, JSON-LD, OG meta, and `metadataBase` must stay intact.
- **Don't bypass `sendSmsBatch` for outbound**: any cohort-scale send must go through the batcher so the active provider's per-call batching rules are honored. Don't call a provider directly — go through the `sendSms`/`sendSmsBatch` facade.
- **Don't reintroduce `chambers[].city`**: the chamber location key is `district` (#19). Source it from [`bd-districts.ts`](src/lib/geo/bd-districts.ts); never hard-code a city/district free-text input.
- **Run `npm test` + `npm run typecheck` + `npm run build` + `npm run lint`** before declaring a change done. All are fast (<90s combined) and currently green (467 tests, lint 0/0).

---

## Quick references

- **Getting started**: [`doc/getting-started.md`](./doc/getting-started.md) ← new devs start here
- Roadmap: [`.claude/plans/60-days-product-rodemap.md`](./.claude/plans/60-days-product-rodemap.md)
- Sprint A engineering plan: [`.claude/progress/60-days-sprint-a-tasks.md`](./.claude/progress/60-days-sprint-a-tasks.md)
- MVP architectural plan: [`.claude/plans/mvp-plan.md`](./.claude/plans/mvp-plan.md)
- Progress board: [`.claude/progress/mvp-progress.md`](./.claude/progress/mvp-progress.md)
- README (human-facing): [`README.md`](./README.md)
- Env template: [`.env.example`](./.env.example)
- Dockerfile: [`Dockerfile`](./Dockerfile)
- Docker Compose (local Mongo fallback): [`docker-compose.yml`](./docker-compose.yml)
