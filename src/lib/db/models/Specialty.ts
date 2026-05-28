/**
 * Specialty master data.
 *
 * `fhirCode` is the FHIR Practitioner.specialty CodeableConcept code
 * (we use SNOMED CT where one exists, otherwise an internal code prefixed
 * with `did:` so it's unambiguous to the EMR side later).
 *
 * Bangla name is stored as plain string — `nameBangla` is shown on category
 * pages once the i18n switch is wired (Step 10 candidate / v2).
 */

import { Schema, model, models, type Model, type InferSchemaType } from "mongoose";

const SpecialtySchema = new Schema(
  {
    name: { type: String, required: true, trim: true, index: { unique: true } },
    nameBangla: { type: String, default: "" },
    slug: { type: String, required: true, trim: true, lowercase: true, index: { unique: true } },
    fhirCode: { type: String, default: null },
    snomedCode: { type: String, default: null },
    parentSpecialty: { type: Schema.Types.ObjectId, ref: "Specialty", default: null },
    iconUrl: { type: String, default: null },
    // Display ordering on the homepage grid.
    sortOrder: { type: Number, default: 100 },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true, collection: "specialties" },
);

export type SpecialtyDoc = InferSchemaType<typeof SpecialtySchema> & { _id: string };

export const Specialty: Model<SpecialtyDoc> =
  (models.Specialty as Model<SpecialtyDoc>) ?? model<SpecialtyDoc>("Specialty", SpecialtySchema);
