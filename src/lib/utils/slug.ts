/**
 * URL-safe slug generator for doctor profiles.
 *
 * Example: `Dr. Karim Rahman` + `Cardiology` → `karim-rahman-cardiologist`
 *
 * Collision handling is the caller's responsibility — pass a `disambiguator`
 * (typically the BMDC number's last 4 digits or an incrementing counter) when
 * the base slug already exists. The model layer should retry with a fresh
 * disambiguator on duplicate-key error rather than pre-checking, to avoid
 * a TOCTOU race under concurrent signups.
 */

const SPECIALTY_TO_NOUN: Record<string, string> = {
  cardiology: "cardiologist",
  dermatology: "dermatologist",
  pediatrics: "pediatrician",
  gynecology: "gynecologist",
  obstetrics: "obstetrician",
  "general medicine": "physician",
  "internal medicine": "physician",
  neurology: "neurologist",
  orthopedics: "orthopedic-surgeon",
  ophthalmology: "ophthalmologist",
  psychiatry: "psychiatrist",
  surgery: "surgeon",
  urology: "urologist",
  oncology: "oncologist",
  endocrinology: "endocrinologist",
  gastroenterology: "gastroenterologist",
  nephrology: "nephrologist",
  pulmonology: "pulmonologist",
  rheumatology: "rheumatologist",
  hematology: "hematologist",
  ent: "ent-specialist",
};

function specialtyNoun(specialty?: string): string | null {
  if (!specialty) return null;
  const key = specialty.trim().toLowerCase();
  return SPECIALTY_TO_NOUN[key] ?? slugify(key);
}

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .replace(/&/g, " and ")
    .replace(/[^a-zA-Z0-9\s-]/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export interface GenerateSlugInput {
  /** Display name, e.g. "Karim Rahman" — title prefix ("Dr.") will be stripped. */
  displayName: string;
  /** Primary specialty, used as a suffix noun. Optional. */
  primarySpecialty?: string;
  /** Disambiguator appended after collision (e.g. "2", "4521"). Optional. */
  disambiguator?: string | number;
}

export function generateSlug({
  displayName,
  primarySpecialty,
  disambiguator,
}: GenerateSlugInput): string {
  const namePart = slugify(displayName.replace(/^(dr|prof|prof\.\s*dr|mr|ms|mrs|miss)\.?\s+/i, ""));
  const specialtyPart = specialtyNoun(primarySpecialty);
  const parts = [namePart];
  if (specialtyPart) parts.push(specialtyPart);
  if (disambiguator !== undefined && disambiguator !== null && String(disambiguator).length > 0) {
    parts.push(String(disambiguator));
  }
  return parts.filter(Boolean).join("-");
}
