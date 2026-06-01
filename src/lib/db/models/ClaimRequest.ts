/**
 * ClaimRequest — a doctor claims a pre-seeded profile, or submits BMDC
 * verification documents for an existing profile.
 *
 * Admin reviews in /admin/verifications, sets status='approved' or 'rejected'.
 * On approval, the corresponding Doctor is mutated: `isClaimed`, `claimedAt`,
 * `bmdcVerified`, `verificationLevel` are updated atomically with this doc.
 *
 * SLA: every request carries a `slaExpiresAt = createdAt + 24h` set on
 * insert and never overwritten. The admin queue sorts by this field so the
 * row closest to breaching surfaces first. On approval, `verifiedAt`
 * records when the reviewer acted (separate from `reviewedAt` to keep the
 * audit trail consistent if review-but-don't-approve flows are added later).
 */

import { Schema, model, models, type Model } from "mongoose";
import { VERIFICATION_SLA_MS } from "@/lib/sla";

export { VERIFICATION_SLA_MS };

const ClaimRequestSchema = new Schema(
  {
    doctorId: { type: Schema.Types.ObjectId, ref: "Doctor", required: true, index: true },
    requestedBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    bmdcNumberProvided: { type: String, default: null },
    // S3 keys of uploaded verification docs (BMDC cert, NID, etc.)
    documentsUploaded: { type: [String], default: [] },
    notesFromDoctor: { type: String, default: null, maxlength: 1000 },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    reviewerNotes: { type: String, default: null, maxlength: 1000 },

    // SLA: 24h commitment from createdAt. Computed in the pre-validate hook
    // on the first save (never overwritten). Old rows are backfilled lazily
    // — see `pre('save')` below.
    slaExpiresAt: { type: Date, default: null, index: true },
    // Stamp set when the reviewer approves the claim.
    verifiedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "claimRequests" },
);

ClaimRequestSchema.index({ status: 1, createdAt: -1 });
ClaimRequestSchema.index({ status: 1, slaExpiresAt: 1 });

// Compute `slaExpiresAt` on insert. Mongoose runs pre-validate for new docs
// before `createdAt` is auto-assigned by the timestamps plugin, so we use
// `Date.now()` directly. For old docs missing `slaExpiresAt`, the pre-save
// hook backfills based on the actual `createdAt`.
//
// Async/promise style: Mongoose 9 detects the function arity — when the
// hook has no `next` parameter it awaits the returned promise instead of
// calling a callback. This avoids the `next is not a function` runtime
// error we'd hit if the legacy callback-style signature gets typed wrong.
// `this: any` keeps the hook compatible with the loosely-typed
// `Model<unknown>` export used by the rest of the codebase; the schema
// owns the field-level validation.
(ClaimRequestSchema as unknown as { pre: Function }).pre("validate", async function (this: any) {
  if (this.isNew && !this.get("slaExpiresAt")) {
    this.set("slaExpiresAt", new Date(Date.now() + VERIFICATION_SLA_MS));
  }
});

(ClaimRequestSchema as unknown as { pre: Function }).pre("save", async function (this: any) {
  if (!this.get("slaExpiresAt")) {
    const created = (this.get("createdAt") as Date | undefined) ?? new Date();
    this.set("slaExpiresAt", new Date(created.getTime() + VERIFICATION_SLA_MS));
  }
});

export const ClaimRequest: Model<unknown> =
  (models.ClaimRequest as Model<unknown>) ?? model("ClaimRequest", ClaimRequestSchema);
