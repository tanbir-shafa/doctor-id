/**
 * OutboundMessage — one row per message sent (or attempted) by the outbound
 * acquisition script (A.8), across channels.
 *
 * For SMS the gateway dispatch is bulked (up to 100/call under SSL); for email
 * SESv2 is 1-recipient-per-call fanned out concurrently. Either way we persist
 * one row per recipient so the admin dashboard can report per-doctor outcomes:
 *   sent  (gateway / SES acked)
 *   failed (gateway rejected the batch this row was in, or SES errored)
 *   opted_out (recipient is on our OptOut list — never sent)
 *   suppressed (email only: on the SES/app suppression list — never sent)
 *   skipped (already-messaged dedupe hit; recorded for visibility)
 *
 * `to` holds the E.164 phone (SMS) or the lowercased email address (email).
 * `batchId` groups rows from the same SMS gateway call / email fan-out run for
 * post-mortems on partial failures. `campaignId` is the operator's free-form
 * tag for grouping a run.
 */

import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const OutboundMessageSchema = new Schema(
  {
    doctorId: { type: Schema.Types.ObjectId, ref: "Doctor", required: true, index: true },
    /** Free-form operator tag, e.g. `2026-w22-rxpad`. */
    campaignId: { type: String, required: true, index: true },
    /** Template key (e.g. `en-claim-rx-pad`). */
    templateId: { type: String, required: true, index: true },
    /** Channel — `sms` (default) or `email`. Forward-compat with WhatsApp. */
    channel: { type: String, enum: ["sms", "email"], default: "sms" },

    /** Final rendered body (post-template). Forensic replay. */
    body: { type: String, required: true },
    /** Destination — E.164 phone (SMS, via normalizeBdPhone) or lowercased email. */
    to: { type: String, required: true, index: true },

    status: {
      type: String,
      enum: ["queued", "sent", "failed", "opted_out", "suppressed", "skipped"],
      default: "queued",
      required: true,
      index: true,
    },
    sentAt: { type: Date, default: null },
    /** Set if a claim ties back to this row within 30 days of send. */
    claimedAt: { type: Date, default: null },
    /** Gateway / SES response detail when status === 'failed' (or 'suppressed'). */
    errorMessage: { type: String, default: null },

    /** UUID grouping rows that went out in the same gateway call / email run. */
    batchId: { type: String, default: null, index: true },
  },
  { timestamps: true, collection: "outboundMessages" },
);

// Idempotency: don't message the same doctor with the same template inside
// the 7-day reset window. The script enforces the window in a query rather
// than as a unique index — uniqueness alone would block re-sends across
// campaigns, which is a legitimate use case after a quarter.
OutboundMessageSchema.index({ doctorId: 1, templateId: 1, sentAt: -1 });
OutboundMessageSchema.index({ campaignId: 1, status: 1 });
OutboundMessageSchema.index({ to: 1, claimedAt: 1 });

export type OutboundMessageDoc = InferSchemaType<typeof OutboundMessageSchema> & {
  _id: string;
};

export const OutboundMessage: Model<OutboundMessageDoc> =
  (models.OutboundMessage as Model<OutboundMessageDoc>) ??
  model<OutboundMessageDoc>("OutboundMessage", OutboundMessageSchema);
