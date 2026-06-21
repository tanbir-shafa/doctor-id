# Bilingual (Bangla) UX & SEO — Design Spec (Task 15)

> **Plan:** [seo-growth-plan.md](./seo-growth-plan.md) · **Progress:** [../progress/seo-progress.md](../progress/seo-progress.md)
> **Status:** DRAFT — pending owner sign-off. Locks the decisions that gate task 35 (translate) + task 43 (wire `bn` locale + `hreflang`).
> **Why this matters most:** English-only leaves the majority of Bangladesh's health search volume on the table. Bangla money pages + `hreflang` are the single biggest remaining *patient-search* multiplier (plan goal §Bangla).

## 1. The prize & the principle

Target Bangla queries like "ঢাকার হৃদরোগ বিশেষজ্ঞ" (cardiologist in Dhaka), "মহিলা গাইনি ডাক্তার" (female gynecologist), "[district] ডাক্তার". We already have the supply + the page templates; we just serve them in English only. This spec adds a Bangla layer **without restructuring the data model or breaking existing English URLs/rankings**.

Guiding principle: **localize the chrome + the templated copy; never auto-translate user data.** A doctor's name, bio, chamber names, and qualifications stay as entered (with Bangla *alternateName* for names handled separately — task 29, needs per-doctor data). We translate the UI and the machine-generated SEO copy.

## 2. Decisions to lock (recommended answers in **bold**)

### D1 — URL strategy: **subpath, English unprefixed**
- English stays at the **root** (`/cardiology`, `/cardiology/dhaka`, `/doctors-in-dhaka`, `/best/...`) — **no `/en/` prefix**, so every existing URL + its accrued ranking is untouched.
- Bangla lives under **`/bn/...`** (`/bn/cardiology`, `/bn/cardiology/dhaka`, `/bn/doctors-in-dhaka`).
- Implemented via `next-intl` with `localePrefix: 'as-needed'` (default locale unprefixed).
- **Rejected:** subdomain (`bn.daktar.link` — splits domain authority, more infra); Accept-Language auto-redirect only (no stable indexable Bangla URLs — Google can't rank what it can't crawl at a URL).

### D2 — Scope of the first bilingual release: **public money pages + chrome**
In scope (these are what rank): homepage, specialty hub, specialty×district hub, district hub, intent pages, **and** site chrome (header/footer/nav/buttons/labels) + the templated SEO copy on those pages (hub/intent intros, FAQ, supply line, breadcrumbs). Search page UI.
Out of scope for v1 (English only, fast-follow): doctor profile *body* prose, trust/legal pages, dashboard/admin (private, never indexed). Profile pages still get a `bn` shell + `hreflang` so names rank, but auto-summary translation is v2.

### D3 — `hreflang` + canonical (the SEO contract)
Every localized page emits reciprocal alternates in `<head>`:
```
<link rel="alternate" hreflang="en-BD" href="https://daktar.link/cardiology/dhaka" />
<link rel="alternate" hreflang="bn-BD" href="https://daktar.link/bn/cardiology/dhaka" />
<link rel="alternate" hreflang="x-default" href="https://daktar.link/cardiology/dhaka" />
```
- `canonical` is **self-referential per locale** (en page → itself; bn page → itself). en and bn are *alternates*, never canonicalized to each other.
- Pairing must be **reciprocal** (both pages list both) or Google ignores it. The page-aware canonical logic already in the money routes extends to prepend `/bn` for the bn variant.

### D4 — Language switching: **manual toggle + remembered choice, NO auto-redirect**
- A header control (e.g. "EN | বাংলা") switches to the **same page** in the other locale and stores the choice in a first-party cookie (`dl_locale`).
- **No automatic Accept-Language redirect** — Google's crawler presents as `en`, and locale-redirecting confuses crawling/indexing and can look like cloaking. `hreflang` is how we tell Google about the Bangla version; humans use the toggle. (A one-time non-intrusive "বাংলায় দেখুন?" hint banner is an acceptable nudge; a hard redirect is not.)

### D5 — Bangla typography: **self-hosted Noto Sans Bengali + system fallback**
- `font-family` for Bangla: `'Noto Sans Bengali', 'Hind Siliguri', 'SolaimanLipi', system-ui, sans-serif`. **Self-host** the Bangla webfont (subset, `font-display: swap`) — do **not** use a font CDN (matches the app's existing no-CDN posture; avoids a render-blocking third-party request). Apply via `:lang(bn)` / the `<html lang>` so English text is unaffected.
- Validate digit rendering (we show counts/fees) and line-height for conjuncts.

### D6 — Routing mechanism (the implementation crux for task 43)
- Use **`next-intl`** (scaffolding already noted in CLAUDE.md) with the App Router `[locale]` segment + `localePrefix: 'as-needed'`. Message catalogs: `messages/en.json`, `messages/bn.json`.
- ⚠️ **Migration cost + risk (flag for task 43):** the public routes move under an `app/[locale]/(public)/...` (or equivalent) segment, and `next-intl`'s middleware must **compose with the existing edge auth proxy** ([src/proxy.ts](../../src/proxy.ts)) — locale routing for public paths, auth gating for `/admin` `/dashboard`. The polymorphic `/[slug]` dispatch + the new `/female` `/best` `/doctors-in-*` routes all need to live under the locale segment. **This is the most invasive change in the SEO plan and must be verified on a live environment** (DB-backed), not just a build. Recommend doing task 43 as its own focused, well-tested PR.
- The templated copy (hub-text / profile-text) becomes **locale-aware**: the slot builders take a `locale` and pull Bangla variants (task 35 provides them, keyed off the existing `bn-glossary.ts` for specialty/district nouns — already shipped).

## 3. What task 35 (translate) must produce
- `messages/bn.json` for all chrome strings (header, footer, nav, buttons, form labels, search UI, pagination).
- **Bangla variants of the money-page slot builders**: `buildHubIntro`/`buildHubFaq`, `buildDistrictHubIntro`/`buildDistrictHubFaq`, `buildIntentIntro`/`buildIntentFaq`, `HUB_WHY_DAKTAR_NOTE`, `BEST_METHODOLOGY_DISCLOSURE` — Bangla renderings that interpolate `{specialtyBn}`/`{districtBn}` (already accepted as inputs in those builders) from [bn-glossary.ts](../../src/lib/geo/bn-glossary.ts).
- All Bangla copy is **draft → owner/native-reviewer finalized** (same bar as the trust pages; medical-YMYL accuracy matters). The disclosure/verification wording must preserve the exact legal meaning approved in English (tasks 9/10).

## 4. Acceptance (for task 43)
- en URLs unchanged (zero ranking regression); bn money pages live at `/bn/...`.
- Reciprocal `hreflang` (en-BD/bn-BD/x-default) on every localized page; self canonical per locale; validated in GSC's International Targeting / a hreflang checker.
- Toggle switches locale on the same page + persists; no auto-redirect.
- Bangla renders correctly (font, digits, conjuncts) with no CLS from font swap.
- `bn` pages carry the same JSON-LD (Breadcrumb/ItemList/FAQPage) with Bangla `name`/Q&A text, `inLanguage: "bn"`.

## 5. Open decisions for the finalizer
1. Confirm **D1** (`/bn` subpath, English unprefixed).
2. Confirm **D2** scope (money pages + chrome first; profile-body + trust pages v2).
3. Confirm **D4** (manual toggle, no auto-redirect) — or do you want a soft "বাংলায় দেখুন?" hint banner?
4. Confirm **D5** font (self-host Noto Sans Bengali).
5. Acknowledge **D6** risk — task 43 as its own live-verified PR.

## Changelog
- **2026-06-20** — Drafted (task 15). URL strategy, scope, hreflang/canonical contract, toggle behavior, typography, routing mechanism + risk, and the task-35 translation deliverables. Pending owner sign-off.
