# Daktar.Link — SEO & Growth Plan (dependency-ordered)

> **Progress tracker:** [../progress/seo-progress.md](../progress/seo-progress.md)
> **Status:** drafted 2026-06-17 — pending approval

## Goal

Three search targets, in order of winnability:

1. **Own every listed doctor's name** — e.g. "Dr. Karim Rahman" / "ডা. করিম রহমান". ~3,200 profiles × spelling variants = tens of thousands of near-zero-competition queries. Fastest, biggest ROI.
2. **Win specialty × location mid-tail** — "cardiologist in Dhaka", "child specialist Chattogram". 3–6 months.
3. **Reach the head terms** — "doctor in bangladesh", "specialist doctor", "doctor dhaka". 9–18 months; only achievable once authority + links + content exist.

Two multipliers across all three:
- **Bangla** — English-only leaves most BD search volume on the table (`next-intl` scaffolding already exists).
- **Distribution loop** — every shared `/[slug]` (Rx pad, WhatsApp bio, business card) → branded search + backlinks no competitor can buy.

Positioning: the public surface stays **patient-first** ("the verified, authentic doctor directory of Bangladesh"); the doctor-network / EMR angle is a **B2D growth layer**, not a public SEO surface (the single `/for-doctors` page excepted).

## The 5 pillars (+ measurement)

- **Names** — entity SEO on every profile (unique copy, schema, Bangla `alternateName`, reviews)
- **Geo** — programmatic specialty×district done right (no thin pages, unique hubs, district hubs)
- **Trust** — E-E-A-T / YMYL (trust pages, Organization schema, verification as the brand)
- **Bangla** — bilingual money pages + `hreflang`
- **Off-page** — distribution loop, embeds, digital PR, partnerships
- **Measure** — cross-cutting instrumentation that frames everything

## How to read this plan

Tasks are grouped into **stages by dependency**: a stage consumes only the outputs of earlier stages. Within a stage, tasks run in **parallel**. `Dep:` lists the task numbers that must finish first (`—` = none). Departments: **ENG** (engineering), **PRD** (product/design), **CON** (content/editorial), **MKT** (marketing/growth), **LEG** (legal/compliance), **ANA** (analytics/data).

---

## Build sequence (dependency-ordered)

### Stage 0 — Instrumentation & long-pole kickoff (Day 1, no deps)

Measurement must exist *before* we change anything (we need a baseline). Legal drafts, Content templates, and Product specs are long poles that gate later builds, so they start on Day 1 even though their dependent builds land in Stages 2–3.

1. **[ANA]** Google Search Console + Bing Webmaster verified; sitemap submitted. _Dep: —_
2. **[ENG]** Install GA4 + define conversion events (claim, OTP-start). _Dep: —_
3. **[ANA]** Configure GA4 + organic→claim funnel. _Dep: 2_
4. **[ANA]** Rank-tracking baseline for 3 keyword baskets (doctor names sample, specialty×district, head terms). _Dep: —_
5. **[ANA]** Source Bangla name data + specialty/district glossary. _Dep: —_
6. **[LEG]** Draft `/privacy` policy (data handling, selfie/Gov-ID, retention). _Dep: —_
7. **[LEG]** Draft `/terms` of service. _Dep: —_
8. **[LEG]** Draft data-sources + editorial/verification policy (sourcing, correction/removal). _Dep: —_
9. **[LEG]** Review verification-claim wording ("BMDC-verified", "authentic") for accuracy/liability. _Dep: —_
10. **[LEG]** Approve "best [specialty]" ranking methodology + disclosure wording. _Dep: —_
11. **[LEG]** Define UGC/review policy + moderation + defamation handling. _Dep: —_
12. **[PRD]** Design district-hub + intent-page templates (layout, copy slots, internal-link modules). _Dep: —_
13. **[PRD]** Design `/for-doctors` page (value prop, claim CTA, network/EMR perks). _Dep: —_
14. **[PRD]** Design "add to your website" badge/embed (sizes, light/dark, copy). _Dep: —_
15. **[PRD]** Design bilingual UX (language toggle, Bangla typography). _Dep: —_
16. **[PRD]** Spec reviews/ratings UX (submission, moderation, anti-abuse, display). _Dep: —_
17. **[CON]** Write FAQ content templates for profiles + hubs. _Dep: —_
18. **[MKT]** Set up Google Business Profile + consistent social profiles (`sameAs` targets). _Dep: —_

### Stage 1 — Pure-code quick wins + growth loop (parallel with Stage 0)

Highest-ROI engineering, zero cross-team dependency — ship as fast as Stage 0 drafting allows.

19. **[ENG]** `Organization` + `WebSite` (+ SearchAction searchbox) JSON-LD on layout/homepage. _Dep: —_
20. **[ENG]** `BreadcrumbList` JSON-LD on profile / specialty / district pages. _Dep: —_
21. **[ENG]** Auto-generate unique 120–180w description for unclaimed profiles (feeds body + meta + `Physician.description`). _Dep: —_
22. **[ENG]** Sitemap prune empty/<3-doctor specialty×district combos + `noindex` thin combos. _Dep: —_ (validate against #1)
23. **[ENG]** Related-doctor internal links + "back to all [specialty]" + hub cross-links. _Dep: —_
24. **[ENG]** Pagination canonical + `rel="next/prev"` handling. _Dep: —_
25. **[PRD]** Optimize claim + share flow (Rx-pad QR, share toolkit, "billboard" prompts). _Dep: —_ _(ongoing)_
26. **[MKT]** Position "verified / authentic" as the core brand across channels. _Dep: —_ _(ongoing)_

### Stage 2 — First-order dependents (need Stage 0 outputs)

27. **[MKT]** Define KPIs + reporting cadence. _Dep: 1, 3, 4_
28. **[ENG]** `FAQPage` JSON-LD on profiles + hubs. _Dep: 17_
29. **[ENG]** Bangla `alternateName` + `sameAs` / `alumniOf` / `dateModified` on `Physician`. _Dep: 5_
30. **[CON]** Write `/about` + `/how-verification-works` copy. _Dep: 9_
31. **[CON]** Write unique-intro copy templates for specialty/district hubs. _Dep: 12_
32. **[CON]** Write district-only hub copy. _Dep: 12_
33. **[CON]** Write intent-page copy (best/female/near-me). _Dep: 12, 10_
34. **[CON]** Write `/for-doctors` copy. _Dep: 13_
35. **[CON]** Translate UI + money-page templates + specialty/district nouns to Bangla. _Dep: 5, 15_
36. **[ENG]** Build "add to your website" badge/embed widget. _Dep: 14_
37. **[MKT]** Run claim-rate campaigns (SMS/WhatsApp via outbound). _Dep: 27_
55. **[ENG + LEG]** Cookie-consent banner + GA Consent Mode v2 gating — gtag defaults to consent *denied*, upgraded on accept; banner copy from Legal. _Dep: 6_ — **prerequisite for activating GA (tasks 2/3) in production.** (Added 2026-06-17 after task 2 surfaced the gap; numbered 55 to avoid renumbering.)

### Stage 3 — Second-order builds (need Stage 2 copy/specs)

38. **[ENG]** Build trust/legal page routes (`/about`, `/how-verification-works`, `/data-sources`, `/contact`, `/privacy`, `/terms`). _Dep: 30, 6, 7, 8_
39. **[ENG]** `ItemList` JSON-LD + unique templated intro on specialty/district hubs. _Dep: 31_
40. **[ENG]** Build district-only hub route (`/doctors-in-[district]`). _Dep: 12, 32_
41. **[ENG]** Build intent pages (best/female/near-me [specialty]×[district]). _Dep: 12, 33, 10_
42. **[ENG]** Build `/for-doctors` page. _Dep: 13, 34_
43. **[ENG]** Wire `bn` locale on money pages + `hreflang` en-BD/bn-BD + canonical pairing. _Dep: 35, 15_
44. **[ENG]** Build reviews/ratings system + `aggregateRating` JSON-LD. _Dep: 16, 11_
45. **[MKT]** Promote "add to your website" badge to claimed doctors. _Dep: 36_

### Stage 4 — Authority, PR & partnerships (need live surfaces)

46. **[ANA]** Pull stats for the PR data story ("state of doctor access in BD"). _Dep: 1_
47. **[CON]** Plan + write 4–8 Bangla-first cornerstone articles (medically reviewed). _Dep: 5, 38_
48. **[ENG]** Content-hub plumbing (article + author schema, internal-link automation). _Dep: —_ (pairs with 47)
49. **[MKT]** Digital PR + publish the data story (link magnet). _Dep: 46, 47_
50. **[MKT]** Partnerships/BD: medical associations, hospitals, BMDC-adjacent orgs. _Dep: 38_
51. **[CON]** Produce 3–5 doctor success stories / case studies. _Dep: 37_
52. **[MKT]** B2D doctor-network / EMR marketing (off public SEO surfaces). _Dep: 42_ _(ongoing)_

### Stage 5 — Measurement maturity & iteration

53. **[ANA]** Build SEO dashboard (indexed pages by type, clicks by template, #1-for-name %, live thin-page list). _Dep: 1, 3, 4, 19–23_
54. **[ALL]** Monthly GSC review → reprioritize backlog. _Dep: 53_ _(ongoing)_

---

## Critical path

The longest dependency chain is the **authority chain**:

> **9** (claim wording) → **30** (trust copy) → **38** (trust pages) → **47** (cornerstone articles) → **49** (digital PR)

Start task 9 and all Content/Legal drafting on **Day 1** — it gates the deepest chain. The next-longest poles, also Day-1 starts:

- **Bilingual:** 5 (Bangla data) → 35 (translate) → 43 (wire `hreflang`)
- **Geo:** 12 (design) → 31/33 (hub + intent copy) → 39/41 (build hubs/intent pages)
- **Reviews:** 16 (UX) + 11 (policy) → 44 (build)

Stage 1 (pure-code wins 19–24) has **no external dependency** and should ship immediately in parallel — don't wait on Stage 0.

## KPIs / acceptance

- % of listed doctors ranking #1 for their own name (target: majority by month 3)
- Zero thin / soft-404 specialty×district pages in GSC coverage
- Non-branded organic clicks by template (profiles, specialty×district, district hubs)
- Organic → claim conversion rate
- Branded search volume ("daktar link") trend
- Bangla-query impressions once Stage 3 + bilingual land

## Changelog

- **2026-06-17** — Plan drafted from the 5-pillar SEO strategy; 54 tasks ordered by dependency into 6 stages.
- **2026-06-17** — Added task 55 (cookie-consent banner + GA Consent Mode) after task 2 shipped; it gates turning GA on in production.
