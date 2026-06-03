/**
 * Chamber (facility) master data — the normalized, separately-seeded location
 * collection. One row per distinct physical facility (a hospital/diagnostic
 * branch), e.g. "Popular Diagnostic Centre Ltd. Dhanmondi".
 *
 * Why its own collection (vs the old embedded `Doctor.chambers[]` subdoc): a
 * facility is shared by many doctors and grows to 10k+. Resolving its location
 * once here — instead of per doctor — guarantees consistency, and keeps the
 * bulky/volatile display fields (name, address, phone) single-source.
 *
 * Access pattern (see .claude/plans/build-unified-plan.md §7):
 *  - QUERY/SORT keys = `division` / `district` / `area`. These are *also*
 *    denormalized onto `Doctor.chambers[]` (the indexed copy) so location
 *    search never scans this collection.
 *  - Everything else is DISPLAY-only, fetched by `_id` (`externalId`) at render.
 *
 * Seeded by `scripts/seed.ts` from `data/chambers/chamber-locations.json`,
 * idempotently keyed by `externalId` — before any doctor processing.
 */

import { Schema, model, models, type Model, type InferSchemaType } from "mongoose";

const ChamberSchema = new Schema(
  {
    /** Stable cross-build id: "{provider}:{branchId}". The FK doctors reference. */
    externalId: { type: String, required: true, trim: true, index: { unique: true } },
    provider: {
      type: String,
      required: true,
      enum: ["popular-diagnostic", "ibn-sina", "sasthyaseba", "doctor-bangladesh"],
      index: true,
    },
    branchId: { type: Number, required: true },

    // Canonical location — the query/sort keys (also denormalized onto Doctor).
    division: { type: String, required: true },
    district: { type: String, required: true, index: true },
    area: { type: String, required: true, trim: true },

    // Display-only.
    name: { type: String, required: true, trim: true },
    address: { type: String, default: "" },
    /** Original branch/city text from the source, preserved for audit/display. */
    sourceCity: { type: String, default: "" },
    phone: { type: String, default: null },
    coordinates: {
      type: { lat: { type: Number }, lng: { type: Number } },
      default: undefined,
    },
  },
  { timestamps: true, collection: "chambers" },
);

// Belt-and-suspenders uniqueness on the (provider, branchId) pair that backs
// `externalId` — protects against a malformed externalId slipping through.
ChamberSchema.index({ provider: 1, branchId: 1 }, { unique: true });

export type ChamberDoc = InferSchemaType<typeof ChamberSchema> & { _id: string };

export const Chamber: Model<ChamberDoc> =
  (models.Chamber as Model<ChamberDoc>) ?? model<ChamberDoc>("Chamber", ChamberSchema);
