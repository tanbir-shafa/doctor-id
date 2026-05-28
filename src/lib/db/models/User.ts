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

export type UserDoc = InferSchemaType<typeof UserSchema> & { _id: string };

export const User: Model<UserDoc> =
  (models.User as Model<UserDoc>) ?? model<UserDoc>("User", UserSchema);
