# Sprint A — Engineering Tasks (Days 1–30)

> **Owner:** Engineering
> **Goal:** 1,500 claimed profiles by Day 30 (en route to 5,000 by Day 60)
> **Source product roadmap:** [`.claude/plans/60-days-product-rodemap.md`](../plans/60-days-product-rodemap.md)
> **Repo state at sprint start:** MVP complete, 36 Vitest tests green, prod build green, 50 seeded profiles, 0 claims. A `File` model has been introduced; `Doctor.photo` now references it.

---

## Execution rules (non-negotiable)

1. **ONE feature at a time, end-to-end.** Schema → Backend → Frontend → Tests → Docs. Acceptance checklist must be 100% green before starting the next feature.
2. **If blocked, STOP and ask.** Every feature lists explicit STOP-and-ask triggers. Do not improvise around them — especially around external integrations.
3. **Schema migrations are additive only.** No renames, no removes — preserves multi-tenant `ownerId` authorization (see [CLAUDE.md §4](../../CLAUDE.md)).
4. **Edge safety preserved.** Auth code obeys the edge/node split (CLAUDE.md §1). Anything DB/native goes in `lib/auth/config.ts`, never `edge-config.ts`.
5. **Server Action canonical pattern** (CLAUDE.md §2): `auth()` → `Zod.safeParse` → ownership via `ownerId === session.user.id` → Upstash rate-limit → mutate → `revalidatePath` → `{ ok, error? }`. Never throw to client.
6. **Per feature, run before declaring done:** `npm test`, `npm run typecheck`, `npm run build`. All three green. Update `.claude/progress/mvp-progress.md` with a ✅ for the feature.

---

## Confirmed engineering choices (locked)

1. **PDF library** (A.2): `@react-pdf/renderer` — JSX-based, Next.js-friendly.
2. **Feature sequence:** dependency-driven — Day-0 fixes → A.1 → A.7 → A.6 → A.4 → A.2 → A.3 → A.5 → A.8.
3. **SMS gateway: MDL** (in-house axios GET wrapper). Env vars: `MDL_SMS_API_BASE_URL`, `MDL_SMS_API_KEY`, `MDL_SMS_API_SENDER_ID`. Params per call: `apiKey`, `senderId`, `contactNumbers`, `textBody`, `type`, `label="transactional"`. Error response shape: `{ status: "FAILED", message }`.
4. **WhatsApp Business API** — OUT of Sprint A scope. A.8 ships SMS-only.
5. **EMR bundling (A.5)** — manual, not integrated. Engineering captures intent + surfaces status; ops creates EMR accounts by hand and emails credentials. No SSO, no provisioning API in Sprint A.
6. **Seed source (A.1)** — Popular Diagnostic JSON dump on disk at [`data/popular-diagnostic/`](../../data/popular-diagnostic) (3,237 detail JSONs + 3,232 photos + `meta.json`). More hospital networks added as additional source files via the same per-provider normalizer pattern. **No BMDC scrape** in Sprint A.

---

## North Star + KPI hooks

| KPI (from roadmap §5) | Sprint A feature(s) that move it |
|---|---|
| Total Claimed Profiles | A.1 (supply), A.4 (mechanism), A.8 (engine) |
| Daily Claims (by source) | A.4 attribution, A.8 short-link tracking |
| Claim-to-Active-7d % | A.2 Rx pad (first-week-win), A.5 EMR |
| Rx Pads Generated | A.2 |
| Appointment Requests Delivered | A.3 |
| EMR Seats Activated | A.5 (manually marked by ops) |

**Day-30 target:** 1,500 claims · 1,200 Rx pads · 300 EMR seats (manually provisioned) · 200 appointment requests · 24h verification SLA holding.

---

## Sprint calendar

| Days | Feature | Owner | Checkpoint |
|---|---|---|---|
| 0 | **Day-0 pre-sprint fixes** | Backend | Day 0: `files.ts` cleaned, `PhotoSchema` aligned, all tests green |
| 1–3 | **A.1** — Popular Diagnostic JSON ingestion | Backend | Day 3: `npm run seed -- --source=popular-diagnostic` inserts 3,237 unclaimed profiles |
| 4–5 | **A.7** — 24h Verified Badge SLA | Backend + Admin UI | Day 5: admin queue sorts by SLA breach; badge visible everywhere |
| 6–9 | **A.6** — Chambers Editor (full) | Full-stack | Day 9: doctor edits chambers + schedule end-to-end |
| 10–13 | **A.4** — SMS Magic-Link Claim (MDL) | Backend + Auth | Day 13: claim-via-SMS works against MDL staging |
| 14–18 | **A.2** — Rx Pad PDF generator | Full-stack | Day 18: A5 PDF downloads with photo + QR + identity |
| 19–22 | **A.3** — Appointment Request Inbox | Full-stack | Day 22: patient form → SMS to doctor → inbox row |
| 23–26 | **A.5** — Free Shafa EMR bundling (manual) | Backend + Admin UI | Day 26: claim → "pending" banner → admin marks "ready" → "ready" banner |
| 27–30 | **A.8** — Bulk Outbound (SMS-only via MDL) | Backend + Ops UI | Day 30: 1,500+ outbound sent, claim funnel attributed |

**Parallel ops work (CEO-led, not engineering's gate):** MDL credentials Day 1, EMR ops capacity confirmation Day 22, field-rep hiring Day 15, conference booking Day 15.

---

## Day 0 — Pre-Sprint fixes

The new `File` model and updated `PhotoSchema` introduced several issues that needed fixing before A.1 could safely run. **All five are now complete (Day 0 finished):**

| Fix | File | Status |
|---|---|---|
| ESM exports, HMR-safe model, PascalCase `"File"`, add `DOCTOR` to enum, drop unused imports, defaults on title/desc, useful compound indexes | [`src/lib/db/models/files.ts`](../../src/lib/db/models/files.ts) | ✅ |
| Add enum on `visibility`, require `s3Bucket`, update `file.ref` → `"File"` | [`src/lib/db/models/Doctor.ts`](../../src/lib/db/models/Doctor.ts) (PhotoSchema) | ✅ |
| Export `File` + constants from model barrel | [`src/lib/db/models/index.ts`](../../src/lib/db/models/index.ts) | ✅ |
| Add `tests/file-model.test.ts` (5 assertions) | [`tests/file-model.test.ts`](../../tests/file-model.test.ts) | ✅ |
| Add CLAUDE.md §12 documenting PhotoSchema/File denormalization rule | [`CLAUDE.md`](../../CLAUDE.md) | ✅ |
| `npm run typecheck` + `npm test` green | — | ✅ (36/36) |

---

## A.1 — Popular Diagnostic JSON ingestion (Days 1–3)

**Goal.** Turn the 3,237 doctor JSON detail files + 3,232 photos already on disk into unclaimed `Doctor` docs so A.8 outbound has someone to message.
**KPI.** Pre-claim supply (input to Daily Claims funnel).

**Dependencies.**
- Code: Day-0 fixes (`File` model), `Doctor` model, `generateSlug()`, existing `seed.ts` structure, S3 presign helper.
- Ops: AWS S3 + SES creds populated in `.env.local` (otherwise photo upload silently falls back to external URLs and SES register flows skip — both acceptable for dev).
- Data: already downloaded to `data/popular-diagnostic/` — no external dep.

**Schema changes.** Add to `Doctor` model (additive, no migration risk):
- `sourceProvider: string` (default `null`, indexed)
- `sourceProviderId: string` (default `null`)
- `sourceUrl: string` (default `null`)
- Compound index `{ sourceProvider: 1, sourceProviderId: 1 }` unique sparse — guarantees idempotent upserts.

**Backend tasks.**
1. New module [`scripts/lib/providers/popular.ts`](../../scripts/lib/providers/popular.ts) exporting:
   - `loadPopularIndex(): Promise<number[]>` reads `data/popular-diagnostic/doctor-ids.json`.
   - `loadPopularDetail(id: number): Promise<PopularDetail>` reads `details/<id>.json`.
   - `normalizePopularDoctor(detail, ctx): NormalizedDoctor` — pure function. Maps:
     - `name`: `parseDoctorName(detail.name)` returns `{ prefix, first, last, displayName }`. Recognize `Prof. Dr.`, `Asst. Prof. Dr.`, `Assoc. Prof. Dr.`, `Dr.`, `Brig. Gen. (Retd.) Dr.`, `Major (Retd.) Dr.`.
     - `contact.publicPhone`: `normalizeBdPhone(detail.mobile)` — adapter from A.4 (Day 10); for Day 1–3 use a local stub in this module and refactor to shared lib in A.4.
     - `contact.publicEmail`: pass-through (often null).
     - `gender`: lowercase `"male"|"female"`, fallback `"prefer_not_to_say"`.
     - `bio`: `detail.experience_summery` truncated to 2000 chars.
     - `qualifications[]`: parsed from `detail.degree` (comma-split + best-effort `degree` field only, no institution/year inferred).
     - `specialties[]`: each `detail.specialists[].specialist_name` looked up against `Specialty` collection by case-insensitive name. Unmatched names get logged + appended to `subSpecialties`.
     - `chambers[]`: from `detail.branches[]`. Each: `name = "Popular Diagnostic — " + branch.name`, `address = branch.map`, `city = "Dhaka"`, `division = "Dhaka"`, `area = branch.name`, `phone = branch.phone`, `schedule = []` on non-primary; full schedule from `detail.schedule` on the primary (first) branch. (Popular's schedule isn't branch-keyed — flag for review in stats.)
     - `photo`: handled separately by the upload helper below.
2. Photo upload helper (in same module) `uploadPopularPhoto(id, doctorId, adminId)`:
   - Looks for `data/popular-diagnostic/photos/<id>.{jpg,png,jpeg}` (try common extensions).
   - If S3 configured: upload via direct PutObject (NOT presign — that's browser-side). Compute sha256. Create `File` doc with `linkedEntityType: 'doctor'`, `linkedEntityId: doctorId`, `uploadedBy: adminId`, `category: 'doctor_profile_photo'`, `visibility: 'public'`, `securityClass: 'public_asset'`, plus `originalFileName`, `finalFileName`, `mimeType`, `ext`, `sizeBytes`, `sha256`, `s3Bucket`, `s3Key`.
   - Return `{ file: File._id, url: publicUrl, s3Bucket, s3Key, visibility: 'public' }` for the doctor's PhotoSchema.
   - If S3 NOT configured: skip File doc, return `{ file: null, url: detail.image, s3Bucket: '', s3Key: '', visibility: 'public' }`. (`s3Bucket` becomes required-but-empty — this is the only legacy path; document.) **Wait — `s3Bucket` is required.** Without S3, set both `s3Bucket` and `s3Key` to a sentinel like `legacy-external` so validation passes; document this in the run summary.
3. Extend [`scripts/seed.ts`](../../scripts/seed.ts):
   - Parse argv flags: `--source=popular-diagnostic`, `--limit=N`, `--dry-run`. Default behavior (no flag) unchanged.
   - When `--source=popular-diagnostic`:
     - **Do NOT drop collections.** Only the existing 50-doctor seed path drops.
     - Ensure bootstrap admin User exists (create if missing — reuse existing logic).
     - Iterate doctor IDs (cap at `--limit`); for each: normalize → upsert by `(sourceProvider, sourceProviderId)` → upload photo + create File doc → set `Doctor.photo`.
     - On duplicate slug, append `-<sourceProviderId>` suffix; retry once.
     - Print final stats: `{ totalSeen, inserted, updated, skippedInvalid, skippedNoSpecialty, photosUploaded, photosSkipped, photosLegacy }`.

**Frontend tasks.** None.

**Tests.**
- `tests/providers/popular.test.ts` — load real fixture `data/popular-diagnostic/details/2094.json`, run through `normalizePopularDoctor`, assert: name parses to `{ prefix: "Prof. Dr.", first: "M.", last: "Nazrul Islam" }` (or similar), gender lowercased, bio truncated, chambers length === 1, primary chamber has schedule.
- `tests/name-parse.test.ts` — exhaustive prefix table: `Prof. Dr.`, `Dr.`, `Asst. Prof. Dr.`, `Assoc. Prof. Dr.`, `Brig. Gen. (Retd.) Dr.`, `Major (Retd.) Dr.`.

**Observability & docs.**
- Run summary printed at end of seed.
- Update `README.md` "Scripts" section to document the new `--source=popular-diagnostic` flag.
- Append to `CLAUDE.md` "Known deferrals" — drop the "50 seeded doctors" line.

**Acceptance criteria.**
- [ ] `npm run seed -- --source=popular-diagnostic --limit=10` inserts 10 doctors with chambers + photos.
- [ ] Rerunning shows `inserted: 0, updated: 10`.
- [ ] All 10 SSR-render at their `/[slug]` URL with photo (S3 or external), at least one chamber visible, "Claim this profile" CTA shown.
- [ ] Full run `--limit=3237` completes in <15 min and counts match `meta.json`.
- [ ] `npm test`, `npm run typecheck`, `npm run build` green.

**STOP-and-ask triggers.**
- >5% of names fail prefix parsing — improve parser before bulk run.
- Specialty match-rate <70% against existing `Specialty` collection — extend the Specialty seed list rather than silently dropping into subSpecialties.
- S3 upload fails for >10% of photos — diagnose creds/permissions before continuing.

---

## A.7 — 24h Verified Badge SLA (Days 4–5)

**Goal.** Reliable 24-hour verification promise + queue admins can hit.
**KPI.** Verified-rate among claimed doctors (downstream retention).

**Dependencies.**
- Code: `ClaimRequest` model, `src/server/actions/verification.ts`, `src/app/admin/verifications/`, `VerifiedBadge`.
- Ops: 0.5 FTE admin reviewer confirmed.

**Schema changes.** [`src/lib/db/models/ClaimRequest.ts`](../../src/lib/db/models/ClaimRequest.ts):
- `slaExpiresAt: Date` (set in `pre('save')` to `createdAt + 24h` on insert only).
- `verifiedAt: Date` (set when status transitions to `approved`).
- Index `{ status: 1, slaExpiresAt: 1 }` for queue sort.

**Backend tasks.**
1. Pre-save hook computes `slaExpiresAt` once on insert.
2. In `src/server/actions/verification.ts`, on approve: set `verifiedAt: new Date()`; on Doctor doc set `bmdcVerified: true`, `bmdcVerifiedAt: verifiedAt`, `verificationLevel: 'bmdc_verified'`.
3. New helper `src/lib/db/queries/admin.ts:listClaimRequestsForAdmin({ bucket })` returning `{ breaching, today, future, approved, rejected }` partition.

**Frontend tasks.**
1. `/admin/verifications` — top-of-page bucket counts; per-row countdown chip (green >12h / amber 6–12h / red <6h or breached).
2. `/dashboard/verification` — "We verify within 24 hours. Submitted: <relative time>." while pending.
3. Surface `VerifiedBadge` consistently on `DoctorCard`, `ProfileHeader` (confirm), and the OG image route (text-only pill, no glyphs per CLAUDE.md §6).

**Tests.**
- `tests/sla.test.ts` — slaExpiresAt computed at insert; bucket partition correct.
- Snapshot test on OG-image element tree including the verified pill.

**Acceptance criteria.**
- [ ] Admin queue defaults to "breaching soonest".
- [ ] Claim made >18h ago renders red.
- [ ] Approving flips `Doctor.verificationLevel` atomically.
- [ ] Badge visible on `/[slug]`, `/search`, OG image.

**STOP-and-ask triggers.**
- Designer requests badge color change — defer; raise separately.

---

## A.6 — Chambers Editor (full) (Days 6–9)

**Goal.** Replace the read-only stub; unlock A.3.
**KPI.** % of doctors with ≥1 chamber + schedule.

**Dependencies.**
- Code: `ChamberSchema` (model + validator both exist), `LeafletLazy`, React Hook Form (installed).

**Schema changes.** None — fields already complete.

**Backend tasks.**
1. New server action `updateChambersAction(input)` in `src/server/actions/doctor.ts`:
   - `auth()` → `ChambersUpdateSchema.safeParse(input)` (max 10 chambers) → `loadMyDoctor()` ownership → enforce single-primary (reject if >1) → atomic `Doctor.findOneAndUpdate({ ownerId }, { $set: { chambers } }, { returnDocument: 'after' })` → `revalidatePath('/' + slug)` + `revalidatePath('/dashboard/chambers')` → `{ ok: true }`.
2. Server-side schedule overlap validator: within one chamber, no two slots on the same `day` may overlap.

**Frontend tasks.**
1. Rewrite [`src/app/(dashboard)/dashboard/chambers/page.tsx`](../../src/app/(dashboard)/dashboard/chambers/page.tsx) with React Hook Form `useFieldArray`.
2. New component `src/components/dashboard/ScheduleEditor.tsx` — 7-day × time-slot grid.
3. Map picker via `LeafletLazy`; click sets coordinates.
4. Mutex `isPrimary` radio group.

**Tests.**
- `tests/chambers.test.ts` — schedule-overlap + single-primary.
- Extend `tests/completeness.test.ts` for chambers contribution.

**Acceptance criteria.**
- [ ] Doctor adds chamber → map-pick coords → Mon–Sat schedule → save → visible on `/[slug]`.
- [ ] Two-primary attempt rejected with clear error.
- [ ] Mobile-usable (no horizontal scroll at 360px).

**STOP-and-ask triggers.**
- Drag-reorder requested — out of scope.

---

## A.4 — SMS Magic-Link Claim (Days 10–13) — MDL gateway

**Goal.** Passwordless claim flow: SMS → claimed profile in 60s.
**KPI.** Claim conversion rate from outbound SMS.

**Dependencies.**
- Code: NextAuth v5 config, Upstash rate-limit factory, env loader.
- Ops: MDL credentials populated (`MDL_SMS_API_BASE_URL`, `MDL_SMS_API_KEY`, `MDL_SMS_API_SENDER_ID`). **Without them, the client logs to console and dev still works** — same pattern as `ses.ts`.

**Schema changes.** [`src/lib/db/models/User.ts`](../../src/lib/db/models/User.ts) — add (secrets `select:false`):
- `phone: string` (E.164 normalized, sparse unique index).
- `phoneVerified: boolean` (default false).
- `smsOtpHash: string` (sha256 of OTP, `select:false`).
- `smsOtpExpiresAt: Date` (`select:false`).
- `smsOtpAttempts: number` (default 0, `select:false`).

**Backend tasks.**
1. Phone normalization `src/lib/utils/phone.ts:normalizeBdPhone(raw): string | null` — E.164 `+880…`; accepts `01XXXXXXXXX`, `+8801…`, `8801…`, whitespace/dashes. (A.1's stub gets replaced with this shared lib.)
2. **MDL SMS client** [`src/lib/sms/client.ts`](../../src/lib/sms/client.ts):
   ```ts
   sendSms({ to: string, body: string, type?: string }): Promise<{ sent: boolean; messageId?: string }>
   ```
   - Implementation: axios GET against `MDL_SMS_API_BASE_URL` with params `{ apiKey, senderId, contactNumbers: to, textBody: body, type: type ?? 'TEXT', label: 'transactional' }`.
   - On MDL's `{ status: "FAILED", message }` response: treat as `{ sent: false }`, log the message.
   - Without creds: log payload to console, return `{ sent: false }`. Same graceful no-op pattern as [`src/lib/email/ses.ts`](../../src/lib/email/ses.ts).
   - Body-length awareness: ASCII 160 / Unicode (Bangla) 70 — log segment count.
3. Env loader [`src/lib/env.ts`](../../src/lib/env.ts) `ServerEnvSchema`: add `MDL_SMS_API_BASE_URL` (URL, optional), `MDL_SMS_API_KEY` (optional), `MDL_SMS_API_SENDER_ID` (optional). Mirror in `.env.example`.
4. Rate-limiters [`src/lib/redis/ratelimit.ts`](../../src/lib/redis/ratelimit.ts):
   - `smsOtpRequestLimiter` — 3/10min/phone.
   - `smsOtpVerifyLimiter` — 5/10min/phone.
5. Server actions in new file `src/server/actions/claim.ts`:
   - `requestSmsOtpAction({ phone, slug })`:
     1. Normalize phone; if invalid → `{ ok: true }` (don't leak).
     2. Apply `smsOtpRequestLimiter`.
     3. Load Doctor by slug; require `isClaimed: false`.
     4. **Phone-as-identity-proxy:** if `Doctor.contact.publicPhone` (normalized) !== entered phone → return `{ ok: true }` (silent no-op). Popular Diagnostic data has no BMDC#; the seeded phone is the binding key.
     5. Upsert User by phone; generate 6-digit OTP; hash with sha256 + `AUTH_SECRET`; store with `smsOtpExpiresAt = now + 10min`; reset attempts.
     6. `sendSms({ to: phone, body: "doctor.id.bd: your code is XXXXXX. Claim: <short-link> ..." })`.
     7. Return `{ ok: true }`.
   - `verifySmsOtpAndClaimAction({ phone, otp, slug })`:
     1. `smsOtpVerifyLimiter`.
     2. Load User by phone (with `+smsOtpHash +smsOtpExpiresAt +smsOtpAttempts`); check not expired; increment attempts; compare hash.
     3. On match: clear OTP, set `phoneVerified: true`, `lastLoginAt: now`.
     4. Find Doctor by slug; atomic update `{ ownerId, userId, isClaimed: true, claimedAt: now, claimRequestedBy: userId }` guarded by `isClaimed: false`.
     5. Sign in via NextAuth `sms-otp` provider (see below).
     6. **Also set A.5 EMR fields:** `emrRequested: true`, `emrSeatStatus: 'pending'` (lands when A.5 schema change is applied; commented out until then).
     7. Return `{ ok: true, redirectTo: '/dashboard?welcome=1' }`.
6. NextAuth custom provider in [`src/lib/auth/config.ts`](../../src/lib/auth/config.ts) (stays in node config, not edge): `id: 'sms-otp'` accepting `{ phone, otp }`, re-validates via DB. JWT callback includes `phone` on the token.

**Frontend tasks.**
1. New route `src/app/auth/claim/page.tsx` (NOT inside `(auth)` group — it's a public claim landing):
   - Step 1: phone input (auto-populated from `?phone=` if present).
   - Step 2: 6-digit OTP input (`autocomplete="one-time-code"`).
   - Step 3: success → `/dashboard?welcome=1`.
2. [`src/app/(public)/[slug]/page.tsx`](../../src/app/(public)/[slug]/page.tsx) — on unclaimed profile, replace "Claim this profile" hint with CTA → `/auth/claim?slug=<slug>`.
3. `/dashboard` — when `?welcome=1`, render top banner: "Welcome! Your profile is claimed. Download your free prescription pad → /dashboard/prescription-pad".

**Tests.**
- `tests/phone.test.ts` — normalization fixtures.
- `tests/sms-otp.test.ts` — hash + expiry + attempt counter; race on simultaneous claim (must reject second).
- `tests/sms-client.test.ts` — no-op without creds; MDL GET params shape (use axios mock).

**Observability & docs.**
- New `src/lib/log.ts` — `{ channel, level, ts, latencyMs }` wrapper. Use channel `sms` here.
- `CLAUDE.md` — new section: "**SMS magic-link is the second auth flow.** Custom Credentials provider id `sms-otp`. Do NOT mix its OTP fields with `resetTokenHash` (password reset)."
- `README.md` — "Claiming a profile" subsection.

**Acceptance criteria.**
- [ ] Without MDL creds, requesting OTP logs to console and flow still completes locally.
- [ ] With creds, real SMS arrives <30s; entering OTP within 10min claims the profile.
- [ ] Wrong-phone attempt against a slug returns generic `{ ok: true }` (no leak).
- [ ] Race claim: second concurrent claim attempt fails atomically.
- [ ] Post-claim, user is logged in on `/dashboard?welcome=1` with `Doctor.ownerId` linked.
- [ ] 4th OTP request in 10min hits the limiter (generic error).

**STOP-and-ask triggers.**
- MDL response shape differs from the snippet provided.
- BD legal hasn't approved the SMS opt-in copy.
- Popular Diagnostic phone matches a User account that already exists for a different doctor — surface as conflict, do not silently relink.

---

## A.2 — Rx Pad PDF generator (Days 14–18)

**Goal.** Highest-pull retention feature: A5 printable identity PDF with QR.
**KPI.** Rx Pads Generated.

**Dependencies.**
- Code: `loadMyDoctor()`, FHIR mapper for identity, photo URL on `Doctor.photo`.
- Ops: designer sign-off on layout.

**Schema changes.** Add `flags: { rxPadGeneratedAt: Date | null, rxPadGenerations: Number }` to `Doctor` (subdoc, default `{ rxPadGenerations: 0 }`).

**Backend tasks.**
1. Add deps: `@react-pdf/renderer` (latest), `qrcode` (server-side QR; `qrcode.react` is DOM-only).
2. New PDF route handler `src/app/(dashboard)/dashboard/prescription-pad/route.ts` — GET → `auth()` + `loadMyDoctor()` → render PDF stream → `Response(stream, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="rx-pad-<slug>.pdf"' } })`. `Cache-Control: no-store`. Atomic `$inc: { 'flags.rxPadGenerations': 1 }` + `$set: { 'flags.rxPadGeneratedAt': now }`.
3. New PDF component `src/components/pdf/RxPad.tsx`: A5 portrait. Header (photo + name + degrees + BMDC#, QR to public profile). Body (chambers list + schedule summary). Footer (Shafa Care wordmark + micro-disclaimer). **No medical content.**
4. New `src/lib/qr/server.ts:renderQrPngDataUrl(text)` using `qrcode.toDataURL` (high error-correction).

**Frontend tasks.**
1. New `src/app/(dashboard)/dashboard/prescription-pad/page.tsx` with preview iframe + Download button. Empty-state when profile incomplete (link to fix specific section).
2. `src/components/layout/dashboard-nav.tsx` — add `{ href: '/dashboard/prescription-pad', label: 'Prescription Pad', icon: FileText }`.

**Tests.**
- `tests/rx-pad-dto.test.ts` — DTO snapshot for fixture doctor.
- `tests/qr.test.ts` — QR data URL is non-empty PNG.

**Acceptance criteria.**
- [ ] Authed doctor with complete profile downloads A5 PDF with photo + identity + chambers + QR.
- [ ] Incomplete profile → friendly empty state.
- [ ] PDF route returns 401 to unauthed.
- [ ] `flags.rxPadGenerations` increments on each download.

**STOP-and-ask triggers.**
- Designer requests Bangla typography or non-A5 size — confirm before adding.
- Doctor wants editable free-text "Rx area" — that's medical UX, defer.

---

## A.3 — Appointment Request Inbox (Days 19–22)

**Goal.** Patient-facing form on every public profile; doctor receives leads via SMS + dashboard inbox.
**KPI.** Appointment Requests Delivered.

**Dependencies.**
- Code: A.4 SMS client, A.6 chambers (form picks a chamber).
- Ops: confirm regulatory/DGHS disclaimer copy.

**Schema changes.** New model `src/lib/db/models/AppointmentRequest.ts`:
- `doctorId: ObjectId ref` (indexed)
- `chamberId: string` (chamber subdoc `_id`)
- `patientName: string` (1–80)
- `patientPhone: string` (E.164)
- `preferredDate: Date`
- `preferredTimeWindow: 'morning'|'afternoon'|'evening'`
- `reason: string` (max 300, sanitized)
- `status: 'pending'|'seen'|'booked'|'rejected'`
- `notifiedAt: Date` (nullable)
- `ipHash: string` (sha256 of IP + `AUTH_SECRET`)
- Indexes `{ doctorId: 1, createdAt: -1 }`, `{ status: 1, createdAt: -1 }`.

**Backend tasks.**
1. Validators `src/lib/validators/appointment.ts:CreateAppointmentSchema` (with honeypot `website` field that must be empty).
2. Public action `src/server/actions/appointment.ts:createAppointmentRequestAction`:
   - No auth. Honeypot first. Rate-limit 3/hour/IP + 3/hour/phone. Zod-validate. Phone normalize. Sanitize reason (strip HTML, cap 300).
   - Insert; `sendSms` to `Doctor.contact.publicPhone` (preferred channel for Sprint A); set `notifiedAt`.
   - Return `{ ok: true, requestId }`.
3. Doctor action `updateAppointmentRequestStatusAction({ requestId, status })` — `auth()` + ownership via `loadMyDoctor()` + revalidate.

**Frontend tasks.**
1. New `src/components/profile/AppointmentRequestForm.tsx` — form: name, phone, chamber select, preferredDate (today+30d max), timeWindow radio, reason textarea, honeypot.
2. Insert form card on `/[slug]` sidebar (between WhatsappButton and ShareButton). Only renders if `doctor.chambers.length > 0 && doctor.isClaimed`.
3. New `src/app/(dashboard)/dashboard/requests/page.tsx` — inbox with status filter chips. Row actions: "Mark seen", "WhatsApp reply" (deep-link `https://wa.me/<e164>?text=<prefilled>`).
4. `dashboard-nav.tsx` — add `{ href: '/dashboard/requests', label: 'Requests', icon: Inbox, badge: pendingCount }`.

**Tests.**
- `tests/appointment-validator.test.ts` — honeypot, phone, reason length.
- `tests/appointment-action.test.ts` — ownership on status update.

**Acceptance criteria.**
- [ ] `/[slug]` for claimed+chambered doctor shows the form.
- [ ] Valid submit → inbox row within 5s; SMS logged.
- [ ] Honeypot submit → silent 200, no row.
- [ ] Non-owner cannot update status.

**STOP-and-ask triggers.**
- DGHS disclaimer required — confirm copy before launch.
- Auto-confirmation SMS to patient requested — defer (cost + privacy).

---

## A.5 — Free Shafa EMR bundling (Days 23–26) — manual

**Goal.** Convert claim → EMR trial. Manual provisioning via ops for Sprint A; integration deferred.
**KPI.** EMR Seats Activated.

**Dependencies.**
- Code: A.4 claim flow (the trigger).
- Ops: 48h account-creation SLA confirmed by CEO/ops.

**Schema changes.** [`src/lib/db/models/User.ts`](../../src/lib/db/models/User.ts):
- `emrRequested: boolean` (default `false`).
- `emrSeatStatus: 'pending'|'ready'|'declined'` (default `'pending'` once `emrRequested`).
- `emrAccountEmail: string` (default null — populated by admin).
- `emrReadyAt: Date` (default null).
- `emrDeclinedAt: Date` (default null).

**Backend tasks.**
1. In `verifySmsOtpAndClaimAction` (A.4) and existing `registerAction`: set `emrRequested: true`, `emrSeatStatus: 'pending'` on first claim. **Idempotent** — `emrReadyAt` never overwritten on re-claim (impossible in practice, but code defensively).
2. New admin action `src/server/actions/emr.ts:markEmrReadyAction({ userId, emrAccountEmail })`:
   - `auth()` + require `role === 'admin'`.
   - Zod validate `emrAccountEmail`.
   - Atomic update guarded by `emrSeatStatus: 'pending'` → `'ready'`, set `emrReadyAt: now`, `emrAccountEmail`.
   - `revalidatePath('/dashboard')` for the affected user (can't target — revalidate the whole dashboard layout).
3. Doctor action `declineEmrAction()`:
   - `auth()` → set `emrSeatStatus: 'declined'`, `emrDeclinedAt: now`.
4. Optional: trigger templated email "Your Shafa EMR account is ready" via existing `sendEmail`.

**Frontend tasks.**
1. `/dashboard` banner card (top of overview):
   - If `emrSeatStatus === 'pending'`: "Your free Shafa EMR account is being set up — we'll email credentials within 48 hours. [Don't want EMR?]" link → `declineEmrAction`.
   - If `'ready'`: "Check `<emrAccountEmail>` for your EMR login. Need help? WhatsApp support."
   - If `'declined'`: hide banner.
2. New admin page `src/app/admin/emr-queue/page.tsx`:
   - Table of pending users (claim date asc), columns: name, public email, phone, claimed date, days-since.
   - Per-row form: "Mark as ready" with `emrAccountEmail` input → calls `markEmrReadyAction`.

**Tests.**
- `tests/emr-fields.test.ts` — schema defaults; transition guards (pending → ready, ready cannot revert).
- `tests/emr-actions.test.ts` — role-guard on admin action; idempotency (re-marking ready doesn't move `emrReadyAt`).

**Acceptance criteria.**
- [ ] Claim sets `emrRequested: true`, `emrSeatStatus: 'pending'`.
- [ ] Doctor's dashboard shows "pending" banner.
- [ ] Admin marks ready → doctor's banner flips to "ready" within seconds.
- [ ] Doctor declines → banner hidden; cannot re-request without admin action.

**STOP-and-ask triggers.**
- 48h ops SLA cannot be met — change copy before launch.
- Future: real EMR API endpoint becomes available — defer the integration to Sprint B (this card stays manual).

---

## A.8 — Bulk Outbound (SMS-only via MDL) (Days 27–30)

**Goal.** Acquisition engine. Send personalized SMS to every seeded unclaimed profile.
**KPI.** Daily Claims by Source.

**Dependencies.**
- Code: A.1 (data), A.4 (MDL SMS client + claim flow), A.2 (the Rx-pad magnet in the SMS copy).
- Ops: SMS per-day cap (CEO confirms throughput + cost cap).

**Schema changes.** New model `src/lib/db/models/OutboundMessage.ts`:
- `doctorId: ObjectId ref` (indexed)
- `channel: 'sms'` (literal; field reserved for future channels)
- `templateId: string`
- `body: string` (rendered final text — forensic replay)
- `to: string` (E.164)
- `shortToken: string` (unique 16-char base62)
- `sentAt: Date`
- `deliveredAt: Date` (nullable)
- `clickedAt: Date` (nullable, first-touch only)
- `claimedAt: Date` (nullable; set when the target slug claims via this token)
- `status: 'queued'|'sent'|'delivered'|'failed'|'opted_out'`
- `attempt: number` (default 0)
- Indexes `{ doctorId: 1, sentAt: -1 }`, `{ shortToken: 1 }` unique.

Also new model `src/lib/db/models/OptOut.ts` — `phone: string` unique (E.164). STOP-reply targets get added; outbound skips.

**Backend tasks.**
1. Template engine `src/lib/outbound/templates.ts` — placeholder substitution (`{{firstName}}`, `{{specialty}}`, `{{shortLink}}`); length helpers (160-ASCII / 70-Unicode). Two starter templates: `bn-claim-rx-pad`, `en-claim-rx-pad`.
2. Short-link route `src/app/c/[token]/route.ts` (GET):
   - Lookup `OutboundMessage` by `shortToken`.
   - First-touch only: set `clickedAt: now` if null.
   - 302 to `/auth/claim?slug=<slug>&phone=<phone>`.
3. Outbound script `scripts/outbound.ts`:
   - CLI: `--cohort=city=Dhaka,specialty=Cardiology --limit=N --dry-run`.
   - Iterates `Doctor.find({ isClaimed: false, status: 'published', ...filters })`.
   - Per doctor: pick best phone (`contact.publicPhone` → fallback `chambers[0].phone`); normalize; check `OptOut`; pick template (Bangla preferred for BD names); generate `shortToken`; render body with `{{shortLink}} = https://doctor.id.bd/c/<token>`; `sendSms`; persist `OutboundMessage`; respect per-day cap; exponential backoff on failure.
   - Idempotency by `(doctorId, templateId)` within 7 days — don't re-send.
4. Attribution in `verifySmsOtpAndClaimAction` (A.4): if request URL had `?t=<shortToken>` (added by the short-link redirect via query), set `OutboundMessage.claimedAt: now`.
5. **Webhook (if MDL supports it)** — `POST /api/webhooks/sms` updating `deliveredAt` + `status`. HMAC-verified with `MDL_SMS_WEBHOOK_SECRET`. If MDL doesn't expose webhooks, skip — `deliveredAt` stays null and reporting uses `sent` as the success signal.
6. Manual opt-out: simple admin form to add a phone to `OptOut` when a doctor calls/messages to opt out. (Automatic STOP-reply requires MDL inbound — defer unless trivial.)

**Frontend tasks.**
1. New admin page `src/app/admin/outbound/page.tsx`:
   - Cohort builder: city / specialty / source provider filters; preview sample 10 doctors.
   - Template picker; render-preview for 3 sample doctors.
   - "Send" button — disabled until ops confirms count + cost.
   - Counters: queued / sent / delivered / clicked / claimed (last 24h).

**Tests.**
- `tests/template.test.ts` — placeholder substitution + length budget (ASCII vs Unicode).
- `tests/shortlink.test.ts` — first-click only sets `clickedAt`.
- `tests/optout.test.ts` — outbound skips opt-out phones.

**Acceptance criteria.**
- [ ] Dry-run cohort of 10 produces 10 rendered messages, 0 sent.
- [ ] Real run of 10 sends via MDL; attribution captures clicks + claims in `/admin/outbound`.
- [ ] Opt-out skip works.
- [ ] No double-send within 7d (idempotency).

**STOP-and-ask triggers.**
- MDL daily budget exhausted before run — escalate, do not split-batch silently.
- MDL webhook not available — accept the gap (no `deliveredAt`); document.

---

## Cross-cutting infrastructure

### Env vars (added incrementally as features land)
Append to `src/lib/env.ts` `ServerEnvSchema` + `.env.example`:
```
# A.4 + A.8 — MDL SMS
MDL_SMS_API_BASE_URL=
MDL_SMS_API_KEY=
MDL_SMS_API_SENDER_ID=
MDL_SMS_WEBHOOK_SECRET=   # optional, A.8 webhook if MDL supports it
```
All optional in dev — modules log to console gracefully when absent (same as `ses.ts`, see CLAUDE.md §13).

**Not added in Sprint A:** WhatsApp Business API, EMR provisioning / SSO secrets (deferred).

### Rate-limiters (added as features land)
In `src/lib/redis/ratelimit.ts`:
- `smsOtpRequestLimiter` — 3/10min/phone (A.4).
- `smsOtpVerifyLimiter` — 5/10min/phone (A.4).
- `appointmentRequestLimiter` — 3/hour/IP + 3/hour/phone (A.3).
- `outboundDailyBudgetLimiter` — global per-day cap (A.8).

### Structured logging
`src/lib/log.ts` lands with A.4. Channels in use: `sms` (A.4/A.8), `appointment` (A.3), `emr` (A.5), `seed` (A.1).

### `/admin/metrics` data hooks
Sprint B owns the full billboard (B.8). Sprint A adds the counters / timestamps the rollup needs:
- `Doctor.flags.rxPadGeneratedAt` + `rxPadGenerations` (A.2).
- `AppointmentRequest` collection (A.3).
- `User.emrSeatStatus` + `emrReadyAt` (A.5).
- `OutboundMessage` collection (A.8).

### CLAUDE.md updates at each feature
- A.1 — drop "50 seeded doctors" line; add Popular Diagnostic ingestion note.
- A.4 — add "SMS magic-link is the second auth method" + MDL gateway constraint.
- A.6 — flip Chambers editor from deferred to shipped.
- A.7 — drop "manual admin review" deferral.
- A.5 — add "EMR provisioning is manual in Sprint A" constraint.
- A.8 — add outbound + opt-out + MDL budget constraint.

---

## Open ops decisions tracker

| # | Decision | Engineering needed-by | Status | Blocks |
|---|---|---|---|---|
| 1 | MDL SMS credentials populated | **Day 10** | open | A.4, A.8 |
| 2 | SMS per-day budget cap | **Day 27** | open | A.8 bulk run |
| 3 | EMR ops capacity for 48h SLA | **Day 22** | open | A.5 launch copy |
| 4 | Field reps (5×) | n/a (ops only) | open | Sprint B |
| 5 | Conference sponsorships | n/a (ops only) | open | Sprint B |
| 6 | Designer & translator | **Day 14** | open | A.2 layout polish |

If a row's status is `open` past its needed-by date, the corresponding feature **stops** and the team escalates.

---

## Verification & exit criteria (Day 30)

### Per-feature gate (before moving on)
- [ ] `npm test` green.
- [ ] `npm run typecheck` green.
- [ ] `npm run build` green.
- [ ] Manual E2E walkthrough completed.
- [ ] `.claude/progress/mvp-progress.md` updated with ✅ + date.

### Sprint A exit checklist (Day 30)
- [ ] All 8 features marked ✅.
- [ ] ≥1,500 claims (`Doctor.where({ isClaimed: true }).countDocuments()`).
- [ ] ≥1,200 Rx-pad generations (`Doctor.flags.rxPadGenerations` sum).
- [ ] ≥300 EMR seats marked `'ready'` by ops.
- [ ] ≥200 appointment requests delivered.
- [ ] Median verification turnaround <24h.
- [ ] No P0/P1 in production logs.
- [ ] Sprint A retro at `.claude/progress/sprint-a-retro.md`.

---

## Quick-reference: per-feature primary files

| Feature | Primary files |
|---|---|
| Day 0 | `src/lib/db/models/files.ts`, `Doctor.ts` PhotoSchema, `models/index.ts`, `tests/file-model.test.ts`, `CLAUDE.md` |
| A.1 | `scripts/seed.ts`, `scripts/lib/providers/popular.ts`, `src/lib/db/models/Doctor.ts` (source fields) |
| A.7 | `src/lib/db/models/ClaimRequest.ts`, `src/app/admin/verifications/*`, `src/components/profile/VerifiedBadge.tsx`, `src/app/api/og/[slug]/route.tsx` |
| A.6 | `src/app/(dashboard)/dashboard/chambers/page.tsx`, `src/components/dashboard/ScheduleEditor.tsx`, `src/server/actions/doctor.ts` |
| A.4 | `src/lib/sms/client.ts`, `src/lib/utils/phone.ts`, `src/server/actions/claim.ts`, `src/app/auth/claim/page.tsx`, `src/lib/auth/config.ts`, `src/lib/db/models/User.ts` |
| A.2 | `src/app/(dashboard)/dashboard/prescription-pad/{page.tsx,route.ts}`, `src/components/pdf/RxPad.tsx`, `src/lib/qr/server.ts` |
| A.3 | `src/lib/db/models/AppointmentRequest.ts`, `src/server/actions/appointment.ts`, `src/components/profile/AppointmentRequestForm.tsx`, `src/app/(dashboard)/dashboard/requests/page.tsx` |
| A.5 | `src/lib/db/models/User.ts` (emr fields), `src/server/actions/emr.ts`, `src/app/admin/emr-queue/page.tsx`, dashboard banner |
| A.8 | `src/lib/db/models/OutboundMessage.ts`, `OptOut.ts`, `scripts/outbound.ts`, `src/app/c/[token]/route.ts`, `src/app/admin/outbound/page.tsx`, `src/app/api/webhooks/sms/route.ts` |

---

**Bottom line:** Day-0 fixes have landed. 8 features queued, dependency-ordered, end-to-end. The only real risk surfaces left are (a) MDL credentials by Day 10, (b) EMR ops 48h SLA, (c) SMS per-day budget. Everything else is fully owned by engineering.
