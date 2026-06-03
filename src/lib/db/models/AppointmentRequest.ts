/**
 * AppointmentRequest — patient-initiated request from the public profile page.
 *
 * No auth on creation: the public form on `/[slug]` posts directly. We
 * defend with a honeypot (Zod-rejects when filled), IP rate-limit, phone
 * rate-limit, and an ipHash audit field for forensic abuse investigation.
 *
 * The status lifecycle is doctor-driven:
 *   pending → seen → booked   (success path)
 *   pending → rejected         (declined)
 *   pending → seen → rejected  (after a closer look)
 *
 * Notification side-effect (SMS to the doctor) happens in the Server Action,
 * not the model — keeps the model schema-only and easy to test.
 */

import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const AppointmentRequestSchema = new Schema(
  {
    doctorId: { type: Schema.Types.ObjectId, ref: "Doctor", required: true, index: true },
    /** ID of the chamber subdoc the patient picked. Stored as string for tolerance against rebuilds. */
    chamberId: { type: String, required: true },
    /** Snapshot of the chamber name at request time — chambers may be edited later. */
    chamberName: { type: String, default: null },

    patientName: { type: String, required: true, trim: true, maxlength: 80 },
    patientPhone: { type: String, required: true, trim: true }, // E.164, e.g. "+8801711000000"
    preferredDate: { type: Date, required: true },
    preferredTimeWindow: {
      type: String,
      enum: ["morning", "afternoon", "evening"],
      required: true,
    },
    reason: { type: String, default: null, maxlength: 300 },

    status: {
      type: String,
      enum: ["pending", "seen", "booked", "rejected"],
      default: "pending",
      required: true,
      index: true,
    },
    notifiedAt: { type: Date, default: null },
    /** SHA-256(IP + AUTH_SECRET) — for abuse forensics, never displayed. */
    ipHash: { type: String, default: null },
  },
  { timestamps: true, collection: "appointmentRequests" },
);

AppointmentRequestSchema.index({ doctorId: 1, createdAt: -1 });
AppointmentRequestSchema.index({ status: 1, createdAt: -1 });
AppointmentRequestSchema.index({ doctorId: 1, status: 1 });

export type AppointmentRequestDoc = InferSchemaType<typeof AppointmentRequestSchema> & {
  _id: string;
};

export const AppointmentRequest: Model<AppointmentRequestDoc> =
  (models.AppointmentRequest as Model<AppointmentRequestDoc>) ??
  model<AppointmentRequestDoc>("AppointmentRequest", AppointmentRequestSchema);
