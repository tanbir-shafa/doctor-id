/**
 * Transactional + bulk SMS facade.
 *
 * This is the STABLE public surface (`sendSms`, `sendSmsBatch`,
 * `estimateSegments`, and the SMS types) that every call site imports. It owns
 * Unicode detection, segment estimation, the dev-mode console no-op, body
 * grouping, and input-order result shaping. The actual wire protocol is
 * delegated to the provider selected by `SMS_PROVIDER` (see ./provider) —
 * SSL Wireless iSMS Plus v3 by default, MDL as a fallback.
 *
 * Dev fallback: when the active provider isn't configured (creds absent), the
 * would-be SMS is printed to the console and `sent:false` (single) / `sent:true`
 * rows (batch, so the campaign script can flow) are returned — mirroring the
 * SES email client so OTP + campaign flows stay testable offline.
 */

import { randomBytes } from "node:crypto";
import { estimateSegments, isUnicodeBody, resolveSmsType } from "./estimate";
import { getSmsProvider } from "./provider";
import type {
  SmsMessage,
  SmsSendResult,
  BulkSmsMessage,
  BulkSmsResult,
  BulkSmsOptions,
  ProviderChunkResult,
} from "./types";

// Re-exports so historical import paths keep resolving.
export { estimateSegments } from "./estimate";
export type {
  SmsMessage,
  SmsSendResult,
  BulkSmsMessage,
  BulkSmsResult,
  BulkSmsOptions,
} from "./types";

/** Entry = a message paired with its original index, so results stay in input order. */
type Entry = { idx: number; msg: BulkSmsMessage };

/** <=20 chars (SSL `batch_csms_id` limit), collision-safe within a campaign run. */
function makeBatchId(): string {
  return (Date.now().toString(36) + randomBytes(4).toString("hex")).slice(0, 20);
}

// ---------------------------------------------------------------------------
// Single send.
// ---------------------------------------------------------------------------

export async function sendSms(msg: SmsMessage): Promise<SmsSendResult> {
  const unicode = isUnicodeBody(msg.body);
  const type = resolveSmsType(msg.body, msg.type);
  const segments = estimateSegments(msg.body, unicode);
  const provider = getSmsProvider();

  if (!provider.isConfigured()) {
    console.log(`─── [${provider.name.toUpperCase()} SMS no-op] would have sent SMS ───`);
    console.log(`To:        ${msg.to}`);
    console.log(`Type:      ${type}  (${segments} segment${segments === 1 ? "" : "s"})`);
    console.log(`Body:      ${msg.body}`);
    console.log("───────────────────────────────────────────");
    return { sent: false, segments };
  }

  const res = await provider.sendOne({ to: msg.to, body: msg.body, type });
  if (!res.sent) {
    // Configured provider but the send failed (gateway/IP/auth error). Log it
    // — otherwise the failure is invisible (the caller often ignores the result).
    console.warn(`[${provider.name} SMS] send to ${msg.to} failed: ${res.error ?? "unknown error"}`);
    return { sent: false, segments };
  }
  return { sent: true, messageId: res.messageId, segments };
}

// ---------------------------------------------------------------------------
// Bulk send — body-grouped, provider-aware batching for the outbound script.
// ---------------------------------------------------------------------------

/**
 * Bulk SMS dispatch.
 *
 *   1. Group recipients by identical `body` (insertion order preserved).
 *   2. Partition groups: multi-recipient same-body groups → the provider's
 *      `sendChunk` (SSL `/send-sms/bulk`, MDL CSV GET), chunked at the
 *      provider's `maxBatch` (SSL 100 / MDL 20). Unique/personalized bodies →
 *      the provider's `sendDynamic` (SSL `/send-sms/dynamic`, 100/call) when
 *      available; otherwise one single-body chunk per message (MDL = today).
 *   3. Fire one call per chunk, sequentially. On failure: by default, stop and
 *      return partial results so the script persists what got through.
 *
 * Results are returned in input order (independent of grouping/chunking).
 */
export async function sendSmsBatch(
  messages: BulkSmsMessage[],
  opts: BulkSmsOptions = {},
): Promise<BulkSmsResult[]> {
  const provider = getSmsProvider();
  const chunkSize = opts.chunkSize ?? provider.maxBatch;
  const stopOnFailure = opts.stopOnFailure ?? true;

  // Pre-allocate the result array so we can write back by original index.
  const results: BulkSmsResult[] = messages.map((m) => ({
    to: m.to,
    body: m.body,
    sent: false,
    batchId: "",
    segments: estimateSegments(m.body, isUnicodeBody(m.body)),
  }));

  // Group by body — Map preserves insertion order for deterministic results.
  const groups = new Map<string, Entry[]>();
  messages.forEach((msg, idx) => {
    const list = groups.get(msg.body) ?? [];
    list.push({ idx, msg });
    groups.set(msg.body, list);
  });

  // Dev no-op: print each chunk, mark rows sent:true so the script can flow.
  if (!provider.isConfigured()) {
    for (const [body, entries] of groups) {
      for (let i = 0; i < entries.length; i += chunkSize) {
        const chunk = entries.slice(i, i + chunkSize);
        const batchId = makeBatchId();
        console.log(`─── [${provider.name.toUpperCase()} SMS bulk no-op] would have sent chunk ───`);
        console.log(`To:        ${chunk.length} recipient(s) — ${chunk.map((c) => c.msg.to).join(", ")}`);
        console.log(`Body:      ${body}`);
        console.log("──────────────────────────────────────────────────");
        for (const { idx } of chunk) {
          results[idx]!.batchId = batchId;
          results[idx]!.sent = true;
        }
      }
    }
    return results;
  }

  // Partition: multi-recipient same-body groups vs unique-body singletons.
  const multi: Entry[][] = [];
  const singletons: Entry[] = [];
  for (const entries of groups.values()) {
    if (entries.length >= 2) multi.push(entries);
    else singletons.push(entries[0]!);
  }

  // Build the sequential operation list.
  type Op =
    | { kind: "chunk"; body: string; type: string; entries: Entry[] }
    | { kind: "dynamic"; entries: Entry[] };
  const ops: Op[] = [];

  for (const entries of multi) {
    const body = entries[0]!.msg.body;
    const type = resolveSmsType(body);
    for (let i = 0; i < entries.length; i += chunkSize) {
      ops.push({ kind: "chunk", body, type, entries: entries.slice(i, i + chunkSize) });
    }
  }

  if (provider.sendDynamic && singletons.length > 0) {
    for (let i = 0; i < singletons.length; i += chunkSize) {
      ops.push({ kind: "dynamic", entries: singletons.slice(i, i + chunkSize) });
    }
  } else {
    // No dynamic endpoint (MDL): one single-body chunk per unique body.
    for (const s of singletons) {
      ops.push({ kind: "chunk", body: s.msg.body, type: resolveSmsType(s.msg.body), entries: [s] });
    }
  }

  // Fire sequentially; halt on the first failure when stopOnFailure.
  for (const op of ops) {
    const batchId = makeBatchId();
    let result: ProviderChunkResult;
    if (op.kind === "chunk") {
      result = await provider.sendChunk({
        body: op.body,
        type: op.type,
        recipients: op.entries.map((e) => e.msg.to),
        batchId,
      });
    } else {
      result = await provider.sendDynamic!({
        items: op.entries.map((e) => ({
          to: e.msg.to,
          body: e.msg.body,
          type: resolveSmsType(e.msg.body),
        })),
        batchId,
      });
    }

    applyChunkResult(results, op.entries, batchId, result);

    if (!result.ok && stopOnFailure) {
      console.warn(
        `[${provider.name} SMS bulk] chunk failed (${result.error ?? "unknown"}) — halting campaign.`,
      );
      break;
    }
  }

  return results;
}

/**
 * Write a chunk's outcome back to the pre-allocated rows by original index.
 * Prefers the provider's per-recipient detail (SSL `smsinfo[]`, returned in
 * input order); falls back to the chunk-level `ok` for every row (MDL).
 */
function applyChunkResult(
  results: BulkSmsResult[],
  entries: Entry[],
  batchId: string,
  result: ProviderChunkResult,
): void {
  const per = result.perRecipient;
  if (per && per.length === entries.length) {
    entries.forEach((e, i) => {
      const pr = per[i]!;
      results[e.idx]!.batchId = batchId;
      results[e.idx]!.sent = pr.ok;
      if (!pr.ok) results[e.idx]!.errorMessage = pr.error ?? result.error;
    });
    return;
  }
  for (const e of entries) {
    results[e.idx]!.batchId = batchId;
    results[e.idx]!.sent = result.ok;
    if (!result.ok) results[e.idx]!.errorMessage = result.error;
  }
}
