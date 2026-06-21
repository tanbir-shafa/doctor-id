# "Best / Top [specialty]" Ranking Methodology & Disclosure (Task 10)

> **Plan:** [seo-growth-plan.md](./seo-growth-plan.md) · **Template spec:** [seo-hub-intent-templates.md](./seo-hub-intent-templates.md) §8 · **Progress:** [../progress/seo-progress.md](../progress/seo-progress.md)
> **Status:** DRAFT — pending owner / legal finalization (acting legal head)
> **Gates:** task 33 (intent copy) + task 41 `/best/*` launch. The `/best/*` pages **must not go live** until this is finalized.

## 1. Why this needs sign-off

"Best [specialty] in [district]" is a high-volume query, but publishing a page titled "best doctors" is a **YMYL liability**: it implies a clinical-quality judgement we are not qualified to make, can defame lower-ranked or omitted doctors, and — under Bangladesh consumer-protection norms + PDPO-era scrutiny — invites a "says who, on what basis?" challenge. This document defines a ranking that is **objective, disclosed, and patient-relevant**, plus the exact wording we put on the page, so the surface is defensible. It is the legal counterpart to the engineering design in the template spec.

## 2. The ranking — exactly what the page computes

`/best/[specialty]` and `/best/[specialty]/[district]` order doctors by **objective profile signals only**, in this strict order:

1. **BMDC verification** — is the doctor's BMDC registration verified against public records (`bmdcVerified`)?
2. **Identity verification** — is the doctor's government photo ID + legal name verified (`nidVerified`)?
3. **Profile completeness** — `profileCompletenessScore` (0–100): how much verified, patient-useful information the profile carries (photo, qualifications, chambers, schedules, fees).
4. **Recency** — most recently updated profile first (`updatedAt`), as a freshness/active-profile tiebreaker.

This is the platform's existing default ordering **with one deliberate removal** (see §3).

### What it is NOT ranked by
- ❌ **Clinical quality, skill, success rates, or patient outcomes** — we hold no such data and make no such claim.
- ❌ **Patient reviews or ratings** — none exist on the platform yet (reviews are shelved); the ranking is therefore not review-based and must not imply it is.
- ❌ **Payment, advertising, sponsorship, or commercial relationship** — ranking cannot be bought.
- ❌ **The Founding Doctor referral reward** — see §3.

## 3. Critical correction: exclude the Founding Doctor signal

The platform-wide **default** sort leads with `foundingDoctor.isFounding`. **Founding Doctor is a referral reward** (earned by referring colleagues who get approved) — a marketing/growth perk with **zero patient relevance**. Letting it lift a doctor up a "Top doctors" list is an **undisclosed commercial-style bias** and is not defensible on a "best" page.

➡️ **The `/best/*` ranking must drop the founding factor.** It needs its **own sort key** — `bmdcVerified → nidVerified → profileCompletenessScore → updatedAt` — not the shared default and not the `verified` sort (which also leads with founding). This is the single most important engineering note for task 41, and corrects [seo-hub-intent-templates.md](./seo-hub-intent-templates.md) §8 (which had listed founding first). Founding Doctors still surface naturally if they're verified + complete — they just get no ranking thumb on the scale.

## 4. Approved terminology

| Surface | Wording | Why |
|---|---|---|
| **H1** | **"Top {specialty} doctors in {district}"** | "Top" + an explicit, disclosed basis is defensible; bare "Best" as a superlative claim is not. Never "the best", "#1", or "leading". |
| **`<title>`** | "Top {specialty} Doctors in {district} — Verified \| Daktar.Link" | Targets the head intent without an unqualified superlative in the title tag. |
| **Body / FAQ** | May answer *"Who are the best {specialty} doctors in {district}?"* — but the **answer** describes the objective ranking ("the most-verified, most-complete profiles, ordered by…"), never "Dr X is the best." | Captures the "best" search query honestly; the transparency is in the answer. |
| **Disclosure** | The block in §5, on **every** `/best/*` page, above the list. | Mandatory. The page must not render the list without it. |

We deliberately do **not** mint a public "best doctors" claim about any individual. "Top" is a *sort order of profiles*, disclosed as such.

## 5. On-page disclosure copy (the `{methodologyDisclosure}` slot)

**Primary (use this) — renders above the list on every `/best/*` page:**

> **How this list is ordered.** "Top" here means ranked by objective profile signals — BMDC and identity **verification status**, **profile completeness**, and how **recently** the profile was updated. It is **not** a judgement of clinical quality, skill, or patient outcomes, is **not** based on patient reviews, and **cannot be paid for**. Daktar.Link is a directory, not a medical authority — we don't endorse or rate individual doctors. [How verification works →](/how-verification-works)

**Compact variant (tight layouts / meta):**

> Ordered by verification status, profile completeness and recency — not by clinical quality, reviews, or payment. [How verification works →](/how-verification-works)

**FAQ entry (for the hub FAQ block / task 33):**

> **Q: How are the "top {specialty} doctors in {district}" chosen?**
> A: We list verified {specialtyLower} doctors with chambers in {district}, ordered by their verification status (BMDC and identity), how complete their profile is, and how recently it was updated. The order reflects profile transparency on Daktar.Link — not a ranking of medical skill or patient outcomes, and it can't be purchased.

## 6. Guardrails (apply to copy + build)

- The disclosure is **non-optional** — `/best/*` renders 404/empty before it renders an undisclosed ranking.
- Apply the **same indexability floor** as the template spec (`MIN_INDEXABLE_INTENT_DOCTORS = 3`) — a "Top" page with 1–2 doctors is indefensible; below the floor it's `noindex` (see [spec §7](./seo-hub-intent-templates.md#7-indexability-rules)).
- **Correction/removal**: a doctor who disputes inclusion or ordering uses the existing report/correction channel (`support@daktar.link`, per the trust pages) — no special path needed, but the disclosure's verification link routes there indirectly.
- **No comparative knock-downs**: never state or imply that omitted or lower-ranked doctors are inferior.
- If/when **reviews** ship (shelved task 44), revisit this doc — a review signal would change the methodology and the disclosure must be updated in the same change.

## 7. Open items for the finalizer

1. Approve the **terminology** in §4 — specifically that **"Top" (not "Best")** is the on-page label, while the "best" query is targeted via the FAQ answer.
2. Approve the **disclosure copy** in §5 verbatim (or redline).
3. Confirm the **founding-exclusion** in §3 (this is both a legal and an engineering decision).
4. Confirm no separate standalone public "methodology" page is required beyond the on-page disclosure + the `/how-verification-works` link.

## Changelog

- **2026-06-20** — Drafted (task 10). Objective ranking (verification → completeness → recency), founding-reward exclusion, "Top" not "Best" terminology, mandatory on-page disclosure copy + FAQ entry, guardrails. Pending owner/legal finalization.
