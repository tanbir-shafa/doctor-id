/**
 * OptOut — recipients that should NEVER receive outbound from us again.
 *
 * One roster spanning both channels (`channel: "sms" | "email"`). The outbound
 * script does a single batched `$in` lookup against this collection — keyed on
 * `phone` (SMS) or `email` (email) — before sending, so the per-row check is
 * cheap even at 30k+ recipients.
 *
 * Populated three ways:
 *   - admin manual entry (someone WhatsApp'd / replied to say "stop"),
 *   - the public `/api/unsubscribe` route (email — one-click from the footer),
 *   - automated when a gateway surfaces a STOP-reply webhook (Sprint B — wired
 *     by the gateway-side webhook handler, schema-compatible already).
 *
 * This collection is the intent list WE own and query in the campaign. The SES
 * DynamoDB suppression list (the AWS-side deliverability backstop `sendEmail`
 * checks before every send) is a separate layer; mirroring email opt-outs into
 * it is a deferred enhancement.
 */

import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const OptOutSchema = new Schema(
  {
    /** Which channel this opt-out applies to. */
    channel: { type: String, enum: ["sms", "email"], default: "sms", required: true, index: true },
    /** E.164 normalized phone (SMS opt-outs). Null for email rows. */
    phone: { type: String, default: null, trim: true },
    /** Lowercased email address (email opt-outs). Null for SMS rows. */
    email: { type: String, default: null, trim: true, lowercase: true },
    /** Free-form note (admin reason, 'unsubscribe-link', or 'STOP-reply' from webhook). */
    reason: { type: String, default: null, maxlength: 200 },
    /** Admin user id that added the opt-out (null for webhook / unsubscribe-link). */
    addedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true, collection: "optOuts" },
);

// Partial-unique per field (the #5a trick): `default: null` materializes the
// field, so a plain `sparse`/`unique` index would collide on multiple nulls.
// A partial filter on `$type: "string"` only indexes rows where the field is
// actually set, letting SMS rows (phone-only) and email rows (email-only)
// coexist without false collisions.
OptOutSchema.index(
  { phone: 1 },
  {
    unique: true,
    partialFilterExpression: { phone: { $type: "string" } },
    name: "optout_phone_unique_when_present_idx",
  },
);
OptOutSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: { email: { $type: "string" } },
    name: "optout_email_unique_when_present_idx",
  },
);

export type OptOutDoc = InferSchemaType<typeof OptOutSchema> & { _id: string };

export const OptOut: Model<OptOutDoc> =
  (models.OptOut as Model<OptOutDoc>) ?? model<OptOutDoc>("OptOut", OptOutSchema);
