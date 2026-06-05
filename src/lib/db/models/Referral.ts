/**
 * Referral — doctor-to-doctor referral tracking for the Founding Doctor badge.
 *
 * A Referral row is created (status "pending") when a new doctor registers OR
 * claims a seeded profile through someone's referral link/code. It flips to
 * "qualified" when that referred doctor's claim is APPROVED by an admin
 * (approveClaimAction) — the single approval chokepoint for both fresh
 * registrations and seeded-profile claims.
 *
 * A referrer who accumulates FOUNDING_DOCTOR_THRESHOLD *qualified* referrals
 * earns the permanent Founding Doctor badge (cached on `Doctor.foundingDoctor`).
 *
 * One referrer per referred doctor — the unique index on `referredDoctorId`
 * enforces first-touch attribution. Self-referral is blocked at write time in
 * the referral service. This is deliberately a SEPARATE model from
 * ClaimRequest/IdentityVerificationRequest: it never touches sign-in or
 * verification state.
 */

import { Schema, model, models, type Model } from "mongoose";

const ReferralSchema = new Schema(
  {
    referrerDoctorId: { type: Schema.Types.ObjectId, ref: "Doctor", required: true, index: true },
    referrerUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    // The doctor who was brought in. Unique (see index below) — first-touch wins.
    referredDoctorId: { type: Schema.Types.ObjectId, ref: "Doctor", required: true },
    referredUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    // Whether the referred doctor did a fresh registration or claimed a seeded profile.
    via: { type: String, enum: ["register", "claim"], required: true },
    // How the referral code arrived — telemetry only.
    source: { type: String, enum: ["link", "manual"], default: "link" },
    status: { type: String, enum: ["pending", "qualified"], default: "pending", index: true },
    qualifiedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "referrals" },
);

// Count qualified referrals per referrer (drives the badge threshold check).
ReferralSchema.index({ referrerDoctorId: 1, status: 1 });
// One referrer per referred doctor — first-touch dedup.
ReferralSchema.index({ referredDoctorId: 1 }, { unique: true });

export const Referral: Model<unknown> =
  (models.Referral as Model<unknown>) ?? model("Referral", ReferralSchema);
