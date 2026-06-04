/**
 * Shared SMS types: the public contract consumed by call sites (`SmsMessage`,
 * `SmsSendResult`, `BulkSms*`) and the internal provider contract
 * (`SmsProvider`) implemented by `providers/ssl.ts` + `providers/mdl.ts`.
 *
 * The facade (`client.ts`) owns Unicode detection, segment estimation, the
 * dev-mode no-op, body-grouping, and input-order shaping. Providers own only
 * the wire protocol for a single send and a single chunk.
 */

// ---------------------------------------------------------------------------
// Public contract (stable — call sites depend on these shapes).
// ---------------------------------------------------------------------------

export interface SmsMessage {
  /** E.164 phone, e.g. "+8801711000000". */
  to: string;
  /** Final rendered SMS body. */
  body: string;
  /** Gateway hint, e.g. "TEXT" | "UNICODE". Defaults to auto-detect. */
  type?: string;
}

export interface SmsSendResult {
  sent: boolean;
  /** Gateway-side message id when available (SSL `reference_id`). */
  messageId?: string;
  /** Estimated segments billed: 160-char ASCII or 70-char Unicode chunks. */
  segments: number;
}

export interface BulkSmsMessage {
  to: string;
  body: string;
  type?: string;
}

export interface BulkSmsResult {
  to: string;
  body: string;
  sent: boolean;
  /** Id of the gateway call this row was in — groups partial-failure rows. */
  batchId: string;
  /** Gateway error detail when sent=false. */
  errorMessage?: string;
  segments: number;
}

export interface BulkSmsOptions {
  /**
   * Max recipients/messages per gateway call. Defaults to the active
   * provider's `maxBatch` (SSL 100, MDL 20) when omitted.
   */
  chunkSize?: number;
  /**
   * When true (default), stop the whole bulk send the first time a chunk
   * fails. Unsent rows stay marked `sent: false`.
   */
  stopOnFailure?: boolean;
}

// ---------------------------------------------------------------------------
// Provider contract (internal — facade ↔ provider seam).
// ---------------------------------------------------------------------------

export interface ProviderSingleResult {
  sent: boolean;
  messageId?: string;
  error?: string;
}

export interface ProviderPerRecipient {
  /** The original recipient string passed in (NOT the normalized msisdn). */
  to: string;
  ok: boolean;
  error?: string;
  messageId?: string;
}

export interface ProviderChunkResult {
  /** Chunk-level success (top-level gateway status). */
  ok: boolean;
  /** Chunk-level error detail when ok=false. */
  error?: string;
  /**
   * Optional per-recipient outcomes, returned in the SAME ORDER as the input
   * recipients/items. Only providers that surface per-recipient status (SSL's
   * `smsinfo[]`) populate this; when absent the facade applies the chunk-level
   * `ok` to every row in the chunk.
   */
  perRecipient?: ProviderPerRecipient[];
}

export interface SmsProvider {
  /** Stable provider key (used in the dev no-op banner + selector). */
  readonly name: string;
  /** Max recipients/messages per gateway call. */
  readonly maxBatch: number;
  /** True when creds are present and real dispatch should happen. */
  isConfigured(): boolean;
  /** Send one SMS to one recipient. Body + type already resolved by the facade. */
  sendOne(args: { to: string; body: string; type: string }): Promise<ProviderSingleResult>;
  /** Send one chunk of same-body recipients (SSL → /send-sms/bulk; MDL → CSV GET). */
  sendChunk(args: {
    body: string;
    type: string;
    recipients: string[];
    batchId: string;
  }): Promise<ProviderChunkResult>;
  /**
   * Optional: send a chunk of distinct-body messages in one call (SSL →
   * /send-sms/dynamic). When omitted (MDL), the facade falls back to
   * one single-body `sendChunk` per message.
   */
  sendDynamic?(args: {
    items: Array<{ to: string; body: string; type: string }>;
    batchId: string;
  }): Promise<ProviderChunkResult>;
}
