/**
 * FHIR R4 Practitioner mapper.
 *
 * This is the single seam between our internal doctor schema and the FHIR
 * representation used by:
 *   - /api/v1/doctors/[slug] (public API consumers)
 *   - Future EMR integration (Phase 3)
 *
 * Mapping notes (kept comment-heavy because the FHIR side is non-obvious):
 *   - BD-specific fields (whatsapp, BMDC verification level, isClaimed) go on
 *     Practitioner.extension entries under `https://doctor.id.bd/fhir/`.
 *   - We emit PractitionerRole entries inline as `roles` since FHIR's normal
 *     pattern is a separate Bundle — for a single-resource REST endpoint, the
 *     embedded array is friendlier to consumers.
 *
 * Spec reference: https://www.hl7.org/fhir/practitioner.html
 */

import type { DoctorDocLike } from "@/types/doctor";

const EXT_PREFIX = "https://doctor.id.bd/fhir";

/**
 * FHIR extensions can nest. We model that explicitly so arrays of structured
 * entries (awards, memberships, publications) round-trip without JSON-string
 * encoding. Adheres to https://www.hl7.org/fhir/extensibility.html
 */
export interface FhirExtension {
  url: string;
  valueString?: string;
  valueBoolean?: boolean;
  valueInteger?: number;
  valueUrl?: string;
  extension?: FhirExtension[];
}

export interface FhirPractitionerEnvelope {
  resourceType: "Practitioner";
  id: string;
  active: boolean;
  identifier: Array<{ system: string; value: string; use?: string }>;
  name: Array<{ use: string; prefix?: string[]; given: string[]; family: string; text: string }>;
  telecom: Array<{ system: string; value: string; use?: string }>;
  gender?: "male" | "female" | "other" | "unknown";
  qualification?: Array<{
    code: { text: string };
    period?: { start?: string; end?: string };
    issuer: { display: string };
  }>;
  communication?: Array<{ coding: Array<{ system: string; display: string }> }>;
  photo?: Array<{ url: string; contentType: string }>;
  extension: Array<FhirExtension>;
  // Non-standard convenience block — FHIR purists should ignore, EMR consumers
  // get a fully-shaped PractitionerRole array without a separate Bundle hop.
  roles: Array<{
    resourceType: "PractitionerRole";
    specialty: Array<{ coding: Array<{ system: string; code: string; display: string }> }>;
    location: Array<{
      display: string;
      address: { line: string[]; city: string; district: string; country: "BD" };
      telecom?: Array<{ system: string; value: string }>;
      position?: { latitude: number; longitude: number };
    }>;
    availableTime: Array<{
      daysOfWeek: string[];
      availableStartTime: string;
      availableEndTime: string;
    }>;
  }>;
}

export function toFhirPractitioner(doc: DoctorDocLike): FhirPractitionerEnvelope {
  const fullName = doc.name.displayName;

  const telecom: FhirPractitionerEnvelope["telecom"] = [];
  if (doc.contact.publicEmail && !doc.privacyHideEmail) {
    telecom.push({ system: "email", value: doc.contact.publicEmail, use: "work" });
  }
  if (doc.contact.publicPhone && !doc.privacyHidePhone) {
    telecom.push({ system: "phone", value: doc.contact.publicPhone, use: "work" });
  }
  if (doc.contact.whatsapp && !doc.privacyHidePhone) {
    telecom.push({ system: "other", value: `whatsapp:${doc.contact.whatsapp}`, use: "work" });
  }

  return {
    resourceType: "Practitioner",
    id: String(doc._id ?? doc.slug),
    active: doc.status === "published",
    identifier: [
      { system: "https://doctor.id.bd", value: doc.slug, use: "official" },
      ...(doc.bmdcNumber
        ? [{ system: "urn:bd:bmdc", value: doc.bmdcNumber, use: "official" }]
        : []),
    ],
    name: [
      {
        use: "official",
        prefix: [doc.name.prefix],
        given: [doc.name.first],
        family: doc.name.last,
        text: fullName,
      },
    ],
    telecom,
    gender:
      doc.gender === "male"
        ? "male"
        : doc.gender === "female"
          ? "female"
          : doc.gender === "other"
            ? "other"
            : "unknown",
    qualification: doc.qualifications.map((q) => ({
      code: { text: q.degree },
      period: { start: `${q.year}-01-01` },
      issuer: { display: q.institution },
    })),
    communication: doc.languages.map((lang) => ({
      coding: [{ system: "urn:ietf:bcp:47", display: lang }],
    })),
    photo: doc.photo
      ? [{ url: doc.photo.url, contentType: doc.photo.url.endsWith(".png") ? "image/png" : "image/jpeg" }]
      : undefined,
    extension: buildExtensions(doc),
    roles: doc.chambers.map((chamber) => ({
      resourceType: "PractitionerRole",
      specialty: doc.specialties.map((s) => ({
        coding: [
          {
            system: s.fhirCode?.startsWith("did:") ? `${EXT_PREFIX}/specialty` : "http://snomed.info/sct",
            code: s.fhirCode ?? s.name,
            display: s.name,
          },
        ],
      })),
      location: [
        {
          display: chamber.name,
          address: {
            line: [chamber.address],
            city: chamber.district,
            district: chamber.division,
            country: "BD",
          },
          telecom: chamber.phone ? [{ system: "phone", value: chamber.phone }] : undefined,
          position:
            chamber.coordinates?.lat && chamber.coordinates?.lng
              ? { latitude: chamber.coordinates.lat, longitude: chamber.coordinates.lng }
              : undefined,
        },
      ],
      availableTime: chamber.schedule
        .filter((s) => s.available)
        .map((s) => ({
          daysOfWeek: [s.day],
          availableStartTime: s.startTime + ":00",
          availableEndTime: s.endTime + ":00",
        })),
    })),
  };
}

function buildExtensions(doc: DoctorDocLike): FhirExtension[] {
  const ext: FhirExtension[] = [
    { url: `${EXT_PREFIX}/verificationLevel`, valueString: doc.verificationLevel },
    { url: `${EXT_PREFIX}/isClaimed`, valueBoolean: doc.isClaimed },
    { url: `${EXT_PREFIX}/bmdcVerified`, valueBoolean: doc.bmdcVerified },
    { url: `${EXT_PREFIX}/nidVerified`, valueBoolean: doc.nidVerified },
  ];

  if (doc.designation) {
    ext.push({ url: `${EXT_PREFIX}/designation`, valueString: doc.designation });
  }
  if (doc.institute) {
    ext.push({ url: `${EXT_PREFIX}/institute`, valueString: doc.institute });
  }
  if (typeof doc.yearsOfExperience === "number") {
    ext.push({ url: `${EXT_PREFIX}/yearsOfExperience`, valueInteger: doc.yearsOfExperience });
  }

  // Repeated extensions, one per entry, each with nested sub-extensions —
  // the standard FHIR pattern for structured arrays.
  for (const a of doc.awards ?? []) {
    const subs: FhirExtension[] = [{ url: "title", valueString: a.title }];
    if (a.issuer) subs.push({ url: "issuer", valueString: a.issuer });
    if (typeof a.year === "number") subs.push({ url: "year", valueInteger: a.year });
    ext.push({ url: `${EXT_PREFIX}/award`, extension: subs });
  }

  for (const m of doc.memberships ?? []) {
    const subs: FhirExtension[] = [{ url: "body", valueString: m.body }];
    if (m.role) subs.push({ url: "role", valueString: m.role });
    if (typeof m.since === "number") subs.push({ url: "since", valueInteger: m.since });
    ext.push({ url: `${EXT_PREFIX}/membership`, extension: subs });
  }

  for (const p of doc.publications ?? []) {
    const subs: FhirExtension[] = [{ url: "title", valueString: p.title }];
    if (p.journal) subs.push({ url: "journal", valueString: p.journal });
    if (typeof p.year === "number") subs.push({ url: "year", valueInteger: p.year });
    if (p.url) subs.push({ url: "url", valueUrl: p.url });
    ext.push({ url: `${EXT_PREFIX}/publication`, extension: subs });
  }

  for (const c of doc.concentrations ?? []) {
    ext.push({ url: `${EXT_PREFIX}/concentration`, valueString: c });
  }

  return ext;
}
