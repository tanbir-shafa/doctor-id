# doctor.id.bd — 60-Day Doctor Acquisition Plan

> **To:** CEO, Shafa Care Ltd
> **From:** Head of Product
> **Date:** 2026-05-28
> **Repo:** `/Users/mdtanbirhossen/EMR/doctor-id`
> **Target:** 5,000 claimed BD doctor profiles in 60 days (≈85/day)

---

## Context — why this plan exists now

The MVP is shipped (public profile `/[slug]`, search, FHIR API, dashboard, admin, S3, auth all live). We have 50 seeded profiles and zero claims.

The CEO has set a single, sharp goal: **5,000 claimed profiles in 60 days.** The Shafa EMR already exists and is shippable as a perk to acquire doctors — it is no longer a future product to bridge to. Everything in this plan answers ONE question: **what makes a busy BD doctor spend 60 seconds claiming their profile here, instead of ignoring the SMS like they ignore every other one?**

Scope is doctor.id.bd only. We are intentionally NOT building patient flows, reviews, hyperlocal SEO, or anything that doesn't move the claim counter in the next 60 days.

---

## 1. The Doctor's Hierarchy of "Why I'd Claim"

In rough order of pull strength for a Bangladeshi MBBS doctor:

1. **Free patient leads delivered to my WhatsApp.** Money in pocket. Beats everything else.
2. **A free, branded prescription pad / digital Rx PDF.** Most chambers pay BDT 8–15/sheet for pad printing. We give it free with their photo, BMDC#, chambers, QR. This is the strongest single hook.
3. **Free seat on the Shafa EMR (you already have it).** Bundle it. "Claim your profile, get free EMR for 6 months." Real working software, not a waitlist.
4. **Verified blue badge** that they can show off. Status drives BD doctors more than money for the first claim.
5. **Discoverability on Google in Bangla & English.** "ডাক্তার করিম রহমান" / "Dr. Karim Rahman cardiologist Dhaka" → their page #1.
6. **Their senior / batch / college is on it.** Tribal pull. "23 doctors from DMC batch '12 are on doctor.id.bd."
7. **One-page digital business card with QR for WhatsApp bio.** Replaces their paper card.
8. **CME tracker toward BMDC 5-year renewal.** Niche but very sticky for the doctors who care.

The plan is to deliver #1–#5 in Sprint A and #6–#8 in Sprint B. Drop anything that doesn't ladder up to one of these.

---

## 2. Sprint A (Days 1–30): "A profile worth claiming"

Goal: every claimed profile delivers ≥1 tangible win in week 1. Target: **1,500 claims** by Day 30.

| # | Feature | What | Why now | Effort | Risk / Dep |
|---|---|---|---|---|---|
| A.1 | **Bulk-seed BMDC registry (50 → 30,000 unclaimed profiles)** | Scrape the public BMDC registry + medical college alumni pages + chamber directories. Generate unclaimed profiles with photo placeholder, name, BMDC#, degree, specialty. Idempotent script extending `scripts/seed.ts`. | We can't ask 5,000 doctors to register from scratch. We pre-build their page, then SMS them the link to claim. Practo did this with ~150k doctors before launch. | L | Need to confirm BMDC scraping is within their public-data terms. Cheap moderation pass for obvious dupes. |
| A.2 | **Free Prescription Pad PDF generator** | One-tap "Download my Rx pad" in the dashboard. Generates A5 PDF: doctor name + degrees + BMDC# + chambers + photo + QR linking to profile. Uses existing `src/lib/fhir/practitioner.ts` data. | **The single highest-pull feature in the whole plan.** Saves the doctor ~BDT 1,500/month in printing. Their patients see our QR on every prescription. Viral by default. | M | Designer pass on layout. BMDC# must appear. No medical-content endorsements on the pad — just the doctor's identity. |
| A.3 | **Appointment Request Inbox** | Public-profile "Request Appointment" button → name, phone, chamber, preferred slot, reason. Stored as `AppointmentRequest` doc; doctor sees it at `/dashboard/requests`; WhatsApp + SMS notify within 60 sec. | Delivers "free patient leads" — the #1 reason a doctor stays after claiming. Lead volume becomes our retention metric. | L | Needs SES prod access + SMS gateway. Block-1 dependency. |
| A.4 | **SMS Magic-Link Claim** | On every unclaimed profile: "Is this you? Claim in 60 seconds." Doctor enters BMDC# + phone → tap-to-claim SMS link. No password until they want one. | Email + password is 3 steps too many for a BD doctor. SMS is the only channel they actually open. | M | SMS gateway (SSLWireless / BulkSMSBD). |
| A.5 | **Free Shafa EMR seat bundled with claim** | On successful claim, doctor gets a banner: "Your free 6-month Shafa EMR seat is ready. Click to log in." Single-sign-on token to the existing EMR. | Existing asset, zero-marginal-cost incentive. Converts claim into product trial. The EMR also becomes our daily-active hook. | S (on doctor.id.bd side) | Coordination with EMR team for SSO + provisioning API. CEO confirms 6-month free tier is OK. |
| A.6 | **Chambers Editor (full)** | Replace read-only stub at `/dashboard/chambers` with Leaflet picker + day/time schedule grid. `LeafletLazy` already wired. | Chambers + schedule are prerequisites for A.3 (appointment requests) to be meaningful. | M | Known MVP deferral. |
| A.7 | **24-Hour Verified Badge SLA** | Admin verification queue commits to 24h turnaround. Existing badge made visible on cards, search, share artifacts, and on the Rx pad PDF. | The badge is the status payoff doctors brag about. Visible-everywhere placement is what makes the brag worth doing. | S | 0.5 FTE admin reviewer commitment. |
| A.8 | **Bulk Outbound: SMS + WhatsApp to all seeded profiles** | Automated outbound: "Dr. {name}, your doctor.id.bd profile is ready. Claim free + get a free Rx pad PDF: {link}." SMS first, WhatsApp Business API behind it. | Cold start. Organic claim rate without push is <5%. This is the engine. | S (tooling) / M (content + send) | WhatsApp Business API approval (2–4 wk) — start Day 1. SES prod for backup email channel. |

---

## 3. Sprint B (Days 31–60): "Scale the funnel from 1,500 to 5,000"

Goal: turn the first 1,500 claims into the engine that delivers the next 3,500. Target: **5,000 total claims** by Day 60.

| # | Feature | What | Why now | Effort | Risk / Dep |
|---|---|---|---|---|---|
| B.1 | **Medical college & batch directories** | Auto-generate pages: `/college/dmc`, `/college/dmc/2012`, `/college/ssmc`, etc. Each shows claimed + unclaimed doctors from that college and batch. "23 of your batch are on doctor.id.bd." | Tribal pull is the single most underrated lever in BD doctor acquisition. Seeing classmates on the platform converts skeptics faster than any feature. | M | Need college + batch fields on the Doctor model (additive, no migration risk). Scraping batch data from alumni Facebook groups + medical college sites. |
| B.2 | **Doctor-refers-Doctor program** | "Invite a colleague" link in dashboard. Both inviter and invitee get an upgrade: an extra 6 months of free EMR + a "Founding Doctor" badge if claimed in the first 60 days. | Compounds the acquisition. Once a doctor sees value, the cheapest next-doctor channel is them. | S (UI) / M (logic) | Anti-spam + reward fraud check. Cap rewards per inviter. |
| B.3 | **Digital Business Card / WhatsApp QR Kit** | Generate: (a) shareable WhatsApp text + deep link, (b) 1080×1080 social card, (c) printable A6 business card PDF, (d) profile-link QR for WhatsApp bio. All from the existing `next/og` + QR code stack. | After Rx pad, this is the #2 ambient-virality artifact. Every patient who sees a WhatsApp bio QR is an organic discovery. | S | None. |
| B.4 | **Bangla locale for public pages only** | Bangla translations for `/[slug]`, `/search`, `/[specialty]`, `/[specialty]/[city]`. `next-intl` structure already in place. Dashboard stays English. | Doubles SEO surface in Google (Bangla and English indexed separately). Doctors share the Bangla link in WhatsApp groups; family-side patients click it. | M | Translator (~BDT 30k one-shot). Don't translate dashboard. |
| B.5 | **Field-rep playbook + chamber booth kit** | Printed playbook + booth materials (banner, QR cards, brochure) for 5 field reps doing chamber visits in Dhanmondi, Gulshan, Uttara, Mohakhali, Chittagong, Sylhet. Each chamber visit = 5–10 instant claims with SMS magic-link demo on the spot. | Online outbound caps at ~50% of doctors. The rest need a human in the chamber to walk them through claim + Rx-pad download. This is how we hit 5,000. | S (materials) / L (ops) | Hire & train 5 field reps. Travel budget. CEO commits to ops investment. |
| B.6 | **Conference & BMA event presence** | Sponsor 1–2 specialty conferences in the next 60 days (BD Cardiology Conference, BD Pediatrics Conference, BMA general body if possible). Booth + on-site claim demo + free Rx pad printout incentive. | Doctors trust what they see at peer events. One conference = 100–300 claims in two days. | S (build) / L (deal) | CEO + BD lead the negotiation. Booking lead-time risk. |
| B.7 | **CME Feed (read-only v1)** | Curated medical education content — videos, abstracts, journal links. Doctor logs CME hours. Manual catalogue of ~50 items at launch. | Niche but sticky pull for the "renew my BMDC license" cohort. Drives DAU among the most engaged doctors. | M | Content licensing or partnership with one PG hospital. |
| B.8 | **Public KPI billboard (internal)** | A `/admin/metrics` dashboard with the 6 metrics in §5. Updated live. Big-screen-friendly. | The 5,000 number isn't real until the whole company sees the counter every morning. | S | None. |

---

## 4. Bets we are explicitly NOT making in these 60 days

- **Patient reviews + ratings.** Adds moderation cost and legal risk; doesn't drive doctor sign-ups in the 60-day window. Q3.
- **Hyperlocal & condition SEO pages.** Compounding traffic is real but slow — won't move the 60-day claim count. Q3.
- **In-app messaging or telemedicine.** WhatsApp already wins. Don't fight it.
- **Featured-listing / sponsorship revenue.** Supply-side first. Revenue features are a Q3 conversation once 5,000 supply is locked.
- **AI symptom checker.** Liability + DGHS uncertainty. No.
- **Mobile apps.** Web-first, PWA when needed. Apps don't fit a 60-day shipping budget.

---

## 5. KPI billboard — 6 metrics, daily

Extend `src/app/(dashboard)/dashboard/analytics/page.tsx` for doctors; build `/admin/metrics` for the company billboard.

1. **Total Claimed Profiles** — the 5,000 counter. Headline number.
2. **Daily Claims** — split by source: SMS outbound / WhatsApp / field rep / conference / referral / organic. Tells us which channel to lean into.
3. **Claim-to-Active-7d %** — what % of claimed doctors return within 7 days. <40% = retention emergency.
4. **Rx Pads Generated** — proxy for "the hook is working." Should track ~80% of claims.
5. **Appointment Requests Delivered** — the value proof for retention. Headline doctor-side number.
6. **EMR Seats Activated** — bundled EMR signups + 30-day EMR-MAU. Bridge to monetization.

**Day-30 target:** 1,500 claims, 1,200 Rx pads downloaded, 60% Claim-to-Active-7d, 300 EMR seats activated, 200 appointment requests delivered.
**Day-60 target:** 5,000 claims, 4,000 Rx pads, 50% Claim-to-Active-7d, 1,200 EMR seats activated, 1,000 appointment requests delivered.

---

## 6. Open decisions needed from the CEO (next 5 days)

1. **SMS gateway pick + budget** — SSLWireless recommended, ~BDT 50k/month at projected volume. A.4 + A.8 block on this.
2. **WhatsApp Business API** — Meta approval is 2–4 weeks; must start Day 1 or we miss Sprint B outbound scale.
3. **EMR free-tier policy** — A.5 needs a confirmed offer (recommend 6 months free, then BDT 1,500/month). Coordinate SSO with EMR team.
4. **Field-rep hiring (5 people, ~BDT 35k/month each, 3-month contracts)** — Sprint B.5 blocks on this. Approve hire + travel budget by Day 15.
5. **Conference sponsorships** — pick 1–2 specialty conferences in the next 60 days; budget BDT 2–4L per event. Booking lead time is real.
6. **BMDC registry scraping legal sign-off** — A.1 depends on this; the registry is public but bulk scraping should be reviewed by a BD lawyer.
7. **Designer & translator engagement** — Rx pad PDF (A.2) + Bangla locale (B.4) need ~2 weeks of contractor time. Approve.

---

## 7. Critical files / extension points in the repo

(Pinpoints, not implementation.)

- **A.1 bulk seed**: extend `scripts/seed.ts` with `--source=bmdc-csv` mode and a separate scraper helper. Idempotent; do not drop existing claimed docs.
- **A.2 Rx pad PDF**: new route `src/app/(dashboard)/dashboard/prescription/route.ts` returning a PDF (`pdfkit` or `react-pdf`). Reads from `src/lib/fhir/practitioner.ts`.
- **A.3 appointment requests**: new `src/lib/db/models/AppointmentRequest.ts`, new server action `src/server/actions/appointment.ts` following the canonical pattern (auth → Zod → ownership via `ownerId` → Upstash → mutate → revalidate). New dashboard route `src/app/(dashboard)/dashboard/requests/page.tsx`. Public form lives in `src/app/(public)/[slug]/page.tsx`.
- **A.4 SMS magic-link**: new `src/lib/sms/client.ts`. Auth callback in `src/lib/auth/config.ts` adds a passwordless "claim" flow alongside existing Credentials.
- **A.5 EMR bundling**: extend `src/server/actions/auth.ts` registration to trigger an EMR provisioning call. New `src/lib/emr/client.ts` for SSO token exchange.
- **A.6 chambers editor**: replace `src/app/(dashboard)/dashboard/chambers/page.tsx` (read-only stub) using the existing `src/components/map/leaflet-lazy.tsx` boundary.
- **A.7 verified badge SLA**: add SLA timestamps to `src/lib/db/models/ClaimRequest.ts` and surface in `/admin/verifications`.
- **A.8 outbound**: new `scripts/outbound.ts` consuming the unclaimed-profile collection, sending SMS via A.4's client and WhatsApp via Meta API.
- **B.1 college/batch**: additive `college`, `batch_year` fields on `src/lib/db/models/Doctor.ts`. New routes `src/app/(public)/college/[slug]/page.tsx` and `src/app/(public)/college/[slug]/[year]/page.tsx`. Polymorphic `[slug]` dispatch order updated in `src/app/(public)/[slug]/page.tsx`.
- **B.2 referrals**: new `src/lib/db/models/Referral.ts`, server action under `src/server/actions/referral.ts`.
- **B.3 share kit**: extends existing `next/og` route + `ShareButton` component. PDF generator reuses A.2's stack.
- **B.4 Bangla locale**: add `messages/bn.json`; gate dashboard routes to English.
- **B.7 CME feed**: new `src/lib/db/models/CmeItem.ts` + `src/lib/db/models/CmeLog.ts`. Public read at `/cme`, dashboard log at `/dashboard/cme`.
- **B.8 metrics**: new `/admin/metrics` route; reuses existing `ProfileView` + new appointment/claim aggregations.

---

## 8. Verification — how we'll know it worked

- **Daily**: the `/admin/metrics` billboard counter is the truth. If it isn't moving by Day 5, the SMS funnel is broken — fix before adding anything.
- **End of Sprint A**: 1,500 claimed, 1,200 Rx pads downloaded, 300 EMR activations, 200 appointment requests delivered, 24h verification SLA holding.
- **End of Sprint B**: 5,000 claimed, 4,000 Rx pads downloaded, doctor-to-doctor referrals contributing ≥15% of new claims, B.5 field reps producing ≥10 claims/rep/day, ≥1 conference booth completed.

---

**Bottom line:** the Rx pad PDF + free EMR seat + SMS magic-link is the magnet. The BMDC bulk seed + SMS/WhatsApp outbound + field reps + medical-college tribal pull is the engine. Everything else in the MVP stays as-is. We don't ship a single feature that doesn't directly move the 5,000-by-Day-60 number.
