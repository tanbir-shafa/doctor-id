/**
 * MDL gateway provider (legacy fallback — selected by SMS_PROVIDER=mdl).
 *
 * In-house wrapper Shafa already uses elsewhere:
 *   GET <MDL_SMS_API_BASE_URL>
 *     ?apiKey=...&senderId=...&contactNumbers=...&textBody=...&type=...&label=transactional
 *
 * The gateway accepts up to 20 numbers as a `contactNumbers` CSV, all sharing
 * one `textBody`. Failure shape: { status: "FAILED", message: "<reason>" }.
 * MDL has no per-recipient status and no dynamic (mixed-body) endpoint, so this
 * provider omits `sendDynamic` and the facade falls back to single-body chunks.
 */

import { env } from "@/lib/env";
import type { SmsProvider, ProviderSingleResult, ProviderChunkResult } from "../types";

const MAX_BATCH = 20;

function creds() {
  const e = env();
  return { base: e.MDL_SMS_API_BASE_URL, key: e.MDL_SMS_API_KEY, senderId: e.MDL_SMS_API_SENDER_ID };
}

function isConfigured(): boolean {
  const { base, key, senderId } = creds();
  return !!(base && key && senderId);
}

function buildUrl(contactNumbers: string, body: string, type: string): string {
  const { base, key, senderId } = creds();
  const url = new URL(base!);
  url.searchParams.set("apiKey", key!);
  url.searchParams.set("senderId", senderId!);
  url.searchParams.set("contactNumbers", contactNumbers);
  url.searchParams.set("textBody", body);
  url.searchParams.set("type", type);
  url.searchParams.set("label", "transactional");
  return url.toString();
}

async function safeJson(r: Response): Promise<unknown> {
  try {
    return await r.json();
  } catch {
    return null;
  }
}

async function sendOne(args: { to: string; body: string; type: string }): Promise<ProviderSingleResult> {
  try {
    const response = await fetch(buildUrl(args.to, args.body, args.type), { method: "GET" });
    if (!response.ok) return { sent: false, error: `HTTP ${response.status}` };
    const payload = await safeJson(response);
    if (payload && typeof payload === "object" && (payload as { status?: string }).status === "FAILED") {
      return { sent: false, error: (payload as { message?: string }).message ?? "Gateway reported FAILED" };
    }
    const messageId =
      typeof payload === "object" && payload
        ? ((payload as { messageId?: string; message_id?: string }).messageId ??
          (payload as { message_id?: string }).message_id)
        : undefined;
    return { sent: true, messageId };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function sendChunk(args: {
  body: string;
  type: string;
  recipients: string[];
  batchId: string;
}): Promise<ProviderChunkResult> {
  try {
    const response = await fetch(buildUrl(args.recipients.join(","), args.body, args.type), {
      method: "GET",
    });
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
    const payload = await safeJson(response);
    if (payload && typeof payload === "object" && (payload as { status?: string }).status === "FAILED") {
      return { ok: false, error: (payload as { message?: string }).message ?? "Gateway reported FAILED" };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export const mdlProvider: SmsProvider = {
  name: "mdl",
  maxBatch: MAX_BATCH,
  isConfigured,
  sendOne,
  sendChunk,
  // No sendDynamic — facade falls back to single-body chunks (1 number/call).
};
