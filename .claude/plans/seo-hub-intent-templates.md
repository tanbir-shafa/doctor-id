# SEO Hub & Intent Page Templates — Design Spec (Task 12)

> **Plan:** [seo-growth-plan.md](./seo-growth-plan.md) · **Progress:** [../progress/seo-progress.md](../progress/seo-progress.md)
> **Status:** signed off 2026-06-20 — ready to build (40/41). `/best/*` content still gated on LEG task 10.
> **Owns:** the layout, copy slots, and internal-link modules for every programmatic geo/intent page.

## Why this exists

Pillar 2 of the SEO plan (win specialty×location mid-tail) is built from **programmatic pages**: one per specialty, per district, per intent. The risk is **thin / duplicate content** — thousands of near-identical listing pages Google ignores or penalises. This spec is the contract that prevents that: it fixes a shared anatomy, names every **copy slot** so Content (tasks 31/32/33) writes to a target, and defines the **internal-link modules** that make the set crawlable and concentrate equity on pages that have real supply.

It feeds:
- **CON** — 31 (hub intro copy), 32 (district-hub copy), 33 (intent-page copy)
- **ENG** — 39 (`ItemList` + intro on hubs), 40 (district-only hub route), 41 (intent pages)

It is gated downstream by **LEG task 10** ("best" ranking methodology) — see [§8](#8-best-pages--ranking-methodology-task-10-gate).

---

## 1. The four page types

| # | Page type | URL | Status | Targets queries like |
|---|---|---|---|---|
| A | **Specialty hub** | `/cardiology` (`/[slug]`) | **exists** — enhance | "cardiologist bangladesh", "heart specialist" |
| B | **Specialty × district hub** | `/cardiology/dhaka` (`/[slug]/[district]`) | **exists** — enhance | "cardiologist in dhaka" |
| C | **District-only hub** | `/doctors-in-dhaka` | **new (task 40)** | "doctor dhaka", "doctors in dhaka" |
| D | **Intent pages** | `/female/cardiology/dhaka`, `/best/cardiology/dhaka` | **new (task 41)** | "female gynecologist dhaka", "best cardiologist dhaka" |

A & B already ship via `SpecialtyListing`. This spec **enhances** them (intro slot + `ItemList`) and **defines** C & D so all four share one skeleton.

---

## 2. URL architecture (decided — see rationale)

Next.js App Router has **no `prefix-[param]` folder** support (a folder is either static or exactly `[param]`). That constrains the scheme:

- **C — District hub `/doctors-in-[district]`:** handled in the **`/[slug]` dispatch chain**, not a new folder. The polymorphic route ([src/app/(public)/[slug]/page.tsx](../../src/app/(public)/[slug]/page.tsx)) already tries *specialty → doctor*; we insert a **middle branch**: if `slug` matches `^doctors-in-(.+)$` and the captured name `canonicalizeDistrict()`s to a real BD district → render the district hub. This is the exact pattern CLAUDE.md §3 prescribes for a new named-slug type, and it yields the keyword-exact `/doctors-in-dhaka` URL the plan wants. No collision risk: specialty slugs and generated doctor slugs (`firstname-lastname-noun`) never start with `doctors-in-`.
  Dispatch order becomes: **(1) specialty → (2) `doctors-in-*` district → (3) doctor profile → 404.**
- **D — Intent pages:** dedicated **static-prefix route trees** (clean, collision-free, trivial to build by reusing `SpecialtyListing` + an existing filter):
  - `/female/[slug]` and `/female/[slug]/[district]`  → `(public)/female/[slug]/[district]/page.tsx`
  - `/best/[slug]` and `/best/[slug]/[district]`      → `(public)/best/[slug]/[district]/page.tsx`
  - `female` / `best` are new top-level segments; they can't collide with `/[slug]` because static segments win in Next routing.
- **Near-me:** **not** a separate indexable page in this build — see [§9](#9-near-me-deferred-rationale).

**Trailing-slash / casing:** districts are lowercased + `encodeURIComponent`'d in hrefs, exactly as the existing `/[slug]/[district]` route does — reuse that convention verbatim.

---

## 3. Shared page anatomy (skeleton)

Every hub/intent page renders these blocks **in this order**. Slots in `{braces}` are copy slots (§5); modules in **bold** are link modules (§6).

```
┌─ Breadcrumbs ─────────────────────────────  ← module M1
│  {backLink}            (B/C/D only: "← All … in Bangladesh")
├─ H1  {h1}
├─ {introParagraph}      (unique, templated — the anti-thin-content core)
├─ {supplyLine}          ("Browse N verified … profiles")
├─ {methodologyDisclosure}   (D-best ONLY; from LEG task 10)
├─ Filter / pivot bar    ← module M2 (specialty hub→districts; district hub→specialties)
├─ Doctor list           (DoctorCard × page; ItemList JSON-LD mirrors this)
├─ Pagination
├─ {faqBlock}            (optional hub FAQ — CON template; schema = FAQPage)
├─ Nearby / cross-links  ← modules M3 (sibling districts) + M4 (cross-intent)
└─ {whyDaktarNote}        (1-sentence verification trust line, footer of content)
```

**Empty / below-threshold state:** if supply `< MIN_INDEXABLE_*` (§7) the page still renders (200, never 404) with `{emptyState}` copy + the pivot modules, and is `robots: noindex, follow` so it's a crawlable hub but never an indexed soft-404.

---

## 4. Component plan (reuse > new)

| Component | Action |
|---|---|
| [`SpecialtyListing`](../../src/components/search/specialty-listing.tsx) | **Generalize.** Add optional props: `intro?: ReactNode` (renders `{introParagraph}` under H1), `disclosure?: ReactNode` (best pages), `pivot?: ReactNode` (override the district pivot with a specialty pivot for district hubs), `crossLinks?: SpecialtyNavLink[]`, `faq?: FaqItem[]`, `backLink?: {href,label}`, `heading?: string` (override the default H1 formula). Existing A/B callers pass none → unchanged behaviour. |
| `buildItemListJsonLd(items)` | **New** in [jsonld.ts](../../src/lib/seo/jsonld.ts) (task 39) — `ItemList` of `ListItem`→`{position, url, name}` for the doctors on the page (page-scoped, position continues across pagination). |
| `listSpecialtiesForDistrict(district)` | **New** query (task 40) — specialties with published supply in a district, count-desc, filtered to `≥ MIN_INDEXABLE_COMBO_DOCTORS`. Mirror of the existing `listDistrictsForSpecialty`. Powers the district-hub specialty pivot (M2). |
| `siblingDistricts(district)` | **New** helper (task 40/41) — districts in the same division (`divisionForDistrict`) that have supply. Powers M3. Pure over geo data + a supply set. |
| copy builders | **New** pure, DB-less, unit-tested functions (CON owns wording, ENG owns signatures) — `buildHubIntro`, `buildDistrictHubIntro`, `buildIntentIntro` — colocated with [profile-text.ts](../../src/lib/seo/profile-text.ts) patterns (e.g. a new `hub-text.ts`). |

`searchDoctors` is **reused as-is** for all four types — it already accepts `{ specialty, district, gender, verificationLevel, sort, page }`.

---

## 5. Copy-slot contract (for CON 31 / 32 / 33)

Each slot is a **template with variables**, not a static string — that's what makes 64 districts × 47 specialties read as unique pages. Content writes 2–3 interchangeable sentence variants per slot so adjacent pages don't read identically; ENG picks a variant deterministically (e.g. hash of slug) so it's stable per URL.

Variables available: `{specialty}`, `{specialtyLower}`, `{district}`, `{division}`, `{count}` (verified supply), `{nearbyDistricts}` (2–3 sibling names), `{specialtyBn}`/`{districtBn}` (for the future bn locale).

| Slot | Page types | Length | Notes / example skeleton |
|---|---|---|---|
| `h1` | all | — | A: `{specialty} doctors in Bangladesh` · B: `{specialty} doctors in {district}` · C: `Doctors in {district}` · D-female: `Female {specialty} doctors in {district}` · D-best: `Top {specialty} doctors in {district}` |
| `introParagraph` | all | 60–120 w | The anti-thin core. Must reference the specialty + place specifically. e.g. *"{district}, in {division} division, has {count} verified {specialtyLower} doctors listed on Daktar.Link. Each profile shows BMDC-aligned credentials, chamber addresses, visiting hours and consultation fees…"* CON: 3 variants/specialty-tier. |
| `supplyLine` | all | dynamic | Auto-generated, **not** hand-written: `Browse {count} verified … profiles`. Exists. |
| `whyDaktarNote` | all | 1 sentence | Trust line — *"Every doctor on Daktar.Link is matched to public BMDC records; the blue tick marks fully verified profiles."* Reuse `/how-verification-works` framing. |
| `methodologyDisclosure` | **D-best only** | 1–2 sentences + link | From **LEG task 10**. Defines the objective basis (§8) + links `/how-verification-works`. **Page must not ship without it.** |
| `faqBlock` | A/B/C (optional) | 3–5 Q&A | Hub-level FAQ (the piece deferred from task 28). Q variables: "How many {specialtyLower} doctors are in {district}?", "How do I book…?", "Are these doctors verified?". Renders visible + `FAQPage` JSON-LD. |
| `nearbyBlurb` | B/C/D | 1 sentence | *"Also browse {specialtyLower} doctors in {nearbyDistricts}."* — wraps M3. |
| `emptyState` | all | 1–2 sentences | Below-threshold copy that still adds value + points to the parent hub. |

---

## 6. Internal-link modules

| ID | Module | Appears on | Links to |
|---|---|---|---|
| **M1** | Breadcrumbs (`BreadcrumbList` JSON-LD — exists) | all | A: Home›Specialty · B: Home›Specialty›District · C: Home›District · D: Home›Specialty›District›(Intent) |
| **M2a** | District pivot (exists) | A, D-specialty | `/[slug]/[district]` for each district with supply |
| **M2b** | **Specialty pivot (new)** | C (district hub) | `/[specialty]/[district]` for each specialty with supply in that district |
| **M3** | **Sibling districts (new)** | B, C, D | same-division districts with supply — same page type |
| **M4** | **Cross-intent links (new)** | B, D | B↔`/best/…`↔`/female/…` for the same specialty×district (only when the target is indexable) |
| **M5** | Up-link (exists) | B, C, D | "← All {specialty} in Bangladesh" / "← All doctors in {district}" |

**Rule:** a module **never links to a `noindex` page** — every target is filtered through the supply threshold first (the existing `listDistrictsForSpecialty` already does this; new modules must too). This is the same guard task 23 established for profile cross-links.

---

## 7. Indexability rules

| Page type | Indexable when | Constant |
|---|---|---|
| A specialty hub | always (specialty exists) | — |
| B specialty×district | `count ≥ 1` (existing) | `MIN_INDEXABLE_COMBO_DOCTORS = 1` |
| C district hub | `district doctor count ≥ 1` | reuse `MIN_INDEXABLE_COMBO_DOCTORS` |
| D intent (best/female) | `count ≥ 3` | **new `MIN_INDEXABLE_INTENT_DOCTORS = 3`** |

Rationale for the higher intent threshold: a "**best** cardiologist in {district}" page listing **1** doctor is self-evidently not a "best of" and reads as spam — exactly the liability LEG task 10 guards against. A "female {specialty}" page with 1 result is thin. Below threshold → render 200 + `noindex,follow` + `{emptyState}`, so it stays a crawl conduit without polluting the index. **Sitemap** (task 22 logic) emits only indexable C/D pages; extend `listSpecialtyDistrictCombos` with district-hub + intent variants at build time.

---

## 8. "Best" pages — ranking methodology (task 10 gate)

`/best/[specialty]/[district]` **must not ship before LEG task 10 signs off** — see the finalized methodology in [best-ranking-methodology.md](./best-ranking-methodology.md). To stay defensible, "best" is **not** editorial opinion — it's an **objective, disclosed ranking** by a **dedicated sort key**: **BMDC-verified → identity-verified → profile completeness → recency.** ⚠️ Unlike every other listing, `/best/*` **excludes the Founding Doctor signal** (it's a referral reward, not a quality/patient signal — an undisclosed bias on a "best" page). Do **not** reuse the shared default or `verified` sort here. The page:
- frames the H1 as **"Top {specialty} doctors in {district}"** (rank by verification + completeness), not a subjective superlative;
- carries `{methodologyDisclosure}` above the list explaining the basis + linking `/how-verification-works`;
- never implies clinical superiority or patient outcomes.

LEG owns the exact disclosure wording and whether the "best/top" label is approved at all. If LEG rejects "best", the `/best/*` tree is dropped and only `/female/*` ships under task 41.

---

## 9. Near-me (deferred — rationale)

"[specialty] near me" is a **geolocation** intent Google answers with a local pack keyed to the *user's* live location — a static per-district page serves it poorly and risks a thin-page explosion. **This build does not mint near-me pages.** Instead it's a documented fast-follow: a client "**Find {specialty} near you**" control on the specialty hub that geolocates (browser `geolocation`) and redirects to the nearest district hub (nearest by chamber coordinates / district centroid). That captures the intent via existing indexable hubs with zero new thin pages. Revisit a dedicated `/[specialty]-near-me` page only if GSC shows real "near me" impressions we're missing.

---

## 10. Bilingual readiness (don't block, don't preclude)

This build ships **English**, but every decision must let the `bn` locale (task 43) layer on **without restructuring**:
- All copy goes through the §5 slot builders (locale-swappable), never inline JSX strings.
- `{specialtyBn}` / `{districtBn}` already exist in [bn-glossary.ts](../../src/lib/geo/bn-glossary.ts) — intro templates accept them now even if unused.
- URL plan reserves a locale prefix (`/bn/…`) for task 43; canonical + `hreflang` pairing (en-BD ↔ bn-BD) is task 43's job, not this build's — but the route structure (static prefixes + dispatch) already accommodates a leading `/bn`.

---

## 11. Acceptance criteria (for the build tasks)

- Each page type has a **distinct** `<title>`, meta description, H1, and self-referencing page-aware canonical (reuse the existing pattern in [`[slug]/[district]/page.tsx`](../../src/app/(public)/[slug]/[district]/page.tsx)).
- No two indexable pages share the same `introParagraph` verbatim (variant selection is deterministic per slug).
- Every indexable page emits `BreadcrumbList` + `ItemList` JSON-LD; hub FAQ pages also emit `FAQPage`.
- Every internal-link module target is itself indexable (no link to a `noindex` page).
- Below-threshold pages return **200 + noindex,follow**, never 404 or 200-indexable.
- Zero new thin/soft-404 pages in a post-launch GSC coverage check (the plan's KPI).

---

## Decisions (signed off 2026-06-20)

1. **District-hub URL** — ✅ `/doctors-in-[district]` via the `/[slug]` dispatch (keyword-exact). [§2](#2-url-architecture-decided--see-rationale)
2. **Intent scope** — ✅ ship **female** + **best**; **near-me deferred** per [§9](#9-near-me-deferred-rationale).
3. **"Best" framing** — ✅ proceed on the objective "Top … by verification + completeness" framing; build the `/best/*` tree but **its copy + launch stay gated on LEG task 10** wording. [§8](#8-best-pages--ranking-methodology-task-10-gate)
4. **Intent index threshold** — ✅ `MIN_INDEXABLE_INTENT_DOCTORS = 3`. [§7](#7-indexability-rules)

## Changelog

- **2026-06-20** — Drafted (task 12). Four page types, URL architecture, shared skeleton, copy-slot contract, link modules, indexability + "best" methodology gate, near-me deferral, bilingual readiness.
- **2026-06-20** — Signed off (all 4 decisions confirmed as recommended). Ready to build 40/41; `/best/*` copy/launch remains gated on LEG task 10.
