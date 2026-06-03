/**
 * User collection — auth only.
 *
 * A User is the *identity*: the credentials someone uses to log in. The
 * profile (Doctor) is a separate document referenced by userId/ownerId.
 * Splitting them keeps the auth surface small and lets us later support
 * patient/admin/clinic-admin users without bloating the Doctor schema.
 */

import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const UserSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, index: { unique: true } },
    // Optional: present for credentials sign-in, absent for OAuth-only users.
    passwordHash: { type: String, default: null, select: false },
    // Optional: present for Google OAuth users.
    googleId: { type: String, default: null, sparse: true, index: true },
    emailVerified: { type: Date, default: null },
    role: {
      type: String,
      enum: ["doctor", "admin", "patient"],
      default: "doctor",
      required: true,
      index: true,
    },
    // Admin must approve a new doctor account before they can sign in. Default
    // `true` so existing seed admins and any legacy rows are unaffected; the
    // registration flow explicitly sets `false` for new doctors, and the
    // `approveClaimAction` reviewer flow flips it back to `true`.
    approved: { type: Boolean, default: true, index: true },

    // Free Shafa EMR bundle (A.5). Provisioning is manual in Sprint A — ops
    // creates the EMR-side account and emails credentials. Engineering only
    // tracks the intent + admin's "mark ready" stamp so the dashboard can
    // surface the status to the doctor. No SSO, no API integration.
    emr: {
      type: new Schema(
        {
          requested: { type: Boolean, default: false, index: true },
          seatStatus: {
            type: String,
            enum: ["pending", "ready", "declined"],
            default: "pending",
            index: true,
          },
          accountEmail: { type: String, default: null },
          readyAt: { type: Date, default: null },
          declinedAt: { type: Date, default: null },
        },
        { _id: false },
      ),
      default: () => ({ requested: false }),
    },
    // E.164-normalized phone. Required for the SMS-magic-link claim flow
    // (A.4). Sparse-unique so unclaimed accounts without a phone don't
    // collide on null.
    phone: { type: String, default: null, trim: true },
    phoneVerified: { type: Boolean, default: false },
    // OTP secrets — never exposed to clients.
    smsOtpHash: { type: String, default: null, select: false },
    smsOtpExpiresAt: { type: Date, default: null, select: false },
    smsOtpAttempts: { type: Number, default: 0, select: false },
    // Pending registration payload — held between "start registration" (OTP
    // sent) and "verify OTP" (User + Doctor materialized atomically). The
    // sms-otp NextAuth provider consumes + clears this on successful auth.
    // `select: false` so it never leaks into ordinary queries.
    regDraft: {
      type: new Schema(
        {
          firstName: { type: String, default: null },
          lastName: { type: String, default: null },
          email: { type: String, default: null },
          bmdcNumber: { type: String, default: null },
          claimSlug: { type: String, default: null },
          // Mandatory live selfie (private bucket). Metadata stashed so the
          // File doc can be created at materialization without re-reading S3.
          selfieKey: { type: String, default: null },
          selfieSha256: { type: String, default: null },
          selfieSize: { type: Number, default: null },
          selfieMime: { type: String, default: null },
          expiresAt: { type: Date, default: null },
        },
        { _id: false },
      ),
      default: null,
      select: false,
    },
    // Email-verification + password-reset tokens. One slot, hashed at rest.
    verifyTokenHash: { type: String, default: null, select: false },
    verifyTokenExpiresAt: { type: Date, default: null, select: false },
    resetTokenHash: { type: String, default: null, select: false },
    resetTokenExpiresAt: { type: Date, default: null, select: false },
    lastLoginAt: { type: Date, default: null },
    // Soft-delete: when set, login is blocked and the account is anonymized.
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "users" },
);

// Phone uniqueness applies only when actually set. Same trick as the
// Doctor.bmdcNumber partial-filter index — `default: null` materializes the
// field so a plain sparse index would still collide on multiple nulls.
UserSchema.index(
  { phone: 1 },
  {
    unique: true,
    partialFilterExpression: { phone: { $type: "string" } },
    name: "phone_unique_when_present_idx",
  },
);

export type UserDoc = InferSchemaType<typeof UserSchema> & { _id: string };

export const User: Model<UserDoc> =
  (models.User as Model<UserDoc>) ?? model<UserDoc>("User", UserSchema);
