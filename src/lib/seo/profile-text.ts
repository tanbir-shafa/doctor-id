/**
 * Auto-generated, unique profile copy synthesised from a doctor's structured
 * fields.
 *
 * Why this exists: most ingested profiles have no hand-written bio. A profile
 * that only renders a name + specialty is "thin content" — exactly what Google
 * discounts, and the long tail of doctor-name searches is our biggest SEO win.
 * These builders give every profile unique, factual, non-boilerplate prose
 * (different per doctor because it weaves in their real specialty, district,
 * qualifications, chambers and languages) for the <meta description>, the
 * Physician JSON-LD `description`, and the on-page "About" card.
 *
 * Pure + deterministic (no DB, no randomness) so it is unit-testable and safe
 * in both RSC and client boundaries.
 */

import type { DoctorDocLike } from "@/types/doctor";

function primarySpecialtyName(doc: DoctorDocLike): string {
  return (doc.specialties.find((s) => s.isPrimary) ?? doc.specialties[0])?.name ?? "Doctor";
}

function primaryDistrict(doc: DoctorDocLike): string | null {
  const c = doc.chambers.find((ch) => ch.isPrimary) ?? doc.chambers[0];
  return c?.district?.trim() || null;
}

function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** "a", "b and c", "a, b and c" — Oxford-free Bangladeshi-English style. */
function formatList(items: string[]): string {
  const xs = items.map((x) => x?.trim()).filter(Boolean) as string[];
  if (xs.length === 0) return "";
  if (xs.length === 1) return xs[0]!;
  if (xs.length === 2) return `${xs[0]} and ${xs[1]}`;
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

function truncateAtWord(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[,.\s]+$/, "") + "…";
}

/**
 * A short (≤160 char), unique meta description. Used as the
 * `<meta name="description">` fallback for profiles with no
 * bio/seoDescription.
 */
export function buildAutoMetaDescription(doc: DoctorDocLike): string {
  const name = doc.name.displayName;
  const specialty = primarySpecialtyName(doc);
  const district = primaryDistrict(doc);
  const years = doc.yearsOfExperience && doc.yearsOfExperience > 0 ? doc.yearsOfExperience : null;
  const topDegree = doc.qualifications[0]?.degree?.trim();

  let lead = `${name} is a ${specialty} specialist${district ? ` in ${district}, Bangladesh` : " in Bangladesh"}`;
  if (years) lead += ` with ${years}+ years' experience`;
  lead += ".";

  const tail = topDegree
    ? ` ${topDegree}. View chambers, schedule, fees and verified contact on Daktar.Link.`
    : " View chambers, schedule, fees and verified contact on Daktar.Link.";

  return truncateAtWord(collapseWhitespace(lead + tail), 160);
}

/**
 * A longer (~60–130 word) unique paragraph for the on-page "About" card and the
 * Physician JSON-LD description, when the doctor has no hand-written bio. Only
 * includes sentences for data that is actually present.
 */
export function buildAutoProfileSummary(doc: DoctorDocLike): string {
  const name = doc.name.displayName;
  const specialty = primarySpecialtyName(doc);
  const district = primaryDistrict(doc);
  const years = doc.yearsOfExperience && doc.yearsOfExperience > 0 ? doc.yearsOfExperience : null;
  const sentences: string[] = [];

  // 1 — identity
  let s1 = `${name} is a ${specialty} specialist${district ? ` based in ${district}` : ""} in Bangladesh`;
  if (years) s1 += `, with over ${years} years of clinical experience`;
  s1 += ".";
  sentences.push(s1);

  // 2 — qualifications
  const degrees = doc.qualifications.map((q) => q.degree).filter(Boolean);
  if (degrees.length) {
    const list = formatList(degrees.slice(0, 3));
    const institutions = formatList(
      [...new Set(doc.qualifications.map((q) => q.institution).filter(Boolean))].slice(0, 2),
    );
    sentences.push(`Their qualifications include ${list}${institutions ? `, trained at ${institutions}` : ""}.`);
  }

  // 3 — areas of focus
  const focus = (doc.subSpecialties?.length ? doc.subSpecialties : doc.concentrations) ?? [];
  if (focus.length) {
    sentences.push(`Areas of focus include ${formatList(focus.slice(0, 4))}.`);
  }

  // 4 — chambers
  if (doc.chambers.length) {
    const districts = [...new Set(doc.chambers.map((c) => c.district).filter(Boolean))];
    const where = districts.length ? ` in ${formatList(districts.slice(0, 3))}` : "";
    const count = doc.chambers.length;
    sentences.push(`${name} consults at ${count} ${count === 1 ? "chamber" : "chambers"}${where}.`);
  }

  // 5 — languages
  if (doc.languages.length) {
    sentences.push(`Consultations are available in ${formatList(doc.languages.slice(0, 4))}.`);
  }

  // 6 — CTA
  sentences.push("See full schedule, consultation fees and verified contact details below.");

  return collapseWhitespace(sentences.join(" "));
}

export interface ProfileFaqItem {
  question: string;
  answer: string;
}

function verificationAnswer(doc: DoctorDocLike, name: string): string {
  switch (doc.verificationLevel) {
    case "fully_verified":
      return `Yes — ${name} carries the blue Verified tick: both BMDC professional registration and identity have been confirmed by Daktar.Link.`;
    case "bmdc_verified":
      return `${name}'s BMDC professional registration has been verified by Daktar.Link.`;
    case "identity_verified":
      return `${name}'s identity has been verified by Daktar.Link.`;
    default:
      return `${name} is listed on Daktar.Link but has not completed verification yet.`;
  }
}

/**
 * Data-driven FAQ for a profile — each answer is built from the doctor's real
 * fields, so it's unique per doctor and matches what's rendered on the page (a
 * requirement for the FAQPage structured data). Only questions with backing
 * data are included; specialty + verification are always answerable.
 */
export function buildProfileFaq(doc: DoctorDocLike): ProfileFaqItem[] {
  const name = doc.name.displayName;
  const specialty = primarySpecialtyName(doc);
  const items: ProfileFaqItem[] = [];

  // 1 — specialty (always)
  const focus = (doc.subSpecialties?.length ? doc.subSpecialties : doc.concentrations) ?? [];
  items.push({
    question: `What does ${name} specialise in?`,
    answer: `${name} is a ${specialty} specialist${
      focus.length ? `, with a focus on ${formatList(focus.slice(0, 4))}` : ""
    }.`,
  });

  // 2 — where (if chambers)
  if (doc.chambers.length) {
    const chamberNames = formatList([...new Set(doc.chambers.map((c) => c.name).filter(Boolean))].slice(0, 3));
    const districts = [...new Set(doc.chambers.map((c) => c.district).filter(Boolean))];
    const where = districts.length ? ` in ${formatList(districts.slice(0, 3))}` : "";
    items.push({
      question: `Where does ${name} see patients?`,
      answer: `${name} consults at ${chamberNames || `${doc.chambers.length} chamber(s)`}${where}. Full chamber addresses and weekly schedules are listed on this page.`,
    });
  }

  // 3 — fees (if any chamber has a positive fee)
  const fees = doc.chambers
    .map((c) => c.consultationFee)
    .filter((f): f is NonNullable<typeof f> => Boolean(f && f.amount > 0));
  if (fees.length) {
    const amounts = fees.map((f) => f.amount);
    const min = Math.min(...amounts);
    const max = Math.max(...amounts);
    const currency = fees[0]!.currency;
    const fee = min === max ? `${currency} ${min}` : `${currency} ${min}–${max}`;
    items.push({
      question: `What is ${name}'s consultation fee?`,
      answer: `${name}'s consultation fee is ${fee}. Fees can vary by chamber — see each chamber's details on this page.`,
    });
  }

  // 4 — verification (always)
  items.push({
    question: `Is ${name} verified on Daktar.Link?`,
    answer: verificationAnswer(doc, name),
  });

  // 5 — appointment (always)
  items.push({
    question: `How can I book an appointment with ${name}?`,
    answer:
      doc.isClaimed && doc.chambers.length
        ? `You can request an appointment directly from ${name}'s profile on Daktar.Link, or visit a listed chamber during its scheduled hours.`
        : `Chamber locations and schedules are listed on this profile. ${name} can claim this profile on Daktar.Link to enable online appointment requests.`,
  });

  // 6 — languages (if any)
  if (doc.languages.length) {
    items.push({
      question: `What languages does ${name} speak?`,
      answer: `${name} consults in ${formatList(doc.languages.slice(0, 5))}.`,
    });
  }

  return items;
}
