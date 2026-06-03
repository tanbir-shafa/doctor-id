/**
 * OptOut — phones that should NEVER receive outbound from us again.
 *
 * Populated two ways:
 *   - admin manual entry (someone WhatsApp'd to say "stop")
 *   - automated when MDL surfaces a STOP-reply webhook (Sprint B — wired
 *     by gateway-side webhook handler, schema-compatible already)
 *
 * The outbound script does a single batched `$in` lookup against this
 * collection before sending — so the per-row check is cheap even at 30k+
 * recipients.
 */

import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const OptOutSchema = new Schema(
  {
    /** E.164 normalized phone. */
    phone: { type: String, required: true, trim: true, unique: true },
    /** Free-form note from the admin who added the row (or 'STOP-reply' from webhook). */
    reason: { type: String, default: null, maxlength: 200 },
    /** Admin user id that added the opt-out (null for webhook-sourced). */
    addedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true, collection: "optOuts" },
);

export type OptOutDoc = InferSchemaType<typeof OptOutSchema> & { _id: string };

export const OptOut: Model<OptOutDoc> =
  (models.OptOut as Model<OptOutDoc>) ?? model<OptOutDoc>("OptOut", OptOutSchema);
