/**
 * Bangladesh phone normalization to E.164.
 *
 * Accepted input shapes (with arbitrary whitespace/dashes/parens):
 *   01711563450        → +8801711563450
 *   +8801711563450     → +8801711563450
 *   8801711563450      → +8801711563450
 *   1711563450         → +8801711563450  (leading-0 dropped)
 *   017-1156-3450      → +8801711563450
 *   (+880) 1711-563450 → +8801711563450
 *
 * BD mobile numbers are 11 digits starting with `01` (national format) — the
 * canonical operator prefix is `01[3-9]\d{8}`. We normalize to the 14-char
 * E.164 form `+8801[3-9]\d{8}`. Returns `null` for anything that doesn't
 * match a valid BD mobile pattern.
 */

const BD_MOBILE_RE = /^\+8801[3-9]\d{8}$/;

export function normalizeBdPhone(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const digits = raw.replace(/[^\d+]/g, "");
  if (!digits) return null;

  let core: string;
  if (digits.startsWith("+880")) core = digits.slice(4);
  else if (digits.startsWith("880")) core = digits.slice(3);
  else if (digits.startsWith("0")) core = digits.slice(1);
  else core = digits;

  // Now `core` should be a 10-digit national number starting with `1[3-9]`.
  if (core.length !== 10) return null;

  const candidate = `+880${core}`;
  return BD_MOBILE_RE.test(candidate) ? candidate : null;
}
