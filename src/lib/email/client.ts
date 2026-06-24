/**
 * Bulk email facade for outbound campaigns.
 *
 * The email analogue of `sendSmsBatch` (lib/sms/client.ts): a STABLE surface
 * (`sendEmailBatch`) that the outbound script calls. SESv2 is strictly
 * 1-recipient-per-call, so this is a concurrency-bounded fan-out over the
 * single-send `sendEmail` (ses.ts) rather than a true gateway batch.
 *
 * Contract (mirrors BulkSmsResult so the script treats both channels alike):
 *   - results are returned in INPUT ORDER, one per message;
 *   - a recipient on the suppression list → `{ sent:false, suppressed:true }`
 *     and the batch CONTINUES (suppression is expected, not a run failure);
 *   - any other send error → `{ sent:false, errorMessage }`; the batch aborts
 *     only when `stopOnFailure` is set (default false — unlike SMS, where a
 *     chunk failure halts, one bad address shouldn't kill an email run);
 *   - the dev no-op (no SES creds → `sendEmail` resolves `{}` without throwing)
 *     yields `{ sent:true, messageId: undefined }`, so campaigns rehearse
 *     offline (mirrors the SMS bulk no-op marking rows sent:true).
 *
 * A coarse `globalEmailBudgetLimiter` caps total campaign volume per hour;
 * when it trips the remaining rows are marked `{ sent:false, errorMessage:
 * "EMAIL_BUDGET" }` and no further sends are attempted.
 */

import { sendEmail, SuppressedRecipientError } from "./ses";
import { globalEmailBudgetLimiter } from "@/lib/redis/ratelimit";

export interface BulkEmailMessage {
  /** Recipient address. */
  to: string;
  subject: string;
  /** HTML body. */
  body: string;
}

export interface BulkEmailResult {
  to: string;
  sent: boolean;
  messageId?: string;
  /** Reason a row didn't send: "SUPPRESSED", "EMAIL_BUDGET", or an SES error. */
  errorMessage?: string;
  /** True when skipped because the recipient is suppressed (distinct from an error). */
  suppressed?: boolean;
}

export interface BulkEmailOptions {
  /** Max concurrent SES SendEmail calls. Default 5. */
  concurrency?: number;
  /** Abort the run on the first hard (non-suppression) failure. Default false. */
  stopOnFailure?: boolean;
}

export async function sendEmailBatch(
  messages: BulkEmailMessage[],
  opts: BulkEmailOptions = {},
): Promise<BulkEmailResult[]> {
  const concurrency = Math.max(1, opts.concurrency ?? 5);
  const stopOnFailure = opts.stopOnFailure ?? false;

  // Pre-allocate so we can write back by original index (input order preserved).
  const results: BulkEmailResult[] = messages.map((m) => ({ to: m.to, sent: false }));

  let cursor = 0;
  let aborted = false;
  let budgetExhausted = false;

  async function worker(): Promise<void> {
    // `cursor++` is atomic between awaits (single-threaded), so no race.
    for (let idx = cursor++; idx < messages.length; idx = cursor++) {
      if (aborted) continue; // drain remaining indices, leave default sent:false
      const msg = messages[idx]!;

      if (budgetExhausted) {
        results[idx] = { to: msg.to, sent: false, errorMessage: "EMAIL_BUDGET" };
        continue;
      }
      const budget = await globalEmailBudgetLimiter.limit("email:global");
      if (!budget.success) {
        budgetExhausted = true;
        console.error("[Email budget] global hourly cap reached — halting campaign email run.");
        results[idx] = { to: msg.to, sent: false, errorMessage: "EMAIL_BUDGET" };
        continue;
      }

      try {
        const { messageId } = await sendEmail({
          email: msg.to,
          subject: msg.subject,
          body: msg.body,
        });
        results[idx] = { to: msg.to, sent: true, messageId };
      } catch (err) {
        if (err instanceof SuppressedRecipientError) {
          results[idx] = { to: msg.to, sent: false, suppressed: true, errorMessage: "SUPPRESSED" };
        } else {
          const errorMessage = err instanceof Error ? err.message : String(err);
          results[idx] = { to: msg.to, sent: false, errorMessage };
          if (stopOnFailure) aborted = true;
        }
      }
    }
  }

  const workerCount = Math.min(concurrency, messages.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
