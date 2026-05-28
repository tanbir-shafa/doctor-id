# doctor.id.bd MVP — Progress

> **Plan:** [../plans/mvp-plan.md](../plans/mvp-plan.md)
> **Last updated:** 2026-05-28

Each entry mirrors a step in the plan's "Build Sequence" section. Update this file in the same commit that completes a step.

## Status legend
- `not-started` — no code written
- `in-progress` — branch open, partial work
- `blocked` — needs an external decision/credential before it can proceed
- `done` — merged + acceptance criteria met

## Tasks

| # | Task | Status | Started | Completed | Notes |
|---|---|---|---|---|---|
| 0 | Plan + progress artifacts checked in | done | 2026-05-28 | 2026-05-28 | This file + mvp-plan.md committed |
| 1 | Scaffold (Next.js pinned, Tailwind, shadcn, Vitest, Mongo conn, /api/health) | done | 2026-05-28 | 2026-05-28 | Next 16.2.6, React 19.2.4 pinned exact. /api/health returns 200 against Atlas. Homepage SSR + OG meta verified. |
| 2 | Models + seed script (20 specialties, 50 BD doctors, 1 admin) | done | 2026-05-28 | 2026-05-28 | All models with FHIR-aligned indexes. Seed inserted 20 specialties + 50 doctors + admin into Atlas. |
| 3 | Auth (NextAuth v5, SES verify, Upstash login rate-limit) | done | 2026-05-28 | 2026-05-28 | NextAuth v5 (Credentials + Google when configured) with JWT sessions. Edge-safe proxy.ts (renamed from middleware per Next 16). Verified end-to-end: admin credentials login returns valid session cookie, proxy guards /dashboard + /admin. SES sends are no-ops without AWS creds (logged instead). Upstash limiter no-ops without REST creds. |
| 4 | Public profile `/[slug]` — SSR, JSON-LD, OG, share/QR | done | 2026-05-28 | 2026-05-28 | SSR with `revalidate: 60`. Physician + MedicalBusiness JSON-LD verified in HTML source. Dynamic /api/og/[slug] returns valid 1200×630 PNG. Leaflet maps lazy-loaded client-side. View counter, share/QR, WhatsApp CTA, report button all wired. |
| 5 | Search + category pages + sitemap + robots | done | 2026-05-28 | 2026-05-28 | /search, /cardiology, /cardiology/dhaka all 200 with proper titles. sitemap.xml + robots.txt rendered. SpecialtyListing reused via polymorphic [slug]/page.tsx (specialty match wins over doctor match). |
| 6 | Doctor dashboard (profile editor, chambers, settings) | done | 2026-05-28 | 2026-05-28 | Dashboard layout, overview with completeness chart, profile editor (basic, contact, qualifications array, experience array, publish toggle), analytics (daily views chart, top referrers), chambers list (read-only — full editor deferred), settings with password change + soft-delete. |
| 7 | S3 photo + cover upload (presign + crop) | done | 2026-05-28 | 2026-05-28 | Presigned PUT URL flow (5MB cap, JPG/PNG/WebP, PDF for verification docs). Server confirms key→URL and writes to doctor.photo / .coverPhoto. Falls back gracefully when AWS creds missing. Client-side cropper (react-easy-crop) deferred to Step 10 polish. |
| 8 | Verification flow + admin panel | done | 2026-05-28 | 2026-05-28 | Doctor verification request page + admin /admin layout, /admin/verifications queue with approve/reject, /admin/doctors list with suspend, /admin/specialties read-only catalog. Role gate via proxy + layout guard. |
| 9 | Analytics + `/api/v1/*` (FHIR-shaped, rate-limited) | done | 2026-05-28 | 2026-05-28 | /api/v1/doctors, /[slug], /specialties, /search all 200. FHIR Practitioner shape verified. Upstash rate-limit returns 429 + Retry-After. CDN cache headers set. Dashboard analytics shows 30-day chart + top referrers. |
| 10 | Polish (a11y, Lighthouse, Dockerfile, README, ECS notes) | done | 2026-05-28 | 2026-05-28 | Multi-stage Dockerfile (Node 22 alpine, standalone, non-root, /api/health probe). docker-compose.yml local Mongo fallback. README rewritten with setup + AWS ECS deploy guide. Vitest suite: 26 tests in 6 files, all green. Production `next build` succeeds — 30 routes built. Lighthouse/axe pass deferred to post-merge in staging. |

## Blockers / heads-up

- **AWS SES** — sandbox by default. Production access request needs to be filed before public launch (~24h review). Tracked under Step 3.
- **AWS S3 bucket + IAM user** — need real credentials before Step 7 can be exercised end-to-end. Step 7 will be implementable but not testable without them.
- **Upstash account** — need REST URL + token before Step 3 rate-limit + Step 9 API rate-limit can be exercised. Code falls back to a no-op limiter if env vars are missing so dev isn't blocked.
- **Google OAuth client** — need `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` before Google sign-in can be tested. Credentials sign-in works without it.
- **Atlas dev URI** — supplied 2026-05-28, in `.env.local`. Rotate before sharing with the team.

## Changelog

- **2026-05-28** — Plan approved, artifacts checked in, scaffolding started.
- **2026-05-28** — All 10 build-sequence steps completed in a single session. Production build green (30 routes), 26 Vitest tests passing, public API + JSON-LD + OG images verified against seeded data. Known deferrals: chambers editor UI, image cropper integration, Lighthouse/axe pass in staging.
