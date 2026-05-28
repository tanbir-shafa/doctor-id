/**
 * Bangladesh Medical & Dental Council (BMDC) registration number validator.
 *
 * Format observed in public BMDC records: a numeric string, typically 5–6
 * digits. Older registrations may have an "A-" prefix (dental registration);
 * we accept both forms and normalize on storage.
 *
 * This is *format* validation only — the actual "is this a real doctor"
 * check happens via admin review of the uploaded certificate (Step 8).
 */

const BMDC_RE = /^(A-)?\d{4,7}$/;

export function isValidBmdcFormat(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return BMDC_RE.test(value.trim().toUpperCase());
}

export function normalizeBmdc(value: string): string {
  return value.trim().toUpperCase();
}
