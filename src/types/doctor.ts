/**
 * Plain (non-Mongoose) shape of a Doctor document.
 *
 * Used by:
 *   - Server Actions returning serialized docs to client components
 *   - The completeness scorer (which doesn't need Mongoose machinery)
 *   - The FHIR mapper
 *
 * The Mongoose model (lib/db/models/Doctor.ts) declares the canonical schema;
 * this file mirrors the same shape as a TS type to avoid coupling client code
 * to Mongoose document types.
 */

export type VerificationLevel =
  | "unverified"
  | "bmdc_verified"
  | "identity_verified"
  | "fully_verified";

export type IdDocumentType = "nid" | "passport" | "driving_license";

/** The NID-matched legal name snapshot, captured at account-verification approval. */
export interface DoctorLegalName {
  first: string;
  last: string;
}
export type DoctorStatus = "draft" | "published" | "suspended";
export type OwnerType = "doctor" | "clinic";
export type Gender = "male" | "female" | "other" | "prefer_not_to_say";
export type TitlePrefix = "Dr." | "Prof. Dr." | "Asst. Prof. Dr." | "Assoc. Prof. Dr.";

export interface DoctorName {
  prefix: TitlePrefix;
  first: string;
  last: string;
  displayName: string;
}

export interface DoctorPhoto {
  url: string;
  s3Key: string;
  /** Tiny base64 blur preview for next/image placeholder="blur". */
  blurDataUrl?: string | null;
}

export interface DoctorSpecialty {
  name: string;
  isPrimary: boolean;
  fhirCode?: string;
}

export interface DoctorQualification {
  degree: string;
  institution: string;
  year: number;
  country: string;
}

export interface DoctorExperience {
  role: string;
  organization: string;
  from: Date | string;
  to?: Date | string | null;
  current: boolean;
}

export interface ChamberCoordinates {
  lat: number;
  lng: number;
}

export interface ChamberScheduleSlot {
  day: "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";
  startTime: string; // "HH:mm" 24h
  endTime: string;
  available: boolean;
}

export interface ChamberFee {
  amount: number;
  currency: "BDT" | "USD";
}

export interface DoctorChamber {
  name: string;
  address: string;
  area: string;
  district: string;
  division: string;
  coordinates?: ChamberCoordinates;
  phone?: string;
  floor?: string;
  room?: string;
  schedule: ChamberScheduleSlot[];
  consultationFee?: ChamberFee;
  isPrimary: boolean;
}

export interface DoctorRegistration {
  council: "BMDC" | "BMDC-Dental";
  number: string;
  validFrom?: Date | string;
  validTo?: Date | string;
}

export interface DoctorContact {
  publicPhone?: string;
  publicEmail?: string;
  whatsapp?: string;
  website?: string;
}

export interface DoctorSocialLinks {
  facebook?: string;
  linkedin?: string;
  researchGate?: string;
  googleScholar?: string;
  youtube?: string;
}

export interface DoctorAward {
  title: string;
  issuer?: string;
  year?: number;
}

export interface DoctorMembership {
  body: string;
  role?: string;
  since?: number;
}

export interface DoctorPublication {
  title: string;
  journal?: string;
  year?: number;
  url?: string;
}

export interface DoctorMetrics {
  profileViews30d: number;
  whatsappClicks30d: number;
  lastViewedAt?: Date | string | null;
}

/**
 * The "Like" suffix here means: structurally compatible with both a Mongoose
 * doc (which has extra methods) and a POJO serialized version. Anything that
 * only reads fields should accept this type.
 */
/**
 * `ObjectIdLike` accepts either a string (when the doc has been JSON-serialized
 * for the client) or a Mongoose ObjectId (when manipulating documents server-side).
 */
type ObjectIdLike = string | { toString(): string };

export interface DoctorDocLike {
  _id?: ObjectIdLike;
  userId?: ObjectIdLike | null;
  ownerType: OwnerType;
  ownerId: ObjectIdLike;
  slug: string;

  bmdcNumber?: string;
  bmdcVerified: boolean;
  bmdcVerifiedAt?: Date | string | null;
  nidVerified: boolean;
  nidVerifiedAt?: Date | string | null;
  /** NID-matched legal name snapshot (private). Drives the name-change guard. */
  legalName?: DoctorLegalName | null;
  /** Which Gov ID type was verified (private). */
  idDocumentType?: IdDocumentType | null;
  /** File ref to the verified Gov photo ID (private bucket). */
  identityDocumentFileId?: ObjectIdLike | null;
  verificationLevel: VerificationLevel;

  /**
   * Founding Doctor badge (referral reward) — a SEPARATE axis from
   * `verificationLevel`. `isFounding` is a denormalized cache; the `Referral`
   * collection is the source of truth. Permanent once awarded.
   */
  foundingDoctor?: {
    isFounding?: boolean;
    qualifiedReferrals?: number;
    awardedAt?: Date | string | null;
  } | null;

  name: DoctorName;
  photo?: DoctorPhoto | null;
  coverPhoto?: DoctorPhoto | null;
  bio?: string;

  gender?: Gender;
  dateOfBirth?: Date | string | null;
  languages: string[];

  specialties: DoctorSpecialty[];
  subSpecialties?: string[];
  qualifications: DoctorQualification[];
  experience: DoctorExperience[];
  chambers: DoctorChamber[];
  registrations: DoctorRegistration[];

  contact: DoctorContact;
  socialLinks?: DoctorSocialLinks;

  // Loop A — status signaling (designation/institute used standalone; awards,
  // memberships, publications, concentrations enrich the public profile).
  designation?: string;
  institute?: string;
  yearsOfExperience?: number;
  awards?: DoctorAward[];
  memberships?: DoctorMembership[];
  publications?: DoctorPublication[];
  concentrations?: string[];

  profileCompletenessScore: number;
  profileViews: number;
  // 30-day rolling window — denormalized cache for profile chips. Lifetime
  // counter stays on `profileViews` above.
  metrics?: DoctorMetrics;

  isClaimed: boolean;
  claimRequestedBy?: ObjectIdLike | null;
  claimedAt?: Date | string | null;

  status: DoctorStatus;
  seoTitle?: string;
  seoDescription?: string;

  privacyHidePhone?: boolean;
  privacyHideEmail?: boolean;
  whatsappAppointmentEnabled?: boolean;

  /** Set by the dedup pipeline when a candidate group can't be auto-merged. */
  dupReviewGroup?: string | null;

  createdAt: Date | string;
  updatedAt: Date | string;
}
