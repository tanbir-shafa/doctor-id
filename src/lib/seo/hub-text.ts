/**
 * Auto-generated, unique copy for the SEO **hub** pages — the specialty hub
 * (`/[specialty]`, page type A) and the specialty×district hub
 * (`/[specialty]/[district]`, page type B). See the design spec at
 * `.claude/plans/seo-hub-intent-templates.md` §5 (copy-slot contract).
 *
 * Why this exists: thousands of programmatic specialty/district listing pages
 * are worthless to Google if they read identically (thin / duplicate content).
 * These builders give each hub a **unique** intro + supporting micro-copy by
 * weaving in the specialty, district, division and supply count, and by picking
 * one of several sentence variants **deterministically per URL** (so a page's
 * copy is stable across renders but adjacent pages don't read the same).
 *
 * Pure + deterministic (no DB, no randomness, no Date) so it is unit-testable
 * and safe in any RSC/client boundary — same contract as profile-text.ts.
 *
 * ⚠️ Accuracy note (legal posture): `count` is the **published** supply for the
 * hub, NOT a count of verified profiles (the page query filters by
 * `status: "published"`, not verification). So this copy is deliberately
 * **count-neutral** — it never says "N verified doctors". Verification is stated
 * only as a per-profile attribute (matched to BMDC, blue tick = fully verified),
 * which is true regardless of how many profiles are verified. When wiring this
 * in (task 39), the existing `SpecialtyListing` supply line that reads
 * "Browse N verified … doctors" should be reworded or fed a verified-only count.
 */

export interface HubCopyInput {
  /** Display specialty, e.g. "Cardiology". */
  specialty: string;
  /** Lowercase specialty noun for mid-sentence use; defaults to `specialty.toLowerCase()`. */
  specialtyLower?: string;
  /** District (page type B). Omit/null for the national specialty hub (A). */
  district?: string | null;
  /** Division for the district (B). Pass `divisionForDistrict(district)`; optional. */
  division?: string | null;
  /** Published supply for this hub (see accuracy note — NOT necessarily verified). */
  count: number;
  /** Sibling districts with supply (B) — powers the nearby blurb. */
  nearbyDistricts?: string[];
  /** Stable key for deterministic variant selection; defaults to the hub identity. */
  variantKey?: string;
  /** Bangla nouns — accepted for bn-locale readiness (task 43); unused in en copy. */
  specialtyBn?: string;
  districtBn?: string;
}

export interface HubFaqItem {
  question: string;
  answer: string;
}

/** The 1-sentence verification trust line shared by every hub footer. */
export const HUB_WHY_DAKTAR_NOTE =
  "Every doctor on Daktar.Link is matched to public BMDC records; the blue Verified tick marks profiles confirmed on both their BMDC registration and government photo ID.";

// ── internal helpers ────────────────────────────────────────────────────────

function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** "a", "a and b", "a, b and c" — matches profile-text.ts style. */
function formatList(items: string[]): string {
  const xs = items.map((x) => x?.trim()).filter(Boolean) as string[];
  if (xs.length === 0) return "";
  if (xs.length === 1) return xs[0]!;
  if (xs.length === 2) return `${xs[0]} and ${xs[1]}`;
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

/** Stable 32-bit-ish hash of a string — for deterministic variant selection. */
function hashKey(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Deterministically pick one variant for a given key (stable per URL). */
function pickVariant<T>(key: string, variants: T[]): T {
  return variants[hashKey(key) % variants.length]!;
}

function lower(input: { specialty: string; specialtyLower?: string }): string {
  return (input.specialtyLower?.trim() || input.specialty).toLowerCase();
}

/** "12 cardiology doctors" / "1 cardiology doctor" / "cardiology doctors" (count ≤ 0). */
function countDoctors(count: number, specialtyLower: string): string {
  if (!Number.isFinite(count) || count < 1) return `${specialtyLower} doctors`;
  return `${count} ${specialtyLower} ${count === 1 ? "doctor" : "doctors"}`;
}

/** "Gazipur, Dhaka division" — but just "Dhaka" when the district shares its division name. */
function placePhrase(district: string, division?: string | null): string {
  const div = division?.trim();
  if (!div || div.toLowerCase() === district.toLowerCase()) return district;
  return `${district}, ${div} division`;
}

// ── intro paragraph (the anti-thin-content core) ─────────────────────────────

type IntroCtx = {
  specialty: string;
  specialtyLower: string;
  district: string;
  countDoctors: string;
  placePhrase: string;
};

const SPECIALTY_HUB_VARIANTS: Array<(c: IntroCtx) => string> = [
  (c) =>
    `Daktar.Link lists ${c.countDoctors} practising in chambers across Bangladesh. Every profile is matched to public BMDC records and shows qualifications, chamber locations, visiting hours and consultation fees — so you can choose a ${c.specialtyLower} doctor near you and book with confidence. Use the district links below to narrow your search by location.`,
  (c) =>
    `Looking for a ${c.specialtyLower} doctor in Bangladesh? Browse ${c.countDoctors} on Daktar.Link, each with BMDC-aligned credentials, chamber details and weekly visiting hours. Compare specialists by district, see real consultation fees up front, and request an appointment directly from the profile.`,
  (c) =>
    `Find a ${c.specialtyLower} doctor anywhere in Bangladesh. Daktar.Link brings ${c.countDoctors} into one place — verifiable credentials, clinic addresses, schedules and fees — so you can compare them by location and reach the right specialist without the guesswork. Pick a district below to see ${c.specialtyLower} doctors near you.`,
];

const SPECIALTY_DISTRICT_VARIANTS: Array<(c: IntroCtx) => string> = [
  (c) =>
    `${c.district} has ${c.countDoctors} listed on Daktar.Link. Each profile is matched to public BMDC records and shows the doctor's qualifications, chamber addresses in ${c.district}, weekly visiting hours and consultation fees — so you can compare ${c.specialtyLower} doctors in ${c.district} and request an appointment with confidence. Use the filters to narrow by verification, gender or availability.`,
  (c) =>
    `Looking for a ${c.specialtyLower} doctor in ${c.district}? Daktar.Link lists ${c.countDoctors} practising in ${c.placePhrase}. Each profile carries BMDC-aligned credentials, clinic locations, schedules and fees in one place, so you can find the right specialist near you and book directly — no phone tag, no guesswork.`,
  (c) =>
    `Browse ${c.countDoctors} with chambers in ${c.district}. Daktar.Link matches every doctor to public BMDC records — the blue tick marks profiles verified on both BMDC registration and government ID — and shows where each ${c.specialtyLower} doctor in ${c.district} holds chambers, when they're available, and what they charge. Compare profiles and request an appointment online.`,
];

/**
 * Unique intro paragraph for a hub. Branches on `district`: present → the
 * specialty×district hub (B), absent → the national specialty hub (A). One of
 * several variants is chosen deterministically from `variantKey` (defaults to
 * the hub identity), so the copy is stable per URL but varies across pages.
 */
export function buildHubIntro(input: HubCopyInput): string {
  const specialtyLower = lower(input);
  const district = input.district?.trim() || "";
  const ctx: IntroCtx = {
    specialty: input.specialty,
    specialtyLower,
    district,
    countDoctors: countDoctors(input.count, specialtyLower),
    placePhrase: district ? placePhrase(district, input.division) : "",
  };
  const key = input.variantKey?.trim() || (district ? `${input.specialty}/${district}` : input.specialty);
  const variants = district ? SPECIALTY_DISTRICT_VARIANTS : SPECIALTY_HUB_VARIANTS;
  return collapseWhitespace(pickVariant(key, variants)(ctx));
}

// ── supporting micro-copy slots ──────────────────────────────────────────────

/** "Also browse cardiology doctors in Gazipur and Narayanganj." — null if none. */
export function buildHubNearbyBlurb(input: HubCopyInput): string | null {
  const nearby = (input.nearbyDistricts ?? []).map((d) => d?.trim()).filter(Boolean) as string[];
  if (nearby.length === 0) return null;
  return `Also browse ${lower(input)} doctors in ${formatList(nearby.slice(0, 3))}.`;
}

/** Below-threshold copy that still adds value and points back to the parent hub. */
export function buildHubEmptyState(input: HubCopyInput): string {
  const specialtyLower = lower(input);
  const district = input.district?.trim();
  if (district) {
    return `We don't have ${specialtyLower} doctors in ${district} listed yet. Browse all ${specialtyLower} doctors across Bangladesh below, or check nearby districts.`;
  }
  return `We're still adding ${specialtyLower} doctors to Daktar.Link. Browse all doctors in Bangladesh, or explore other specialties below.`;
}

// ── hub FAQ (visible + FAQPage schema; closes the hub-FAQ slot from task 28) ──

function districtFaq(input: HubCopyInput, specialtyLower: string, district: string): HubFaqItem[] {
  const hasSupply = Number.isFinite(input.count) && input.count >= 1;
  return [
    {
      question: `How many ${specialtyLower} doctors are listed in ${district}?`,
      answer: hasSupply
        ? `Daktar.Link currently lists ${countDoctors(input.count, specialtyLower)} with chambers in ${district}, and the list grows as more profiles are added and verified.`
        : `We don't have ${specialtyLower} doctors in ${district} listed yet — browse nearby districts or all ${specialtyLower} doctors in Bangladesh.`,
    },
    {
      question: `Are the ${specialtyLower} doctors in ${district} verified?`,
      answer: `Each profile is matched to public BMDC records and shows its verification status; the blue Verified tick marks doctors confirmed on both BMDC registration and government photo ID. You can check any doctor's status on their profile.`,
    },
    {
      question: `How do I book a ${specialtyLower} doctor in ${district}?`,
      answer: `Open a doctor's profile to see their chambers and weekly schedule in ${district}. Many profiles let you request an appointment online; others list the chamber's phone number so you can call.`,
    },
    {
      question: `How much does a ${specialtyLower} doctor in ${district} charge?`,
      answer: `Consultation fees are shown on each profile where the doctor has provided them. Fees vary by doctor and chamber, so check the specific profile you're interested in.`,
    },
  ];
}

function specialtyFaq(specialtyLower: string): HubFaqItem[] {
  return [
    {
      question: `How do I find a verified ${specialtyLower} doctor in Bangladesh?`,
      answer: `Browse Daktar.Link's ${specialtyLower} listings by district to find doctors near you. Each profile shows BMDC-aligned credentials, chamber locations, weekly schedules and consultation fees.`,
    },
    {
      question: `Are these ${specialtyLower} doctors BMDC-verified?`,
      answer: `Each profile is matched to public BMDC records and shows its verification status; the blue Verified tick marks doctors confirmed on both BMDC registration and government photo ID.`,
    },
    {
      question: `Can I book an appointment through Daktar.Link?`,
      answer: `Many profiles let you request an appointment online, and every profile lists chamber locations and visiting hours so you can plan a visit.`,
    },
    {
      question: `How much does a ${specialtyLower} doctor cost in Bangladesh?`,
      answer: `Consultation fees are listed on each profile where the doctor has provided them, so you can compare costs before you choose.`,
    },
  ];
}

/**
 * Hub-level FAQ — visible Q&A + `FAQPage` JSON-LD (the hub piece deferred from
 * task 28). Branches on district like buildHubIntro. Answers are factual and
 * match what the page renders (a structured-data requirement).
 */
export function buildHubFaq(input: HubCopyInput): HubFaqItem[] {
  const specialtyLower = lower(input);
  const district = input.district?.trim();
  return district ? districtFaq(input, specialtyLower, district) : specialtyFaq(specialtyLower);
}

// ── District-only hub (page type C: /doctors-in-[district]) ───────────────────
// All specialties in one district — targets "doctor in {district}" head terms.

export interface DistrictHubCopyInput {
  district: string;
  /** Division for the district; pass `divisionForDistrict(district)`. Optional. */
  division?: string | null;
  /** Published-doctor supply for the district (count-neutral copy — see top note). */
  count: number;
  /** A few specialty names with supply in the district — for the intro + FAQ. */
  topSpecialties?: string[];
  /** Sibling districts with supply — powers the nearby blurb. */
  nearbyDistricts?: string[];
  /** Stable key for deterministic variant selection; defaults to the hub identity. */
  variantKey?: string;
  /** Bangla district noun — accepted for bn-locale readiness (task 43); unused in en. */
  districtBn?: string;
}

/** "12 doctors" / "1 doctor" / "doctors" (count ≤ 0). */
function plainDoctorCount(count: number): string {
  if (!Number.isFinite(count) || count < 1) return "doctors";
  return `${count} ${count === 1 ? "doctor" : "doctors"}`;
}

function acrossSpecialties(topSpecialties?: string[]): string {
  const xs = (topSpecialties ?? []).map((s) => s?.trim()).filter(Boolean) as string[];
  return xs.length ? `across specialties like ${formatList(xs.slice(0, 3))}` : "across a range of specialties";
}

type DistrictIntroCtx = { district: string; place: string; doctorCount: string; across: string };

const DISTRICT_HUB_VARIANTS: Array<(c: DistrictIntroCtx) => string> = [
  (c) =>
    `Find a doctor in ${c.place}. Daktar.Link lists ${c.doctorCount} with chambers in ${c.district} ${c.across} — each profile matched to public BMDC records, with qualifications, clinic addresses, visiting hours and consultation fees. Choose a specialty below to find the right doctor near you.`,
  (c) =>
    `${c.district} has ${c.doctorCount} listed on Daktar.Link, ${c.across}. Every profile shows verifiable credentials, chamber locations and weekly schedules in ${c.district}, so you can compare doctors and book the right one without the guesswork.`,
  (c) =>
    `Looking for a doctor in ${c.district}? Browse ${c.doctorCount} on Daktar.Link ${c.across}, each with BMDC-aligned credentials, chambers in ${c.district}, visiting hours and consultation fees. Pick a specialty below, or search by name.`,
];

/** Unique intro for the district-only hub (page type C). */
export function buildDistrictHubIntro(input: DistrictHubCopyInput): string {
  const district = input.district.trim();
  const ctx: DistrictIntroCtx = {
    district,
    place: placePhrase(district, input.division),
    doctorCount: plainDoctorCount(input.count),
    across: acrossSpecialties(input.topSpecialties),
  };
  const key = input.variantKey?.trim() || `doctors-in/${district}`;
  return collapseWhitespace(pickVariant(key, DISTRICT_HUB_VARIANTS)(ctx));
}

/** "Also browse doctors in Gazipur, Narayanganj and Tangail." — null if none. */
export function buildDistrictNearbyBlurb(input: DistrictHubCopyInput): string | null {
  const nearby = (input.nearbyDistricts ?? []).map((d) => d?.trim()).filter(Boolean) as string[];
  if (nearby.length === 0) return null;
  return `Also browse doctors in ${formatList(nearby.slice(0, 3))}.`;
}

/** Below-threshold copy for an empty district hub. */
export function buildDistrictHubEmptyState(input: DistrictHubCopyInput): string {
  return `We don't have doctors in ${input.district.trim()} listed yet. Browse doctors across Bangladesh, or check nearby districts below.`;
}

/** District-level FAQ — visible + FAQPage-ready. */
export function buildDistrictHubFaq(input: DistrictHubCopyInput): HubFaqItem[] {
  const district = input.district.trim();
  const xs = (input.topSpecialties ?? []).map((s) => s?.trim()).filter(Boolean) as string[];
  const hasSupply = Number.isFinite(input.count) && input.count >= 1;
  return [
    {
      question: `How many doctors are listed in ${district}?`,
      answer: hasSupply
        ? `Daktar.Link currently lists ${plainDoctorCount(input.count)} with chambers in ${district}, and the list grows as more profiles are added and verified.`
        : `We don't have doctors in ${district} listed yet — browse nearby districts or all doctors across Bangladesh.`,
    },
    {
      question: `What types of doctors can I find in ${district}?`,
      answer: xs.length
        ? `You'll find doctors across specialties like ${formatList(xs.slice(0, 5))} and more in ${district}. Use the specialty links on this page to narrow your search.`
        : `Daktar.Link lists doctors across a range of specialties in ${district}. Use the specialty links on this page to narrow your search.`,
    },
    {
      question: `Are the doctors in ${district} verified?`,
      answer: `Each profile is matched to public BMDC records and shows its verification status; the blue Verified tick marks doctors confirmed on both BMDC registration and government photo ID.`,
    },
    {
      question: `How do I book a doctor in ${district}?`,
      answer: `Open a doctor's profile to see their chambers and weekly schedule in ${district}. Many profiles let you request an appointment online; others list the chamber's phone number so you can call.`,
    },
  ];
}

// ── Intent pages (page type D: /female/… and /best/…) ─────────────────────────

export type DoctorIntent = "female" | "best";

export interface IntentCopyInput {
  intent: DoctorIntent;
  specialty: string;
  specialtyLower?: string;
  /** District for the specialty×district intent page; omit/null for the national variant. */
  district?: string | null;
  division?: string | null;
  count: number;
  nearbyDistricts?: string[];
  variantKey?: string;
  specialtyBn?: string;
  districtBn?: string;
}

/**
 * Approved on-page disclosure for /best/* ("Top …") pages — verbatim from the
 * finalized ranking methodology (.claude/plans/best-ranking-methodology.md §5,
 * LEG task 10). The page (task 41) renders this above the list with a link to
 * /how-verification-works. It MUST appear on every /best/* page.
 */
export const BEST_METHODOLOGY_DISCLOSURE =
  '"Top" here means ranked by objective profile signals — BMDC and identity verification status, profile completeness, and how recently the profile was updated. It is not a judgement of clinical quality, skill, or patient outcomes, is not based on patient reviews, and cannot be paid for. Daktar.Link is a directory, not a medical authority — we don\'t endorse or rate individual doctors.';

function femaleCount(count: number, specialtyLower: string): string {
  if (!Number.isFinite(count) || count < 1) return `female ${specialtyLower} doctors`;
  return `${count} female ${specialtyLower} ${count === 1 ? "doctor" : "doctors"}`;
}

type IntentCtx = { specialtyLower: string; placeIn: string; femaleCount: string };

const FEMALE_INTENT_VARIANTS: Array<(c: IntentCtx) => string> = [
  (c) =>
    `Find a female ${c.specialtyLower} doctor ${c.placeIn}. Daktar.Link lists ${c.femaleCount}, each matched to public BMDC records with qualifications, chamber locations, visiting hours and consultation fees. Many patients prefer a female doctor for comfort and privacy — browse verified profiles and book directly.`,
  (c) =>
    `Looking for a female ${c.specialtyLower} doctor ${c.placeIn}? Browse ${c.femaleCount} on Daktar.Link, with BMDC-aligned credentials, chambers, schedules and fees in one place. Compare profiles and request an appointment without the phone tag.`,
];

const BEST_INTENT_VARIANTS: Array<(c: IntentCtx) => string> = [
  (c) =>
    `These are the top ${c.specialtyLower} doctors ${c.placeIn} on Daktar.Link, ordered by verification status and profile completeness. Each profile is matched to public BMDC records and shows qualifications, chambers, visiting hours and consultation fees — so you can choose with confidence.`,
  (c) =>
    `Browse the top-ranked ${c.specialtyLower} doctors ${c.placeIn}. The order reflects BMDC and identity verification plus how complete each profile is — not a judgement of clinical skill. Every profile shows credentials, chambers, schedules and fees on Daktar.Link.`,
];

/** Unique intro for an intent page (female/best), national or district-scoped. */
export function buildIntentIntro(input: IntentCopyInput): string {
  const specialtyLower = lower(input);
  const district = input.district?.trim() || "";
  const placeIn = district ? `in ${placePhrase(district, input.division)}` : "in Bangladesh";
  const ctx: IntentCtx = {
    specialtyLower,
    placeIn,
    femaleCount: femaleCount(input.count, specialtyLower),
  };
  const key = input.variantKey?.trim() || `${input.intent}/${input.specialty}/${district || "bd"}`;
  const variants = input.intent === "female" ? FEMALE_INTENT_VARIANTS : BEST_INTENT_VARIANTS;
  return collapseWhitespace(pickVariant(key, variants)(ctx));
}

/** Intent-specific FAQ — visible + FAQPage-ready. */
export function buildIntentFaq(input: IntentCopyInput): HubFaqItem[] {
  const specialtyLower = lower(input);
  const district = input.district?.trim() || "";
  const where = district ? `in ${district}` : "in Bangladesh";
  const hasSupply = Number.isFinite(input.count) && input.count >= 1;

  if (input.intent === "female") {
    return [
      {
        question: `Are there female ${specialtyLower} doctors ${where}?`,
        answer: hasSupply
          ? `Yes — Daktar.Link lists ${femaleCount(input.count, specialtyLower)} ${where}, each with verifiable credentials, chambers and schedules.`
          : `We don't have female ${specialtyLower} doctors ${where} listed yet — try a nearby district or browse all ${specialtyLower} doctors.`,
      },
      {
        question: `Why choose a female ${specialtyLower} doctor?`,
        answer: `Some patients feel more comfortable discussing health concerns with a female doctor. Daktar.Link lets you see verified female ${specialtyLower} doctors with their chambers, visiting hours and fees so you can choose what suits you.`,
      },
      {
        question: `Are these doctors verified?`,
        answer: `Each profile is matched to public BMDC records and shows its verification status; the blue Verified tick marks doctors confirmed on both BMDC registration and government photo ID.`,
      },
      {
        question: `How do I book a female ${specialtyLower} doctor ${where}?`,
        answer: `Open a doctor's profile to see their chambers and weekly schedule. Many profiles let you request an appointment online; others list the chamber's phone number.`,
      },
    ];
  }

  // best / top — answers mirror the approved methodology (LEG task 10).
  return [
    {
      question: `How are the top ${specialtyLower} doctors ${where} chosen?`,
      answer: `We list verified ${specialtyLower} doctors ${
        district ? `with chambers in ${district}` : "across Bangladesh"
      }, ordered by their verification status (BMDC and identity), how complete their profile is, and how recently it was updated. The order reflects profile transparency on Daktar.Link — not a ranking of medical skill or patient outcomes, and it can't be purchased.`,
    },
    {
      question: `Can a doctor pay to rank higher?`,
      answer: `No. The order reflects verification status, profile completeness and recency only — it cannot be bought, and there is no advertising in these rankings.`,
    },
    {
      question: `Are these doctors verified?`,
      answer: `Each profile is matched to public BMDC records and shows its verification status; the blue Verified tick marks doctors confirmed on both BMDC registration and government photo ID.`,
    },
    {
      question: `How do I book a ${specialtyLower} doctor ${where}?`,
      answer: `Open a doctor's profile to see their chambers and weekly schedule. Many profiles let you request an appointment online; others list the chamber's phone number.`,
    },
  ];
}
