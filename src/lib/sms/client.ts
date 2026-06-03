/**
 * Transactional SMS via the MDL gateway.
 *
 * Adapter shape mirrors the in-house wrapper Shafa already uses elsewhere:
 *   GET <MDL_SMS_API_BASE_URL>
 *     ?apiKey=...&senderId=...&contactNumbers=...&textBody=...&type=...&label=transactional
 *
 * Silently no-ops in dev when any MDL_SMS_* env var is missing — logs the
 * SMS payload to the console so the OTP flow stays testable offline. Mirror
 * of the SES client (`src/lib/email/ses.ts`) for the same UX reason.
 *
 * MDL response shape on failure (observed in the in-house snippet):
 *   { status: "FAILED", message: "<reason>" }
 * That value is mapped to `{ sent: false }` so callers don't need to know
 * the gateway specifics.
 */

import { env } from "@/lib/env";

export interface SmsMessage {
  /** E.164 phone, e.g. "+8801711000000". The gateway accepts a CSV of numbers; we always pass one. */
  to: string;
  /** Final rendered SMS body. */
  body: string;
  /** Gateway hint, e.g. "TEXT" | "UNICODE". Defaults to "TEXT" — call sites override for Bangla. */
  type?: string;
}

export interface SmsSendResult {
  sent: boolean;
  /** Gateway-side message id when available — not all responses include one. */
  messageId?: string;
  /** Estimated segments billed: 160-char ASCII or 70-char Unicode chunks. */
  segments: number;
}

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

function isUnicodeBody(body: string): boolean {
  // Anything outside ASCII trips the Unicode billing tier on most BD gateways.
  return /[^\x00-\x7F]/.test(body);
}

export async function sendSms(msg: SmsMessage): Promise<SmsSendResult> {
  const { MDL_SMS_API_BASE_URL, MDL_SMS_API_KEY, MDL_SMS_API_SENDER_ID } = env();
  const unicode = isUnicodeBody(msg.body);
  const type = msg.type ?? (unicode ? "UNICODE" : "TEXT");
  const segments = estimateSegments(msg.body, unicode);

  if (!MDL_SMS_API_BASE_URL || !MDL_SMS_API_KEY || !MDL_SMS_API_SENDER_ID) {
    // Dev fallback — print the would-be SMS so the developer can hand-verify
    // OTP flows without a real gateway.
    console.log("─── [MDL SMS no-op] would have sent SMS ───");
    console.log(`To:        ${msg.to}`);
    console.log(`Type:      ${type}  (${segments} segment${segments === 1 ? "" : "s"})`);
    console.log(`Body:      ${msg.body}`);
    console.log("───────────────────────────────────────────");
    return { sent: false, segments };
  }

  const url = new URL(MDL_SMS_API_BASE_URL);
  url.searchParams.set("apiKey", MDL_SMS_API_KEY);
  url.searchParams.set("senderId", MDL_SMS_API_SENDER_ID);
  url.searchParams.set("contactNumbers", msg.to);
  url.searchParams.set("textBody", msg.body);
  url.searchParams.set("type", type);
  url.searchParams.set("label", "transactional");

  try {
    const response = await fetch(url.toString(), { method: "GET" });
    if (!response.ok) {
      console.warn(`[MDL SMS] HTTP ${response.status} — ${await safeText(response)}`);
      return { sent: false, segments };
    }
    const payload = await safeJson(response);
    if (payload && typeof payload === "object" && (payload as { status?: string }).status === "FAILED") {
      console.warn(`[MDL SMS] gateway reported FAILED — ${(payload as { message?: string }).message ?? "no detail"}`);
      return { sent: false, segments };
    }
    const messageId =
      typeof payload === "object" && payload
        ? ((payload as { messageId?: string; message_id?: string }).messageId ??
          (payload as { message_id?: string }).message_id)
        : undefined;
    return { sent: true, messageId, segments };
  } catch (err) {
    console.error("[MDL SMS] request failed:", err);
    return { sent: false, segments };
  }
}

// ---------------------------------------------------------------------------
// Bulk send — body-grouped batching for the outbound acquisition script.
// ---------------------------------------------------------------------------

export interface BulkSmsMessage {
  to: string;
  body: string;
  type?: string;
}

export interface BulkSmsResult {
  to: string;
  body: string;
  sent: boolean;
  /** UUID for the MDL chunk this row was in — groups partial-failure rows for forensics. */
  batchId: string;
  /** Gateway error detail when sent=false. */
  errorMessage?: string;
  segments: number;
}

export interface BulkSmsOptions {
  /**
   * Max numbers per MDL API call. The gateway accepts up to 20 numbers in a
   * single `contactNumbers` CSV (per ops, 2026-05). Lower this if MDL ever
   * downgrades the cap — every other piece of the pipeline reads from here.
   */
  chunkSize?: number;
  /**
   * When true (default), stop the whole bulk send the first time a chunk
   * fails — matches the ops rule "wait for success then send next 20". The
   * unsent rows stay marked `sent: false`. Set false to fire-and-pray
   * through the failures (useful for soak tests, not for real campaigns).
   */
  stopOnFailure?: boolean;
}

const DEFAULT_CHUNK = 20;

/**
 * Bulk SMS dispatch optimized for MDL's "20 numbers per call" cap.
 *
 *   1. Group recipients by identical `body` — MDL's `contactNumbers` field
 *      is a CSV that all share one `textBody`, so we can only batch when
 *      bodies match. Personalized bodies (e.g. `{{firstName}}`) end up in
 *      single-element groups → 1 number per call.
 *   2. Chunk each group into 20s.
 *   3. Fire one GET per chunk, sequentially. The "wait for success" rule
 *      means we DO NOT parallelize chunks — easier to reason about partial
 *      failures and avoids overrunning per-second gateway caps.
 *   4. On failure: by default, stop and return partial results so the
 *      script can persist what got through and bail without burning the
 *      rest of the budget.
 *
 * Results are returned in input order (independent of grouping/chunking).
 */
export async function sendSmsBatch(
  messages: BulkSmsMessage[],
  opts: BulkSmsOptions = {},
): Promise<BulkSmsResult[]> {
  const chunkSize = opts.chunkSize ?? DEFAULT_CHUNK;
  const stopOnFailure = opts.stopOnFailure ?? true;

  // Pre-allocate the result array so we can write back by original index.
  const results: BulkSmsResult[] = messages.map((m) => ({
    to: m.to,
    body: m.body,
    sent: false,
    batchId: "",
    segments: estimateSegments(m.body, isUnicodeBody(m.body)),
  }));

  // Group by body — Map preserves insertion order, so result writes stay
  // deterministic for tests.
  const groups = new Map<string, Array<{ idx: number; msg: BulkSmsMessage }>>();
  messages.forEach((msg, idx) => {
    const list = groups.get(msg.body) ?? [];
    list.push({ idx, msg });
    groups.set(msg.body, list);
  });

  const { MDL_SMS_API_BASE_URL, MDL_SMS_API_KEY, MDL_SMS_API_SENDER_ID } = env();
  const devMode = !MDL_SMS_API_BASE_URL || !MDL_SMS_API_KEY || !MDL_SMS_API_SENDER_ID;

  outer: for (const [body, entries] of groups) {
    for (let i = 0; i < entries.length; i += chunkSize) {
      const chunk = entries.slice(i, i + chunkSize);
      const batchId = randomBatchId();
      const recipients = chunk.map((c) => c.msg.to);

      const result = await sendOneChunk({ body, recipients, devMode });

      for (const { idx } of chunk) {
        results[idx]!.batchId = batchId;
        results[idx]!.sent = result.ok;
        if (!result.ok && result.error) results[idx]!.errorMessage = result.error;
      }

      if (!result.ok && stopOnFailure) {
        console.warn(`[MDL SMS bulk] chunk failed (${result.error}) — halting campaign.`);
        break outer;
      }
    }
  }

  return results;
}

interface ChunkResult {
  ok: boolean;
  error?: string;
}

async function sendOneChunk({
  body,
  recipients,
  devMode,
}: {
  body: string;
  recipients: string[];
  devMode: boolean;
}): Promise<ChunkResult> {
  const unicode = isUnicodeBody(body);
  const type = unicode ? "UNICODE" : "TEXT";

  if (devMode) {
    console.log("─── [MDL SMS bulk no-op] would have sent chunk ───");
    console.log(`To:        ${recipients.length} recipient(s) — ${recipients.join(", ")}`);
    console.log(`Type:      ${type}`);
    console.log(`Body:      ${body}`);
    console.log("──────────────────────────────────────────────────");
    // Dev mode is treated as "ok" so the script's status accounting works
    // without creds. The persisted row reflects `sent: false` either way —
    // see the script's status mapping.
    return { ok: true };
  }

  const { MDL_SMS_API_BASE_URL, MDL_SMS_API_KEY, MDL_SMS_API_SENDER_ID } = env();
  const url = new URL(MDL_SMS_API_BASE_URL!);
  url.searchParams.set("apiKey", MDL_SMS_API_KEY!);
  url.searchParams.set("senderId", MDL_SMS_API_SENDER_ID!);
  url.searchParams.set("contactNumbers", recipients.join(","));
  url.searchParams.set("textBody", body);
  url.searchParams.set("type", type);
  url.searchParams.set("label", "transactional");

  try {
    const response = await fetch(url.toString(), { method: "GET" });
    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}` };
    }
    const payload = await safeJson(response);
    if (
      payload &&
      typeof payload === "object" &&
      (payload as { status?: string }).status === "FAILED"
    ) {
      return {
        ok: false,
        error: (payload as { message?: string }).message ?? "Gateway reported FAILED",
      };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function randomBatchId(): string {
  // Short hex id — uniqueness only needs to hold within a campaign run.
  return Math.random().toString(16).slice(2, 10) + Date.now().toString(36);
}

async function safeJson(r: Response): Promise<unknown> {
  try {
    return await r.json();
  } catch {
    return null;
  }
}

async function safeText(r: Response): Promise<string> {
  try {
    return await r.text();
  } catch {
    return "<no body>";
  }
}
