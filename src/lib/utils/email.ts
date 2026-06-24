/**
 * Email normalization for outbound campaigns.
 *
 * Mirrors `normalizeBdPhone` (phone.ts): trims, lowercases, and validates a
 * single address against a pragmatic RFC-5322-ish pattern. Returns `null` for
 * anything that doesn't look deliverable, so the campaign script can treat an
 * un-normalizable address the same way it treats a missing phone (skip it).
 *
 * This is intentionally NOT a full RFC validator — it rejects the obviously
 * broken (no `@`, no domain dot, spaces, multiple `@`) while accepting normal
 * `local@domain.tld` addresses.
 */

// One `@`, a non-empty local part, a domain with at least one dot and a 2+ char
// TLD. No whitespace anywhere.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  return EMAIL_RE.test(trimmed) ? trimmed : null;
}
