/**
 * AuditLog — generic activity trail.
 *
 * One collection captures every admin-or-system action worth remembering:
 * doctor profile edits performed by an admin on a doctor's behalf, claim
 * approvals/rejections, future role changes, etc.
 *
 * Shape:
 *   - `type` is a dot-namespaced action key (e.g. "doctor.profile_basic.updated",
 *     "claim.approved"). The reader filters / groups on this string.
 *   - `entityType` + `entityId` denormalize the affected record so we can list
 *     "history of this doctor" or "history of this claim" with a single index hit.
 *   - `actorId` + `actorRole` + `actorEmail` (snapshot) describe who acted.
 *   - `metadata` carries a small before/after diff or any structured context.
 *   - `note` is free-text the actor can attach (e.g. reviewer notes on rejection).
 *
 * Persistence: no TTL — audit logs are kept indefinitely.
 */

import { Schema, model, models, type Model } from "mongoose";

const AuditLogSchema = new Schema(
  {
    type: { type: String, required: true, trim: true, index: true },
    entityType: { type: String, required: true, trim: true, index: true },
    entityId: { type: Schema.Types.ObjectId, required: true, index: true },

    actorId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    actorRole: {
      type: String,
      enum: ["admin", "doctor", "patient", "system"],
      default: "system",
    },
    actorEmail: { type: String, default: null },

    metadata: { type: Schema.Types.Mixed, default: null },
    note: { type: String, default: null, maxlength: 2000 },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "auditLogs" },
);

// Lookup history for a specific entity (a doctor's edit log, a claim's review history, …).
AuditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
// "What has this admin done lately?"
AuditLogSchema.index({ actorId: 1, createdAt: -1 });
// Recent activity by action type (e.g. all claim approvals).
AuditLogSchema.index({ type: 1, createdAt: -1 });

export const AuditLog: Model<unknown> =
  (models.AuditLog as Model<unknown>) ?? model("AuditLog", AuditLogSchema);
