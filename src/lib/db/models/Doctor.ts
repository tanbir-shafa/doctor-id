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

import {Schema, model, models, type Model} from "mongoose";
import {FILE_VISIBILITY} from "./files";

const NameSchema = new Schema(
    {
        prefix: {
            type: String,
            enum: ["Dr.", "Prof. Dr.", "Asst. Prof. Dr.", "Assoc. Prof. Dr."],
            default: "Dr.",
        },
        first: {type: String, required: true, trim: true},
        last: {type: String, required: true, trim: true},
        displayName: {type: String, required: true, trim: true},
    },
    {_id: false},
);

const PhotoSchema = new Schema(
    {
        file: {
            type: Schema.Types.ObjectId,
            ref: "File",
            default: null,
        },
        url: {type: String, default: null},
        s3Bucket: {type: String, required: true},
        s3Key: {type: String, required: true},
        visibility: {
            type: String,
            enum: Object.values(FILE_VISIBILITY),
            default: FILE_VISIBILITY.PUBLIC,
            required: true,
        },
    },
    {_id: false},
);

const SpecialtyRefSchema = new Schema(
    {
        name: {type: String, required: true, trim: true},
        isPrimary: {type: Boolean, default: false},
        fhirCode: {type: String, default: null},
    },
    {_id: false},
);

const QualificationSchema = new Schema(
    {
        degree: {type: String, required: true, trim: true},
        institution: {type: String, required: true, trim: true},
        year: {type: Number, required: true, min: 1900, max: new Date().getFullYear() + 1},
        country: {type: String, default: "Bangladesh"},
    },
    {_id: false},
);

const ExperienceSchema = new Schema(
    {
        role: {type: String, required: true, trim: true},
        organization: {type: String, required: true, trim: true},
        from: {type: Date, required: true},
        to: {type: Date, default: null},
        current: {type: Boolean, default: false},
    },
    {_id: false},
);

const ScheduleSlotSchema = new Schema(
    {
        day: {type: String, enum: ["sun", "mon", "tue", "wed", "thu", "fri", "sat"], required: true},
        startTime: {type: String, required: true}, // "HH:mm"
        endTime: {type: String, required: true},
        available: {type: Boolean, default: true},
    },
    {_id: false},
);

const ChamberSchema = new Schema(
    {
        name: {type: String, required: true, trim: true},
        address: {type: String, required: true, trim: true},
        area: {type: String, required: true, trim: true},
        city: {type: String, required: true, trim: true},
        division: {type: String, required: true, trim: true},
        coordinates: {
            lat: {type: Number, default: null},
            lng: {type: Number, default: null},
        },
        phone: {type: String, default: null, trim: true},
        // FK to the source-of-truth Chamber collection (facility identity). The
        // name/address/area/city/division/phone above are a denormalized cache for
        // joinless SSR reads — same pattern as PhotoSchema (CLAUDE.md #12).
        chamberLocationId: {type: String, default: null, index: true},
        floor: {type: String, default: null, trim: true},
        room: {type: String, default: null, trim: true},
        schedule: {type: [ScheduleSlotSchema], default: []},
        consultationFee: {
            amount: {type: Number, default: 0, min: 0},
            currency: {type: String, enum: ["BDT", "USD"], default: "BDT"},
        },
        isPrimary: {type: Boolean, default: false},
    },
    {_id: true, timestamps: false},
);

const RegistrationSchema = new Schema(
    {
        council: {type: String, enum: ["BMDC", "BMDC-Dental"], default: "BMDC"},
        number: {type: String, required: true},
        validFrom: {type: Date, default: null},
        validTo: {type: Date, default: null},
    },
    {_id: false},
);

const ContactSchema = new Schema(
    {
        publicPhone: {type: String, default: null, trim: true},
        publicEmail: {type: String, default: null, trim: true, lowercase: true},
        whatsapp: {type: String, default: null, trim: true},
        website: {type: String, default: null, trim: true},
    },
    {_id: false},
);

const SocialLinksSchema = new Schema(
    {
        facebook: {type: String, default: null, trim: true},
        linkedin: {type: String, default: null, trim: true},
        researchGate: {type: String, default: null, trim: true},
        googleScholar: {type: String, default: null, trim: true},
        youtube: {type: String, default: null, trim: true},
    },
    {_id: false},
);

const AwardSchema = new Schema(
    {
        title: {type: String, required: true, trim: true},
        issuer: {type: String, default: null, trim: true},
        year: {type: Number, default: null, min: 1900, max: new Date().getFullYear() + 1},
    },
    {_id: false},
);

const MembershipSchema = new Schema(
    {
        body: {type: String, required: true, trim: true},
        role: {type: String, default: null, trim: true},
        since: {type: Number, default: null, min: 1900, max: new Date().getFullYear() + 1},
    },
    {_id: false},
);

const PublicationSchema = new Schema(
    {
        title: {type: String, required: true, trim: true},
        journal: {type: String, default: null, trim: true},
        year: {type: Number, default: null, min: 1900, max: new Date().getFullYear() + 1},
        url: {type: String, default: null, trim: true},
    },
    {_id: false},
);

const MetricsSchema = new Schema(
    {
        profileViews30d: {type: Number, default: 0, min: 0},
        whatsappClicks30d: {type: Number, default: 0, min: 0},
        lastViewedAt: {type: Date, default: null},
    },
    {_id: false},
);

const DoctorSchema = new Schema(
    {
        userId: {type: Schema.Types.ObjectId, ref: "User", default: null, index: true},

        // Multi-tenant ownership. Always populated, even when ownerType==='doctor'.
        ownerType: {type: String, enum: ["doctor", "clinic"], default: "doctor", required: true},
        ownerId: {type: Schema.Types.ObjectId, required: true, index: true},

        slug: {type: String, required: true, trim: true, lowercase: true, index: {unique: true}},

        // Ingestion provenance — enables idempotent re-seeds. Null for
        // doctor-created / claimed profiles. (Indexed below as a partial-unique pair.)
        sourceProvider: {type: String, default: null},
        sourceProviderId: {type: String, default: null},
        sourceUrl: {type: String, default: null},

        bmdcNumber: {
            type: String,
            default: null,
            trim: true,
            // Uniqueness index is declared below as a partial filter — sparse
            // alone doesn't help here because `default: null` materializes the
            // field as null, which a sparse index still treats as present.
        },
        bmdcVerified: {type: Boolean, default: false},
        bmdcVerifiedAt: {type: Date, default: null},
        nidVerified: {type: Boolean, default: false},
        verificationLevel: {
            type: String,
            enum: ["unverified", "bmdc_verified", "fully_verified"],
            default: "unverified",
            index: true,
        },

        name: {type: NameSchema, required: true},
        photo: {type: PhotoSchema, default: null},
        coverPhoto: {type: PhotoSchema, default: null},
        bio: {type: String, default: "", maxlength: 2000},

        gender: {
            type: String,
            enum: ["male", "female", "other", "prefer_not_to_say"],
            default: "prefer_not_to_say",
        },
        dateOfBirth: {type: Date, default: null}, // Private, never exposed publicly.
        languages: {type: [String], default: ["Bangla", "English"]},

        specialties: {type: [SpecialtyRefSchema], default: []},
        // Verbatim specialty text as the source published it (or as the doctor
        // typed it on signup). Display-only. List / filter / SEO continue to
        // use the canonical SNOMED-coded refs in `specialties[]`.
        sourceSpecialty: {type: String, default: null, trim: true, maxlength: 200},
        subSpecialties: {type: [String], default: []},
        qualifications: {type: [QualificationSchema], default: []},
        experience: {type: [ExperienceSchema], default: []},
        chambers: {type: [ChamberSchema], default: []},
        registrations: {type: [RegistrationSchema], default: []},

        contact: {type: ContactSchema, default: () => ({})},
        socialLinks: {type: SocialLinksSchema, default: () => ({})},

        // Loop A — status signaling fields.
        designation: {type: String, default: null, trim: true, maxlength: 160},
        institute: {type: String, default: null, trim: true, maxlength: 160},
        yearsOfExperience: {type: Number, default: null, min: 0, max: 80},
        awards: {type: [AwardSchema], default: []},
        memberships: {type: [MembershipSchema], default: []},
        publications: {type: [PublicationSchema], default: []},
        concentrations: {type: [String], default: []},

        profileCompletenessScore: {type: Number, default: 0, min: 0, max: 100},
        profileViews: {type: Number, default: 0},
        // 30-day rolling counters — incremented in recordProfileView; rolled
        // back by an out-of-band job (TBD). Lifetime `profileViews` above is
        // append-only.
        metrics: {type: MetricsSchema, default: () => ({})},

        isClaimed: {type: Boolean, default: false, index: true},
        claimRequestedBy: {type: Schema.Types.ObjectId, ref: "User", default: null},
        claimedAt: {type: Date, default: null},

        status: {
            type: String,
            enum: ["draft", "published", "suspended"],
            default: "draft",
            required: true,
        },
        seoTitle: {type: String, default: null},
        seoDescription: {type: String, default: null},

        // Privacy toggles (hide phone/email from public profile).
        privacyHidePhone: {type: Boolean, default: false},
        privacyHideEmail: {type: Boolean, default: false},

        // Annotation set by the deterministic-dedup pipeline
        // (scripts/merge-dup-deterministic.ts) when a candidate group could
        // not be confidently auto-merged. Operators triage these via the
        // "Pending duplicate review" filter on /admin/doctors. Sparse-indexed
        // so the filter scans only flagged rows.
        dupReviewGroup: {type: String, default: null},

        // Feature flags + counters. `rxPadGenerations` proxies "is the magnet
        // working?" per the Sprint A KPI billboard (roadmap §5.4) — every
        // PDF download increments this atomically.
        flags: {
            rxPadGeneratedAt: {type: Date, default: null},
            rxPadGenerations: {type: Number, default: 0},
        },
    },
    {timestamps: true, collection: "doctors"},
);

// Uniqueness for BMDC numbers only applies to docs that actually have one
// (i.e. claimed profiles, or ingestion sources that include it). A partial
// filter index ignores docs where the field is null/missing.
DoctorSchema.index(
    {bmdcNumber: 1},
    {
        unique: true,
        partialFilterExpression: {bmdcNumber: {$type: "string"}},
        name: "bmdc_unique_when_present_idx",
    },
);

// --- Compound + text indexes ---

// MongoDB cannot index two array fields in a single compound index (parallel
// arrays error). We split the category-page index into two single-field
// indexes — the planner intersects them efficiently for /[specialty]/[city].
DoctorSchema.index({"specialties.name": 1});
// `chambers.city` holds the canonical 64-district (location query key);
// `chambers.chamberLocationId` is indexed field-level on ChamberSchema (reverse lookup).
DoctorSchema.index({"chambers.city": 1});
// Idempotent ingestion key — partial so manual/claimed docs (no provenance) don't
// collide on null. Its absence is why prior re-ingests duplicated the collection.
DoctorSchema.index(
    {sourceProvider: 1, sourceProviderId: 1},
    {
        unique: true,
        partialFilterExpression: {sourceProviderId: {$type: "string"}},
        name: "source_provenance_idx",
    },
);
// Sparse so admin "Pending duplicate review" lookups don't scan the whole
// collection — only the few hundred flagged rows.
DoctorSchema.index({dupReviewGroup: 1}, {sparse: true});
// Public listing query (only published, sorted by verification then recency)
DoctorSchema.index({status: 1, verificationLevel: 1, updatedAt: -1});
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
DoctorSchema.index({"name.displayName": 1});

export const Doctor: Model<unknown> =
    (models.Doctor as Model<unknown>) ?? model("Doctor", DoctorSchema);
