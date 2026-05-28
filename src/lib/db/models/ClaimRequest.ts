/**
 * ClaimRequest — a doctor claims a pre-seeded profile, or submits BMDC
 * verification documents for an existing profile.
 *
 * Admin reviews in /admin/verifications, sets status='approved' or 'rejected'.
 * On approval, the corresponding Doctor is mutated: `isClaimed`, `claimedAt`,
 * `bmdcVerified`, `verificationLevel` are updated atomically with this doc.
 */

import { Schema, model, models, type Model } from "mongoose";

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
  },
  { timestamps: true, collection: "claimRequests" },
);

ClaimRequestSchema.index({ status: 1, createdAt: -1 });

export const ClaimRequest: Model<unknown> =
  (models.ClaimRequest as Model<unknown>) ?? model("ClaimRequest", ClaimRequestSchema);
