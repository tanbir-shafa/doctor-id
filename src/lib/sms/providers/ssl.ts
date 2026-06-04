/**
 * SSL Wireless "iSMS Plus" v3 provider.
 *
 * Wire contract (confirmed from https://ismsplus.sslwireless.com/api-documentation):
 *   Base:  https://smsplus.sslwireless.com/api/v3   (Content-Type: application/json)
 *   Auth:  { api_token, sid } in the JSON body. The request IP must be
 *          whitelisted in the SSL portal or every call returns status:"FAILED".
 *   single:  POST /send-sms          { api_token, sid, msisdn, sms, csms_id }
 *   bulk:    POST /send-sms/bulk      { api_token, sid, msisdn: string[], sms, batch_csms_id }   (<=100)
 *   dynamic: POST /send-sms/dynamic   { api_token, sid, sms: [{ msisdn, text, csms_id }] }       (<=100)
 *   response (all): { status: "SUCCESS"|"FAILED", status_code, error_message,
 *                     smsinfo: [{ sms_status, status_message, msisdn, sms_type, csms_id, reference_id }] }
 *
 * `reference_id` is SSL's message id → mapped to our `messageId`. Per-recipient
 * status lives in `smsinfo[]` and is matched back to the input recipients by
 * normalized msisdn, then returned in input order.
 */

import { randomBytes } from "node:crypto";
import { env } from "@/lib/env";
import type {
  SmsProvider,
  ProviderSingleResult,
  ProviderChunkResult,
  ProviderPerRecipient,
} from "../types";

const MAX_BATCH = 100;

interface SslInfo {
  sms_status?: string; // "SUCCESS" | "INVALID" | "DUPLICATE" | "BLOCKED"
  status_message?: string;
  msisdn?: string;
  sms_type?: string; // "EN" | "BN"
  csms_id?: string;
  reference_id?: string;
}

interface SslResponse {
  status?: string; // "SUCCESS" | "FAILED"
  status_code?: number; // 200 ok; 4xxx errors
  error_message?: string;
  smsinfo?: SslInfo[];
}

/**
 * Normalize an internal E.164 phone to SSL's `msisdn` (numeric, no `+`, <=16).
 * "+8801711563450" → "8801711563450". Defensive about "00" intl prefix and a
 * bare national "01XXXXXXXXX" — callers already pass `normalizeBdPhone` output.
 */
export function toMsisdn(input: string): string {
  let s = (input ?? "").trim();
  if (s.startsWith("+")) s = s.slice(1);
  else if (s.startsWith("00")) s = s.slice(2);
  s = s.replace(/\D/g, "");
  if (/^01\d{9}$/.test(s)) s = "880" + s.slice(1);
  return s;
}

/**
 * Collision-safe id within the 20-char `csms_id`/`batch_csms_id` limit.
 * base36(timestamp) (~8) + 6 random hex chars, hard-trimmed to 20.
 */
export function makeCsmsId(): string {
  return (Date.now().toString(36) + randomBytes(4).toString("hex").slice(0, 6)).slice(0, 20);
}

function creds() {
  const e = env();
  return { token: e.SSL_SMS_API_TOKEN, sid: e.SSL_SMS_SID, base: e.SSL_SMS_API_BASE_URL };
}

function isConfigured(): boolean {
  const { token, sid } = creds();
  return !!(token && sid);
}

/** Top-level gateway success: status SUCCESS and (status_code 200 when present). */
function topLevelOk(payload: SslResponse): boolean {
  return payload.status === "SUCCESS" && (payload.status_code === undefined || payload.status_code === 200);
}

function chunkError(payload: SslResponse): string {
  return payload.error_message || `SSL status ${payload.status ?? "?"} (${payload.status_code ?? "?"})`;
}

async function postJson(
  path: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; payload: SslResponse | null; error?: string }> {
  const { base } = creds();
  try {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { ok: false, payload: null, error: `HTTP ${res.status}` };
    const payload = (await res.json().catch(() => null)) as SslResponse | null;
    return { ok: true, payload };
  } catch (err) {
    return { ok: false, payload: null, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Match `smsinfo[]` rows back to the input recipients by normalized msisdn and
 * return per-recipient outcomes IN INPUT ORDER. Rows missing from `smsinfo`
 * fall back to the chunk-level status.
 */
function mapPerRecipient(
  recipients: string[],
  payload: SslResponse,
  okTop: boolean,
): ProviderPerRecipient[] {
  const byMsisdn = new Map<string, SslInfo>();
  for (const info of payload.smsinfo ?? []) {
    if (info.msisdn) byMsisdn.set(info.msisdn, info);
  }
  return recipients.map((to) => {
    const info = byMsisdn.get(toMsisdn(to));
    if (info) {
      const ok = info.sms_status === "SUCCESS";
      return {
        to,
        ok,
        error: ok ? undefined : info.status_message || info.sms_status || "send failed",
        messageId: info.reference_id,
      };
    }
    return { to, ok: okTop, error: okTop ? undefined : chunkError(payload) };
  });
}

async function sendOne(args: { to: string; body: string; type: string }): Promise<ProviderSingleResult> {
  const { token, sid } = creds();
  const { ok, payload, error } = await postJson("/send-sms", {
    api_token: token,
    sid,
    msisdn: toMsisdn(args.to),
    sms: args.body,
    csms_id: makeCsmsId(),
  });
  if (!ok || !payload) return { sent: false, error: error ?? "request failed" };

  const info = payload.smsinfo?.[0];
  const sent = topLevelOk(payload) && (info ? info.sms_status === "SUCCESS" : true);
  return {
    sent,
    messageId: info?.reference_id,
    error: sent ? undefined : info?.status_message || chunkError(payload),
  };
}

async function sendChunk(args: {
  body: string;
  type: string;
  recipients: string[];
  batchId: string;
}): Promise<ProviderChunkResult> {
  const { token, sid } = creds();
  const { ok, payload, error } = await postJson("/send-sms/bulk", {
    api_token: token,
    sid,
    msisdn: args.recipients.map(toMsisdn),
    sms: args.body,
    batch_csms_id: args.batchId.slice(0, 20),
  });
  if (!ok || !payload) return { ok: false, error: error ?? "request failed" };

  const okTop = topLevelOk(payload);
  return {
    ok: okTop,
    error: okTop ? undefined : chunkError(payload),
    perRecipient: mapPerRecipient(args.recipients, payload, okTop),
  };
}

async function sendDynamic(args: {
  items: Array<{ to: string; body: string; type: string }>;
  batchId: string;
}): Promise<ProviderChunkResult> {
  const { token, sid } = creds();
  const { ok, payload, error } = await postJson("/send-sms/dynamic", {
    api_token: token,
    sid,
    sms: args.items.map((it) => ({ msisdn: toMsisdn(it.to), text: it.body, csms_id: makeCsmsId() })),
  });
  if (!ok || !payload) return { ok: false, error: error ?? "request failed" };

  const okTop = topLevelOk(payload);
  return {
    ok: okTop,
    error: okTop ? undefined : chunkError(payload),
    perRecipient: mapPerRecipient(
      args.items.map((i) => i.to),
      payload,
      okTop,
    ),
  };
}

export const sslProvider: SmsProvider = {
  name: "ssl",
  maxBatch: MAX_BATCH,
  isConfigured,
  sendOne,
  sendChunk,
  sendDynamic,
};
