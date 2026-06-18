# Daktar.Link SEO & Growth — Progress

> **Plan:** [../plans/seo-growth-plan.md](../plans/seo-growth-plan.md)
> **Last updated:** 2026-06-17

Each row mirrors a task in the plan's dependency-ordered build sequence. Update this file in the same commit that completes a task. A task may not start until everything in its **Depends on** column is `done`.

## Status legend
- `not-started` — no work begun
- `in-progress` — actively being worked
- `blocked` — waiting on a dependency or external decision/credential
- `done` — shipped + acceptance met

## Summary

**7 / 54 done** · 0 in-progress · 47 not-started

| Dept | Total | Done |
|---|---|---|
| ENG (engineering) | 19 | 7 |
| PRD (product/design) | 6 | 0 |
| CON (content/editorial) | 9 | 0 |
| MKT (marketing/growth) | 8 | 0 |
| LEG (legal/compliance) | 6 | 0 |
| ANA (analytics/data) | 6 | 0 |

---

## Stage 0 — Instrumentation & long-pole kickoff (Day 1, no deps)

| # | Task | Dept | Depends on | Status | Notes |
|---|---|---|---|---|---|
| 1 | GSC + Bing Webmaster verified; sitemap submitted | ANA | — | not-started | Do first — gives the baseline + thin-page list |
| 2 | Install GA4 + conversion events (claim, OTP-start) | ENG | — | done | [google-analytics.tsx](../../src/components/analytics/google-analytics.tsx) + [gtag.ts](../../src/lib/analytics/gtag.ts); no-op until `NEXT_PUBLIC_GA_MEASUREMENT_ID` set. Fires `sign_up`/`login`/`otp_requested`. Task 3 (ANA) marks them as conversions in the GA property. |
| 3 | Configure GA4 + organic→claim funnel | ANA | 2 | not-started | |
| 4 | Rank-tracking baseline (3 keyword baskets) | ANA | — | not-started | Names sample · specialty×district · head terms |
| 5 | Source Bangla name data + specialty/district glossary | ANA | — | not-started | Long pole — feeds 29, 35 |
| 6 | Draft `/privacy` policy | LEG | — | not-started | Selfie/Gov-ID handling, retention |
| 7 | Draft `/terms` of service | LEG | — | not-started | |
| 8 | Draft data-sources + editorial/verification policy | LEG | — | not-started | YMYL trust signal |
| 9 | Review verification-claim wording | LEG | — | not-started | Gates trust copy (30) — start Day 1 |
| 10 | Approve "best [specialty]" ranking methodology + disclosure | LEG | — | not-started | Gates intent pages |
| 11 | Define UGC/review policy + moderation | LEG | — | not-started | Gates reviews build (44) |
| 12 | Design district-hub + intent-page templates | PRD | — | not-started | Long pole — feeds 31/32/33, 40/41 |
| 13 | Design `/for-doctors` page | PRD | — | not-started | |
| 14 | Design add-to-website badge/embed | PRD | — | not-started | |
| 15 | Design bilingual UX (toggle, typography) | PRD | — | not-started | |
| 16 | Spec reviews/ratings UX | PRD | — | not-started | |
| 17 | Write FAQ content templates (profiles + hubs) | CON | — | not-started | Gates FAQ schema (28) |
| 18 | Set up Google Business Profile + social `sameAs` | MKT | — | not-started | |

## Stage 1 — Pure-code quick wins + growth loop (parallel with Stage 0)

| # | Task | Dept | Depends on | Status | Notes |
|---|---|---|---|---|---|
| 19 | `Organization` + `WebSite` (+SearchAction) schema | ENG | — | done | Site-wide in [layout.tsx](../../src/app/layout.tsx); builders in [jsonld.ts](../../src/lib/seo/jsonld.ts) |
| 20 | `BreadcrumbList` schema (profile/specialty/district) | ENG | — | done | Doctor crumb resolves specialty slug via `findSpecialtySlugByName` |
| 21 | Auto unique description for unclaimed profiles | ENG | — | done | [profile-text.ts](../../src/lib/seo/profile-text.ts) → meta desc + Physician LD + "About" card |
| 22 | Sitemap prune empty combos + `noindex` thin | ENG | — | done | `MIN_INDEXABLE_COMBO_DOCTORS=1` (kills empties; raise to 3 once GSC confirms) |
| 23 | Related-doctor + cross-links + back-to-specialty | ENG | — | done | `listRelatedDoctors` + profile block; fixed latent `name.toLowerCase()` pivot bug |
| 24 | Pagination canonical (+ rel) | ENG | — | done | Self-ref page-aware canonical on search/specialty/district; rel=next/prev deferred (see note) |
| 25 | Optimize claim + share flow (Rx-pad QR, toolkit) | PRD | — | not-started | Ongoing — the SEO flywheel |
| 26 | Position "verified/authentic" brand | MKT | — | not-started | Ongoing |

## Stage 2 — First-order dependents

| # | Task | Dept | Depends on | Status | Notes |
|---|---|---|---|---|---|
| 27 | Define KPIs + reporting cadence | MKT | 1, 3, 4 | not-started | |
| 28 | `FAQPage` schema (profiles + hubs) | ENG | 17 | not-started | |
| 29 | Bangla `alternateName` + `sameAs`/`alumniOf`/`dateModified` | ENG | 5 | not-started | Unlocks Bangla name queries |
| 30 | `/about` + `/how-verification-works` copy | CON | 9 | not-started | |
| 31 | Hub unique-intro copy templates | CON | 12 | not-started | |
| 32 | District-only hub copy | CON | 12 | not-started | |
| 33 | Intent-page copy (best/female/near-me) | CON | 12, 10 | not-started | |
| 34 | `/for-doctors` copy | CON | 13 | not-started | |
| 35 | Translate UI + money-page templates + nouns (Bangla) | CON | 5, 15 | not-started | |
| 36 | Build add-to-website badge/embed widget | ENG | 14 | not-started | |
| 37 | Run claim-rate campaigns (SMS/WhatsApp outbound) | MKT | 27 | not-started | Use [outbound](../../scripts/outbound.ts) |

## Stage 3 — Second-order builds

| # | Task | Dept | Depends on | Status | Notes |
|---|---|---|---|---|---|
| 38 | Build trust/legal page routes | ENG | 30, 6, 7, 8 | not-started | /about, /how-verification-works, /data-sources, /contact, /privacy, /terms |
| 39 | `ItemList` + unique intro on hubs | ENG | 31 | not-started | |
| 40 | Build district-only hub route (`/doctors-in-[district]`) | ENG | 12, 32 | not-started | Targets "doctor dhaka" |
| 41 | Build intent pages (best/female/near-me) | ENG | 12, 33, 10 | not-started | |
| 42 | Build `/for-doctors` page | ENG | 13, 34 | not-started | |
| 43 | Wire `bn` locale + `hreflang` on money pages | ENG | 35, 15 | not-started | The 2× volume multiplier |
| 44 | Build reviews/ratings + `aggregateRating` | ENG | 16, 11 | not-started | Review stars in SERP |
| 45 | Promote add-to-website badge to claimed doctors | MKT | 36 | not-started | Backlink engine |

## Stage 4 — Authority, PR & partnerships

| # | Task | Dept | Depends on | Status | Notes |
|---|---|---|---|---|---|
| 46 | Pull stats for PR data story | ANA | 1 | not-started | |
| 47 | Write 4–8 Bangla cornerstone articles | CON | 5, 38 | not-started | Medically reviewed |
| 48 | Content-hub plumbing (article/author schema, internal links) | ENG | — | not-started | Pairs with 47 |
| 49 | Digital PR + publish data story | MKT | 46, 47 | not-started | "State of doctor access in BD" link magnet |
| 50 | Partnerships/BD (associations, hospitals) | MKT | 38 | not-started | Authoritative links |
| 51 | Doctor success stories / case studies | CON | 37 | not-started | |
| 52 | B2D doctor-network / EMR marketing | MKT | 42 | not-started | Ongoing — off public SEO surfaces |

## Stage 5 — Measurement maturity & iteration

| # | Task | Dept | Depends on | Status | Notes |
|---|---|---|---|---|---|
| 53 | Build SEO dashboard | ANA | 1, 3, 4, 19–23 | not-started | Indexed-by-type, clicks-by-template, #1-for-name %, thin-page list |
| 54 | Monthly GSC review → reprioritize backlog | ALL | 53 | not-started | Ongoing |

---

## Critical path

`9 → 30 → 38 → 47 → 49` (authority chain) is the longest. Start task 9 + all Legal/Content drafting on Day 1. Next-longest poles (also Day-1 starts): bilingual `5 → 35 → 43`, geo `12 → 31/33 → 39/41`, reviews `16 + 11 → 44`. Stage 1 (19–24) has no dependency — ship immediately, don't wait on Stage 0.

## Blockers / heads-up

- **GSC/GA4/rank-tracker accounts** — external setup needed before tasks 1–4 (and therefore 27, 53) can proceed.
- **Bangla data (task 5)** — gates the entire bilingual chain (29, 35, 43) and Bangla `alternateName`. Source early.
- **Legal capacity (tasks 6–11)** — all of Stage 0 Legal gates Stage 3 builds (38, 41, 44). If Legal is slow, the trust/authority chain slips.
- **"best [specialty]" pages (41)** — must not ship before Legal sign-off on ranking methodology (10), or it reads as spam / liability.
- **Reviews (44)** — do not launch before the UGC/moderation policy (11) is in place.

## Changelog

- **2026-06-17** — Progress board created from [seo-growth-plan.md](../plans/seo-growth-plan.md); 54 tasks across 6 dependency-ordered stages, all `not-started`.
- **2026-06-17** — **Task 2 — GA4 + conversion instrumentation ✅** — `<GoogleAnalytics/>` ([component](../../src/components/analytics/google-analytics.tsx)) loads gtag.js via `next/script` + tracks SPA page_views, **only** when `NEXT_PUBLIC_GA_MEASUREMENT_ID` is set (clean no-op otherwise — same pattern as SES/SMS/Turnstile). SSR-safe `trackEvent`/`pageview` helpers ([gtag.ts](../../src/lib/analytics/gtag.ts)); conversion events wired into the funnels — `otp_requested` + `sign_up` (register/claim), `otp_requested` + `login` (sign-in). New env `NEXT_PUBLIC_GA_MEASUREMENT_ID`. Gate green: typecheck + 570 tests + lint 0/0 + build; live-verified the no-op (0 gtag tags when unset). **Remaining for activation:** Analytics provides the GA4 property + measurement ID, then marks the events as conversions (task 3).
- **2026-06-17** — **Stage 1 engineering (tasks 19–24) ✅** — site-wide `Organization` + `WebSite` (SearchAction) schema; `BreadcrumbList` on profile / specialty / specialty×district; unique auto-generated profile copy ([profile-text.ts](../../src/lib/seo/profile-text.ts)) feeding the meta description, `Physician.description`, and an on-page "About" card so no profile is thin content; sitemap pruned to specialty×district combos with real supply + `robots:noindex` on empty combos; related-doctor block + "all [specialty]" cross-links (also fixed the latent `name.toLowerCase()` district-pivot bug); self-referencing page-aware canonicals on paginated search / specialty / district pages. New files: `profile-text.ts` + `tests/profile-text.test.ts`; 3 new jsonld builders + 4 new query helpers. Gate green: typecheck + 568 tests + lint 0/0 + build. **Deferred:** `rel=next/prev` (Google-deprecated and no first-class Next metadata support — self-canonical covers the consolidation need).
