/**
 * Profile-view analytics events.
 *
 * One document per page-view. We hash the viewer IP (sha256 truncated to 16
 * chars + a daily salt) so the analytics chart can de-dup repeat visits within
 * a day without storing PII.
 *
 * TTL: 90 days. The dashboard insights view shows 30 days; the extra buffer
 * lets us recompute monthly trends without paying long-term storage.
 */

import { Schema, model, models, type Model } from "mongoose";

const ProfileViewSchema = new Schema(
  {
    doctorId: { type: Schema.Types.ObjectId, ref: "Doctor", required: true, index: true },
    viewedAt: { type: Date, default: Date.now },
    viewerIpHash: { type: String, default: null }, // sha256(ip + daySalt), truncated
    referrer: { type: String, default: null },
    userAgent: { type: String, default: null },
    // Crawler vs. real visitor, classified from userAgent at write time
    // (isBotUserAgent). Lets the doctor-facing analytics show humans only while
    // admin can still inspect crawler activity per profile.
    isBot: { type: Boolean, default: false },
    // Optional parsed values cached at write-time to avoid re-parsing in aggregations.
    parsedCity: { type: String, default: null },
    parsedDeviceType: { type: String, default: null, enum: ["mobile", "tablet", "desktop", null] },
  },
  { collection: "profileViews", versionKey: false },
);

// 90-day TTL — Mongo deletes docs whose viewedAt is older.
ProfileViewSchema.index({ viewedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

// Hot path: 30-day window for a specific doctor.
ProfileViewSchema.index({ doctorId: 1, viewedAt: -1 });

export const ProfileView: Model<unknown> =
  (models.ProfileView as Model<unknown>) ?? model("ProfileView", ProfileViewSchema);
