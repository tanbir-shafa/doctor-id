/**
 * Doctor collection — the FHIR Practitioner-aligned profile.
 *
 * Field mapping notes (used by lib/fhir/practitioner.ts):
 *   - `bmdcNumber` → Practitioner.identifier with system `urn:bd:bmdc`
 *   - `specialties[].fhirCode` → PractitionerRole.specialty.coding.code
 *   - `chambers[]` → PractitionerRole.location[] + healthcareService
 *   - `qualifications[]` → Practitioner.qualification[]
 *   - BD-specific fields (subSpecialties, contact.whatsapp, isClaimed)
 *     map to Practitioner.extension entries under the same `urn:bd:doctor-id`
 *     namespace — the mapper is the single seam to evolve.
 *
 * Multi-tenant readiness: every doc carries `ownerType` + `ownerId`. MVP only
 * writes `ownerType: 'doctor'` with `ownerId === userId`, but Server Actions
 * authorize via `ownerId` so clinic-group support can be added without a
 * migration.
 */

import { Schema, model, models, type Model } from "mongoose";

const NameSchema = new Schema(
  {
    prefix: {
      type: String,
      enum: ["Dr.", "Prof. Dr.", "Asst. Prof. Dr.", "Assoc. Prof. Dr."],
      default: "Dr.",
    },
    first: { type: String, required: true, trim: true },
    last: { type: String, required: true, trim: true },
    displayName: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const PhotoSchema = new Schema(
  {
    url: { type: String, required: true },
    s3Key: { type: String, required: true },
  },
  { _id: false },
);

const SpecialtyRefSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    isPrimary: { type: Boolean, default: false },
    fhirCode: { type: String, default: null },
  },
  { _id: false },
);

const QualificationSchema = new Schema(
  {
    degree: { type: String, required: true, trim: true },
    institution: { type: String, required: true, trim: true },
    year: { type: Number, required: true, min: 1900, max: new Date().getFullYear() + 1 },
    country: { type: String, default: "Bangladesh" },
  },
  { _id: false },
);

const ExperienceSchema = new Schema(
  {
    role: { type: String, required: true, trim: true },
    organization: { type: String, required: true, trim: true },
    from: { type: Date, required: true },
    to: { type: Date, default: null },
    current: { type: Boolean, default: false },
  },
  { _id: false },
);

const ScheduleSlotSchema = new Schema(
  {
    day: { type: String, enum: ["sun", "mon", "tue", "wed", "thu", "fri", "sat"], required: true },
    startTime: { type: String, required: true }, // "HH:mm"
    endTime: { type: String, required: true },
    available: { type: Boolean, default: true },
  },
  { _id: false },
);

const ChamberSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    area: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    division: { type: String, required: true, trim: true },
    coordinates: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
    },
    phone: { type: String, default: null, trim: true },
    schedule: { type: [ScheduleSlotSchema], default: [] },
    consultationFee: {
      amount: { type: Number, default: 0, min: 0 },
      currency: { type: String, enum: ["BDT", "USD"], default: "BDT" },
    },
    isPrimary: { type: Boolean, default: false },
  },
  { _id: true, timestamps: false },
);

const RegistrationSchema = new Schema(
  {
    council: { type: String, enum: ["BMDC", "BMDC-Dental"], default: "BMDC" },
    number: { type: String, required: true },
    validFrom: { type: Date, default: null },
    validTo: { type: Date, default: null },
  },
  { _id: false },
);

const ContactSchema = new Schema(
  {
    publicPhone: { type: String, default: null, trim: true },
    publicEmail: { type: String, default: null, trim: true, lowercase: true },
    whatsapp: { type: String, default: null, trim: true },
    website: { type: String, default: null, trim: true },
  },
  { _id: false },
);

const SocialLinksSchema = new Schema(
  {
    facebook: { type: String, default: null, trim: true },
    linkedin: { type: String, default: null, trim: true },
    researchGate: { type: String, default: null, trim: true },
    googleScholar: { type: String, default: null, trim: true },
  },
  { _id: false },
);

const DoctorSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },

    // Multi-tenant ownership. Always populated, even when ownerType==='doctor'.
    ownerType: { type: String, enum: ["doctor", "clinic"], default: "doctor", required: true },
    ownerId: { type: Schema.Types.ObjectId, required: true, index: true },

    slug: { type: String, required: true, trim: true, lowercase: true, index: { unique: true } },

    bmdcNumber: {
      type: String,
      default: null,
      trim: true,
      // Sparse so unclaimed/draft profiles without a number don't collide.
      index: { unique: true, sparse: true },
    },
    bmdcVerified: { type: Boolean, default: false },
    bmdcVerifiedAt: { type: Date, default: null },
    nidVerified: { type: Boolean, default: false },
    verificationLevel: {
      type: String,
      enum: ["unverified", "bmdc_verified", "fully_verified"],
      default: "unverified",
      index: true,
    },

    name: { type: NameSchema, required: true },
    photo: { type: PhotoSchema, default: null },
    coverPhoto: { type: PhotoSchema, default: null },
    bio: { type: String, default: "", maxlength: 2000 },

    gender: {
      type: String,
      enum: ["male", "female", "other", "prefer_not_to_say"],
      default: "prefer_not_to_say",
    },
    dateOfBirth: { type: Date, default: null }, // Private, never exposed publicly.
    languages: { type: [String], default: ["Bangla", "English"] },

    specialties: { type: [SpecialtyRefSchema], default: [] },
    subSpecialties: { type: [String], default: [] },
    qualifications: { type: [QualificationSchema], default: [] },
    experience: { type: [ExperienceSchema], default: [] },
    chambers: { type: [ChamberSchema], default: [] },
    registrations: { type: [RegistrationSchema], default: [] },

    contact: { type: ContactSchema, default: () => ({}) },
    socialLinks: { type: SocialLinksSchema, default: () => ({}) },

    profileCompletenessScore: { type: Number, default: 0, min: 0, max: 100 },
    profileViews: { type: Number, default: 0 },

    isClaimed: { type: Boolean, default: false, index: true },
    claimRequestedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    claimedAt: { type: Date, default: null },

    status: {
      type: String,
      enum: ["draft", "published", "suspended"],
      default: "draft",
      required: true,
    },
    seoTitle: { type: String, default: null },
    seoDescription: { type: String, default: null },

    // Privacy toggles (hide phone/email from public profile).
    privacyHidePhone: { type: Boolean, default: false },
    privacyHideEmail: { type: Boolean, default: false },
  },
  { timestamps: true, collection: "doctors" },
);

// --- Compound + text indexes ---

// MongoDB cannot index two array fields in a single compound index (parallel
// arrays error). We split the category-page index into two single-field
// indexes — the planner intersects them efficiently for /[specialty]/[city].
DoctorSchema.index({ "specialties.name": 1 });
DoctorSchema.index({ "chambers.city": 1 });
// Public listing query (only published, sorted by verification then recency)
DoctorSchema.index({ status: 1, verificationLevel: 1, updatedAt: -1 });
// Free-text search across name, bio, and specialty names.
//
// NOTE: this $text index is currently *dormant*. searchDoctors() uses a
// per-token regex $and of $or pattern instead — see the comment in
// lib/db/queries/doctors.ts. The index is kept so we can flip back to $text
// without a migration if the regex approach gets slow at scale.
DoctorSchema.index(
  {
    "name.displayName": "text",
    bio: "text",
    "specialties.name": "text",
    "subSpecialties": "text",
  },
  {
    weights: {
      "name.displayName": 10,
      "specialties.name": 6,
      "subSpecialties": 4,
      bio: 1,
    },
    name: "doctor_text_idx",
  },
);

// Per-field indexes that the regex-based search uses. Regex queries can use
// indexes when the pattern is anchored to the start (`^foo`); for our
// substring patterns the index helps only as a covering scan. At ~50k profiles
// this is fine; past that, swap to Atlas Search.
DoctorSchema.index({ "name.displayName": 1 });

export const Doctor: Model<unknown> =
  (models.Doctor as Model<unknown>) ?? model("Doctor", DoctorSchema);
