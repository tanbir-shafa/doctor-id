/**
 * IdentityVerificationRequest — a doctor submits a Government photo ID
 * (NID / Passport / Driving License) plus their legal first+last name for
 * "account" (identity) verification.
 *
 * Admin reviews in /admin/account-verifications, sets status='approved' or
 * 'rejected'. On approval the linked Doctor is mutated: `name.first`/`last`
 * are set to the verified legal name, `name.displayName` is locked to
 * `prefix + first + last`, `legalName` snapshot is stored, and `nidVerified`
 * + `verificationLevel` are recomputed (see approveAccountVerificationAction).
 *
 * This is deliberately a SEPARATE model from ClaimRequest: the BMDC claim
 * flow gates sign-in (`User.approved`) and must stay untouched. Identity
 * approval never changes login state.
 *
 * SLA: every request carries `slaExpiresAt = createdAt + 24h`, set on insert
 * and never overwritten — the admin queue sorts by it so the row closest to
 * breaching surfaces first. Mirrors ClaimRequest's SLA pattern verbatim.
 */

import type { Loose } from "@/lib/db/models/loose";
import { Schema, model, models, type Model } from "mongoose";
import { VERIFICATION_SLA_MS } from "@/lib/sla";

const LegalNameSchema = new Schema(
  {
    first: { type: String, required: true, trim: true },
    last: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const IdentityVerificationRequestSchema = new Schema(
  {
    doctorId: { type: Schema.Types.ObjectId, ref: "Doctor", required: true, index: true },
    requestedBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    // Legal first+last name as printed on the submitted Gov ID.
    legalName: { type: LegalNameSchema, required: true },
    idDocumentType: {
      type: String,
      enum: ["nid", "passport", "driving_license"],
      required: true,
    },
    // File-doc refs for the Gov ID image(s) (private bucket, read via presigned GET).
    documentFileIds: { type: [{ type: Schema.Types.ObjectId, ref: "File" }], default: [] },
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

    // SLA: 24h commitment from createdAt. Computed in the pre-validate hook on
    // the first save (never overwritten); old rows backfilled lazily in pre-save.
    slaExpiresAt: { type: Date, default: null, index: true },
    // Stamp set when the reviewer approves the request.
    verifiedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "identityVerificationRequests" },
);

IdentityVerificationRequestSchema.index({ status: 1, createdAt: -1 });
IdentityVerificationRequestSchema.index({ status: 1, slaExpiresAt: 1 });

// Async/promise-style hooks (Mongoose 9 awaits when there's no `next` param) —
// see the matching note in ClaimRequest.ts.
(IdentityVerificationRequestSchema as unknown as Loose).pre("validate", async function (this: { isNew?: boolean; get(path: string): unknown; set(path: string, value: unknown): unknown }) {
  if (this.isNew && !this.get("slaExpiresAt")) {
    this.set("slaExpiresAt", new Date(Date.now() + VERIFICATION_SLA_MS));
  }
});

(IdentityVerificationRequestSchema as unknown as Loose).pre("save", async function (this: { isNew?: boolean; get(path: string): unknown; set(path: string, value: unknown): unknown }) {
  if (!this.get("slaExpiresAt")) {
    const created = (this.get("createdAt") as Date | undefined) ?? new Date();
    this.set("slaExpiresAt", new Date(created.getTime() + VERIFICATION_SLA_MS));
  }
});

export const IdentityVerificationRequest: Model<unknown> =
  (models.IdentityVerificationRequest as Model<unknown>) ??
  model("IdentityVerificationRequest", IdentityVerificationRequestSchema);
