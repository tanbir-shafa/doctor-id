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
| 1 | Scaffold (Next.js pinned, Tailwind, shadcn, Vitest, Mongo conn, /api/health) | in-progress | 2026-05-28 | | |
| 2 | Models + seed script (20 specialties, 50 BD doctors, 1 admin) | not-started | | | |
| 3 | Auth (NextAuth v5, SES verify, Upstash login rate-limit) | not-started | | | |
| 4 | Public profile `/[slug]` — SSR, JSON-LD, OG, share/QR | not-started | | | |
| 5 | Search + category pages + sitemap + robots | not-started | | | |
| 6 | Doctor dashboard (profile editor, chambers, settings) | not-started | | | |
| 7 | S3 photo + cover upload (presign + crop) | not-started | | | |
| 8 | Verification flow + admin panel | not-started | | | |
| 9 | Analytics + `/api/v1/*` (FHIR-shaped, rate-limited) | not-started | | | |
| 10 | Polish (a11y, Lighthouse, Dockerfile, README, ECS notes) | not-started | | | |

## Blockers / heads-up

- **AWS SES** — sandbox by default. Production access request needs to be filed before public launch (~24h review). Tracked under Step 3.
- **AWS S3 bucket + IAM user** — need real credentials before Step 7 can be exercised end-to-end. Step 7 will be implementable but not testable without them.
- **Upstash account** — need REST URL + token before Step 3 rate-limit + Step 9 API rate-limit can be exercised. Code falls back to a no-op limiter if env vars are missing so dev isn't blocked.
- **Google OAuth client** — need `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` before Google sign-in can be tested. Credentials sign-in works without it.
- **Atlas dev URI** — supplied 2026-05-28, in `.env.local`. Rotate before sharing with the team.

## Changelog

- **2026-05-28** — Plan approved, artifacts checked in, scaffolding started.
