/**
 * Pure SMS helpers shared by the facade and the providers.
 *
 * Kept in their own module (rather than `client.ts`) so providers can import
 * them without creating a facade → provider → facade import cycle. `client.ts`
 * re-exports `estimateSegments` so the historical
 * `import { estimateSegments } from "@/lib/sms/client"` path keeps resolving.
 */

/**
 * SMS segment counter. Unicode bodies (Bangla, emoji) pack 70 chars per
 * segment; everything else packs 160. We over-estimate on the conservative
 * side — concatenated SMS headers reduce per-segment capacity to 153/67,
 * but the cost ceiling is what we actually need to reason about.
 */
export function estimateSegments(body: string, isUnicode: boolean): number {
  const limit = isUnicode ? 70 : 160;
  if (body.length === 0) return 0;
  return Math.ceil(body.length / limit);
}

/** Anything outside ASCII trips the Unicode billing tier on BD gateways. */
export function isUnicodeBody(body: string): boolean {
  return /[^\x00-\x7F]/.test(body);
}

/** Resolve the gateway `type` hint from an optional override + the body. */
export function resolveSmsType(body: string, override?: string): string {
  return override ?? (isUnicodeBody(body) ? "UNICODE" : "TEXT");
}
