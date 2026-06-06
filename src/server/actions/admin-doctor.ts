"use server";

import { revalidatePath } from "next/cache";
import { Types } from "mongoose";
import { auth } from "@/lib/auth/config";
import { dbConnect } from "@/lib/db/mongoose";
import { Doctor } from "@/lib/db/models";
import { computeCompleteness, missingPublishRequirements } from "@/lib/utils/completeness";
import { resolveVerifiedNameUpdate, computeVerificationLevel } from "@/lib/utils/verification";
import { isValidBmdcFormat, normalizeBmdc } from "@/lib/utils/bmdc";
import { uploadDoctorPhotoFromForm } from "@/lib/s3/doctor-photo";
import { uploadDocForPurpose, DOC_MIME_TYPES } from "@/lib/s3/upload-doc";
import { recordAuditLog } from "@/lib/audit/log";
import type { DoctorDocLike } from "@/types/doctor";
import {
  ProfileBasicSchema,
  ProfileContactSchema,
  ProfileSpecialtiesSchema,
  ProfileQualificationsSchema,
  ProfileExperienceSchema,
  ProfileStatusSchema,
  ProfileCredentialsSchema,
  ProfileConcentrationsSchema,
  ChambersUpdateSchema,
} from "@/lib/validators/doctor";

type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

/**
 * Shared admin guard + doctor loader for /admin/doctors/[slug]/edit actions.
 *
 * Mirrors `loadMyDoctor()` in [doctor.ts](./doctor.ts), but loads the doctor by
 * `_id` (not `ownerId`) so an admin can edit any profile. The proxy + admin
 * layout already gate the /admin/* surface, but every mutation re-checks
 * `session.user.role === "admin"` as defense-in-depth — these actions can be
 * invoked directly from the network without the page chrome.
 */
async function loadDoctorAsAdmin(doctorId: string) {
  const session = await auth();
  if (!session?.user?.id) return { ok: false as const, error: "Not signed in." };
  if (session.user.role !== "admin") return { ok: false as const, error: "Admin only." };
  if (!Types.ObjectId.isValid(doctorId)) {
    return { ok: false as const, error: "Invalid doctor id." };
  }
  await dbConnect();
  const doctor = await Doctor.findById(doctorId);
  if (!doctor) return { ok: false as const, error: "Doctor not found." };
  return {
    ok: true as const,
    doctor,
    adminId: session.user.id,
    adminEmail: session.user.email ?? null,
  };
}

function bumpCompleteness(doc: unknown): number {
  return computeCompleteness(JSON.parse(JSON.stringify(doc)) as DoctorDocLike).score;
}

function revalidateAdminDoctorPaths(slug: string): void {
  revalidatePath("/admin/doctors");
  revalidatePath(`/admin/doctors/${slug}/edit`);
  revalidatePath(`/${slug}`);
}

async function logAdminEdit(input: {
  type: string;
  doctorId: unknown;
  adminId: string;
  adminEmail: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await recordAuditLog({
    type: input.type,
    entityType: "Doctor",
    entityId: input.doctorId as never,
    actorId: input.adminId,
    actorRole: "admin",
    actorEmail: input.adminEmail,
    metadata: input.metadata ?? null,
  });
}

// --- Profile section updates ---

export async function adminUpdateProfileBasicAction(
  doctorId: string,
  form: FormData,
): Promise<ActionResult> {
  const ctx = await loadDoctorAsAdmin(doctorId);
  if (!ctx.ok) return ctx;

  const langs = form.getAll("languages").map(String).filter(Boolean);
  const subs = form.getAll("subSpecialties").map(String).filter(Boolean);
  const parsed = ProfileBasicSchema.safeParse({
    prefix: form.get("prefix"),
    firstName: form.get("firstName"),
    lastName: form.get("lastName"),
    displayName: form.get("displayName"),
    gender: form.get("gender") || undefined,
    languages: langs.length ? langs : undefined,
    bio: form.get("bio") || undefined,
    subSpecialties: subs.length ? subs : undefined,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const { doctor } = ctx;
  // Same account-verification name binding as the doctor self-edit
  // (updateProfileBasicAction) — editing first/last away from the verified
  // NID name revokes the identity badge, even from the admin editor.
  const nameDecision = resolveVerifiedNameUpdate({
    prefix: parsed.data.prefix,
    firstName: parsed.data.firstName,
    lastName: parsed.data.lastName,
    submittedDisplayName: parsed.data.displayName,
    currentNidVerified: Boolean(doctor.get("nidVerified")),
    bmdcVerified: Boolean(doctor.get("bmdcVerified")),
    legalName: doctor.get("legalName") as { first?: string | null; last?: string | null } | null,
  });
  doctor.set("name.prefix", parsed.data.prefix);
  doctor.set("name.first", parsed.data.firstName);
  doctor.set("name.last", parsed.data.lastName);
  doctor.set("name.displayName", nameDecision.displayName);
  if (nameDecision.revoked) {
    doctor.set("nidVerified", false);
    doctor.set("nidVerifiedAt", null);
  }
  doctor.set("verificationLevel", nameDecision.verificationLevel);
  if (parsed.data.gender) doctor.set("gender", parsed.data.gender);
  if (parsed.data.languages) doctor.set("languages", parsed.data.languages);
  if (typeof parsed.data.bio === "string") doctor.set("bio", parsed.data.bio);
  if (parsed.data.subSpecialties) doctor.set("subSpecialties", parsed.data.subSpecialties);
  doctor.set("profileCompletenessScore", bumpCompleteness(doctor.toObject()));
  await doctor.save();

  await logAdminEdit({
    type: nameDecision.revoked
      ? "doctor.profile_basic.updated.identity_revoked"
      : "doctor.profile_basic.updated",
    doctorId: doctor._id,
    adminId: ctx.adminId,
    adminEmail: ctx.adminEmail,
    metadata: {
      displayName: nameDecision.displayName,
      identityRevoked: nameDecision.revoked,
    },
  });

  revalidateAdminDoctorPaths(doctor.get("slug"));
  return { ok: true };
}

export async function adminUpdateProfileContactAction(
  doctorId: string,
  form: FormData,
): Promise<ActionResult> {
  const ctx = await loadDoctorAsAdmin(doctorId);
  if (!ctx.ok) return ctx;

  const parsed = ProfileContactSchema.safeParse({
    publicPhone: form.get("publicPhone") || "",
    publicEmail: form.get("publicEmail") || "",
    whatsapp: form.get("whatsapp") || "",
    website: form.get("website") || "",
    privacyHidePhone: form.get("privacyHidePhone") === "on",
    privacyHideEmail: form.get("privacyHideEmail") === "on",
    whatsappAppointmentEnabled: form.get("whatsappAppointmentEnabled") === "on",
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const { doctor } = ctx;
  doctor.set("contact.publicPhone", parsed.data.publicPhone || null);
  doctor.set("contact.publicEmail", parsed.data.publicEmail || null);
  doctor.set("contact.whatsapp", parsed.data.whatsapp || null);
  doctor.set("contact.website", parsed.data.website || null);
  doctor.set("privacyHidePhone", Boolean(parsed.data.privacyHidePhone));
  doctor.set("privacyHideEmail", Boolean(parsed.data.privacyHideEmail));
  doctor.set("whatsappAppointmentEnabled", Boolean(parsed.data.whatsappAppointmentEnabled));
  doctor.set("profileCompletenessScore", bumpCompleteness(doctor.toObject()));
  await doctor.save();

  await logAdminEdit({
    type: "doctor.profile_contact.updated",
    doctorId: doctor._id,
    adminId: ctx.adminId,
    adminEmail: ctx.adminEmail,
  });

  revalidateAdminDoctorPaths(doctor.get("slug"));
  return { ok: true };
}

export async function adminUpdateProfileSpecialtiesAction(
  doctorId: string,
  form: FormData,
): Promise<ActionResult> {
  const ctx = await loadDoctorAsAdmin(doctorId);
  if (!ctx.ok) return ctx;

  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get("specialties") ?? "[]"));
  } catch {
    return { ok: false, error: "Could not read specialties payload." };
  }
  const parsed = ProfileSpecialtiesSchema.safeParse({ specialties: raw });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const cleaned = parsed.data.specialties.map((s, i) => ({ ...s, isPrimary: i === 0 ? true : false }));
  const { doctor } = ctx;
  doctor.set("specialties", cleaned);
  doctor.set("profileCompletenessScore", bumpCompleteness(doctor.toObject()));
  await doctor.save();

  await logAdminEdit({
    type: "doctor.profile_specialties.updated",
    doctorId: doctor._id,
    adminId: ctx.adminId,
    adminEmail: ctx.adminEmail,
    metadata: { count: cleaned.length },
  });

  revalidateAdminDoctorPaths(doctor.get("slug"));
  return { ok: true };
}

export async function adminUpdateProfileConcentrationsAction(
  doctorId: string,
  form: FormData,
): Promise<ActionResult> {
  const ctx = await loadDoctorAsAdmin(doctorId);
  if (!ctx.ok) return ctx;

  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get("concentrations") ?? "[]"));
  } catch {
    return { ok: false, error: "Could not read concentrations payload." };
  }
  const parsed = ProfileConcentrationsSchema.safeParse({ concentrations: raw });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const c of parsed.data.concentrations) {
    const v = c.trim();
    const key = v.toLowerCase();
    if (v && !seen.has(key)) {
      seen.add(key);
      cleaned.push(v);
    }
  }
  const { doctor } = ctx;
  doctor.set("concentrations", cleaned);
  await doctor.save();

  await logAdminEdit({
    type: "doctor.profile_concentrations.updated",
    doctorId: doctor._id,
    adminId: ctx.adminId,
    adminEmail: ctx.adminEmail,
    metadata: { count: cleaned.length },
  });

  revalidateAdminDoctorPaths(doctor.get("slug"));
  return { ok: true };
}

export async function adminUpdateProfileQualificationsAction(
  doctorId: string,
  form: FormData,
): Promise<ActionResult> {
  const ctx = await loadDoctorAsAdmin(doctorId);
  if (!ctx.ok) return ctx;

  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get("qualifications") ?? "[]"));
  } catch {
    return { ok: false, error: "Could not read qualifications payload." };
  }
  const parsed = ProfileQualificationsSchema.safeParse({ qualifications: raw });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const { doctor } = ctx;
  doctor.set("qualifications", parsed.data.qualifications);
  doctor.set("profileCompletenessScore", bumpCompleteness(doctor.toObject()));
  await doctor.save();

  await logAdminEdit({
    type: "doctor.profile_qualifications.updated",
    doctorId: doctor._id,
    adminId: ctx.adminId,
    adminEmail: ctx.adminEmail,
    metadata: { count: parsed.data.qualifications.length },
  });

  revalidateAdminDoctorPaths(doctor.get("slug"));
  return { ok: true };
}

export async function adminUpdateProfileExperienceAction(
  doctorId: string,
  form: FormData,
): Promise<ActionResult> {
  const ctx = await loadDoctorAsAdmin(doctorId);
  if (!ctx.ok) return ctx;

  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get("experience") ?? "[]"));
  } catch {
    return { ok: false, error: "Could not read experience payload." };
  }
  const parsed = ProfileExperienceSchema.safeParse({ experience: raw });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const { doctor } = ctx;
  doctor.set(
    "experience",
    parsed.data.experience.map((e) => ({
      ...e,
      from: new Date(e.from),
      to: e.to ? new Date(e.to) : null,
    })),
  );
  doctor.set("profileCompletenessScore", bumpCompleteness(doctor.toObject()));
  await doctor.save();

  await logAdminEdit({
    type: "doctor.profile_experience.updated",
    doctorId: doctor._id,
    adminId: ctx.adminId,
    adminEmail: ctx.adminEmail,
    metadata: { count: parsed.data.experience.length },
  });

  revalidateAdminDoctorPaths(doctor.get("slug"));
  return { ok: true };
}

/**
 * Loop A — admin version of the doctor's StatusEditor save.
 * Updates designation + institute + yearsOfExperience for any profile.
 */
export async function adminUpdateProfileStatusAction(
  doctorId: string,
  form: FormData,
): Promise<ActionResult> {
  const ctx = await loadDoctorAsAdmin(doctorId);
  if (!ctx.ok) return ctx;

  const yearsRaw = form.get("yearsOfExperience");
  const parsed = ProfileStatusSchema.safeParse({
    designation: String(form.get("designation") ?? ""),
    institute: String(form.get("institute") ?? ""),
    yearsOfExperience:
      yearsRaw == null || yearsRaw === "" ? null : Number(yearsRaw),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { doctor } = ctx;
  doctor.set("designation", parsed.data.designation?.trim() || null);
  doctor.set("institute", parsed.data.institute?.trim() || null);
  doctor.set("yearsOfExperience", parsed.data.yearsOfExperience ?? null);
  doctor.set("profileCompletenessScore", bumpCompleteness(doctor.toObject()));
  await doctor.save();

  await logAdminEdit({
    type: "doctor.profile_status.updated",
    doctorId: doctor._id,
    adminId: ctx.adminId,
    adminEmail: ctx.adminEmail,
    metadata: {
      designation: parsed.data.designation || null,
      institute: parsed.data.institute || null,
      yearsOfExperience: parsed.data.yearsOfExperience ?? null,
    },
  });

  revalidateAdminDoctorPaths(doctor.get("slug"));
  return { ok: true };
}

/**
 * Loop A — admin version of the doctor's CredentialsEditor save.
 * Replaces awards / memberships / publications wholesale.
 */
export async function adminUpdateProfileCredentialsAction(
  doctorId: string,
  form: FormData,
): Promise<ActionResult> {
  const ctx = await loadDoctorAsAdmin(doctorId);
  if (!ctx.ok) return ctx;

  let awardsRaw: unknown;
  let membershipsRaw: unknown;
  let publicationsRaw: unknown;
  try {
    awardsRaw = JSON.parse(String(form.get("awards") ?? "[]"));
    membershipsRaw = JSON.parse(String(form.get("memberships") ?? "[]"));
    publicationsRaw = JSON.parse(String(form.get("publications") ?? "[]"));
  } catch {
    return { ok: false, error: "Could not read credentials payload." };
  }
  const parsed = ProfileCredentialsSchema.safeParse({
    awards: awardsRaw,
    memberships: membershipsRaw,
    publications: publicationsRaw,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { doctor } = ctx;
  // Normalize empty-string optional sub-fields → drop, mirroring the
  // dashboard-side action so the DB never persists "" alongside undefined.
  const norm = <T extends Record<string, unknown>>(rows: T[]) =>
    rows.map((r) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(r)) {
        if (typeof v === "string" && v.trim().length === 0) continue;
        out[k] = v;
      }
      return out;
    });
  doctor.set("awards", norm(parsed.data.awards));
  doctor.set("memberships", norm(parsed.data.memberships));
  doctor.set("publications", norm(parsed.data.publications));
  doctor.set("profileCompletenessScore", bumpCompleteness(doctor.toObject()));
  await doctor.save();

  await logAdminEdit({
    type: "doctor.profile_credentials.updated",
    doctorId: doctor._id,
    adminId: ctx.adminId,
    adminEmail: ctx.adminEmail,
    metadata: {
      awards: parsed.data.awards.length,
      memberships: parsed.data.memberships.length,
      publications: parsed.data.publications.length,
    },
  });

  revalidateAdminDoctorPaths(doctor.get("slug"));
  return { ok: true };
}

export async function adminUpdateChambersAction(
  doctorId: string,
  form: FormData,
): Promise<ActionResult> {
  const ctx = await loadDoctorAsAdmin(doctorId);
  if (!ctx.ok) return ctx;

  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get("chambers") ?? "[]"));
  } catch {
    return { ok: false, error: "Could not read chambers payload." };
  }
  const parsed = ChambersUpdateSchema.safeParse({ chambers: raw });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const chambers = parsed.data.chambers.map((c, i) => ({
    ...c,
    isPrimary: parsed.data.chambers.some((x) => x.isPrimary)
      ? Boolean(c.isPrimary)
      : i === 0,
    coordinates: c.coordinates
      ? { lat: c.coordinates.lat, lng: c.coordinates.lng }
      : { lat: null, lng: null },
    phone: c.phone ?? null,
    floor: c.floor?.trim() ? c.floor.trim() : null,
    room: c.room?.trim() ? c.room.trim() : null,
    consultationFee: c.consultationFee ?? { amount: 0, currency: "BDT" as const },
  }));

  const { doctor } = ctx;
  doctor.set("chambers", chambers);
  doctor.set("profileCompletenessScore", bumpCompleteness(doctor.toObject()));
  await doctor.save();

  await logAdminEdit({
    type: "doctor.chambers.updated",
    doctorId: doctor._id,
    adminId: ctx.adminId,
    adminEmail: ctx.adminEmail,
    metadata: { count: chambers.length },
  });

  revalidateAdminDoctorPaths(doctor.get("slug"));
  return { ok: true };
}

export async function adminSetPublishStatusAction(
  doctorId: string,
  publish: boolean,
): Promise<ActionResult> {
  const ctx = await loadDoctorAsAdmin(doctorId);
  if (!ctx.ok) return ctx;
  const { doctor } = ctx;
  const next = publish ? "published" : "draft";
  const prev = doctor.get("status");
  // Admin can publish regardless of the mandatory-field gate (override), but we
  // record when they publish an incomplete profile.
  const incompleteOverride =
    publish &&
    missingPublishRequirements(JSON.parse(JSON.stringify(doctor.toObject())) as DoctorDocLike).length > 0;
  doctor.set("status", next);
  await doctor.save();

  await logAdminEdit({
    type: publish ? "doctor.published" : "doctor.unpublished",
    doctorId: doctor._id,
    adminId: ctx.adminId,
    adminEmail: ctx.adminEmail,
    metadata: { from: prev, to: next, incompleteOverride },
  });

  revalidateAdminDoctorPaths(doctor.get("slug"));
  return { ok: true };
}

/**
 * Admin verification override — set verification directly from the edit page,
 * no request/queue. Used when ops creates a profile on a doctor's behalf and
 * already holds their BMDC (and, optionally, has confirmed their identity).
 *
 * Sets `bmdcNumber` + `bmdcVerified` and/or `nidVerified`, then recomputes
 * `verificationLevel` (#20 — the blue tick needs both). Granting identity
 * **requires a Gov photo ID on file** (NID/passport/DL — uploaded via
 * `adminUploadIdentityDocAction`), snapshots the **current** profile name as the
 * `legalName` binding, and locks the display name to "prefix first last",
 * mirroring approveAccountVerificationAction; a later first/last edit then
 * revokes it via `resolveVerifiedNameUpdate`.
 *
 * Deliberately does NOT touch `User.approved` — login approval stays with the
 * claim queue (`/admin/verifications`). This is purely the public badge.
 */
export async function adminUpdateVerificationAction(
  doctorId: string,
  form: FormData,
): Promise<ActionResult> {
  const ctx = await loadDoctorAsAdmin(doctorId);
  if (!ctx.ok) return ctx;
  const { doctor } = ctx;

  const bmdcRaw = String(form.get("bmdcNumber") ?? "").trim();
  const bmdcVerified = form.get("bmdcVerified") === "on";
  const nidVerified = form.get("nidVerified") === "on";
  const documentFileId = String(form.get("documentFileId") ?? "").trim();
  const idDocTypeRaw = String(form.get("idDocumentType") ?? "nid");
  const idDocumentType = (["nid", "passport", "driving_license"] as const).includes(
    idDocTypeRaw as "nid" | "passport" | "driving_license",
  )
    ? (idDocTypeRaw as "nid" | "passport" | "driving_license")
    : "nid";

  // BMDC number: validate format if present; required to mark BMDC verified.
  let bmdc: string | null = null;
  if (bmdcRaw) {
    if (!isValidBmdcFormat(bmdcRaw)) {
      return { ok: false, error: "Enter a valid BMDC number (4–7 digits)." };
    }
    bmdc = normalizeBmdc(bmdcRaw);
  }
  if (bmdcVerified && !bmdc) {
    return { ok: false, error: "Add the BMDC number before marking BMDC verified." };
  }

  // Granting account/identity verification requires a Gov photo ID on file —
  // either one uploaded with this save or one stored from a prior verification.
  const wasNidVerified = Boolean(doctor.get("nidVerified"));
  const grantingIdentity = nidVerified && !wasNidVerified;
  const existingIdentityDoc = doctor.get("identityDocumentFileId");
  if (grantingIdentity && !documentFileId && !existingIdentityDoc) {
    return {
      ok: false,
      error: "Upload the doctor's NID / Gov photo ID to grant account verification.",
    };
  }

  const now = new Date();
  doctor.set("bmdcNumber", bmdc);
  doctor.set("bmdcVerified", bmdcVerified);
  doctor.set("bmdcVerifiedAt", bmdcVerified ? (doctor.get("bmdcVerifiedAt") ?? now) : null);

  doctor.set("nidVerified", nidVerified);
  if (nidVerified) {
    doctor.set("nidVerifiedAt", doctor.get("nidVerifiedAt") ?? now);
    if (documentFileId) doctor.set("identityDocumentFileId", documentFileId);
    doctor.set("idDocumentType", idDocumentType);
    // Bind the legal name to the current profile name + lock the display name (#20).
    const first = String(doctor.get("name.first") ?? "").trim();
    const last = String(doctor.get("name.last") ?? "").trim();
    const prefix = String(doctor.get("name.prefix") ?? "Dr.");
    doctor.set("legalName", { first, last });
    doctor.set("name.displayName", `${prefix} ${first} ${last}`.replace(/\s+/g, " ").trim());
  } else {
    doctor.set("nidVerifiedAt", null);
    if (wasNidVerified) doctor.set("legalName", null);
  }

  doctor.set("verificationLevel", computeVerificationLevel(bmdcVerified, nidVerified));

  try {
    await doctor.save();
  } catch (e: unknown) {
    if (typeof e === "object" && e !== null && (e as { code?: number }).code === 11000) {
      return { ok: false, error: "That BMDC number is already used by another profile." };
    }
    throw e;
  }

  await logAdminEdit({
    type: "doctor.verification.updated",
    doctorId: doctor._id,
    adminId: ctx.adminId,
    adminEmail: ctx.adminEmail,
    metadata: {
      bmdcNumber: bmdc,
      bmdcVerified,
      nidVerified,
      idDocumentType: nidVerified ? idDocumentType : null,
      verificationLevel: doctor.get("verificationLevel"),
    },
  });

  revalidateAdminDoctorPaths(doctor.get("slug"));
  return { ok: true };
}

/**
 * Admin uploads a doctor's Gov photo ID (NID/passport/DL) on their behalf —
 * streams to the PRIVATE bucket and returns the new File doc id, which
 * adminUpdateVerificationAction then stores on `Doctor.identityDocumentFileId`.
 * Read back later via a presigned GET (never a client-built URL).
 */
export async function adminUploadIdentityDocAction(
  doctorId: string,
  formData: FormData,
): Promise<ActionResult<{ fileId: string }>> {
  const ctx = await loadDoctorAsAdmin(doctorId);
  if (!ctx.ok) return ctx;
  const { doctor } = ctx;

  const result = await uploadDocForPurpose({
    purposeKey: "doctor_identity",
    ownerFolderId: String(doctor._id),
    file: formData.get("file"),
    allowed: DOC_MIME_TYPES,
    linkedEntityId: doctor._id as Types.ObjectId,
    uploadedBy: ctx.adminId,
    title: "Government photo ID (admin upload)",
  });
  if (!result.ok) return result;
  return { ok: true, data: { fileId: result.fileId } };
}

// --- Photo flow (server-side upload) ---

export async function adminUploadDoctorPhotoAction(
  doctorId: string,
  formData: FormData,
): Promise<ActionResult<{ url: string }>> {
  const ctx = await loadDoctorAsAdmin(doctorId);
  if (!ctx.ok) return ctx;
  const { doctor } = ctx;

  const kind = String(formData.get("kind") ?? "");
  if (kind !== "profile" && kind !== "cover") {
    return { ok: false, error: "Invalid upload kind." };
  }

  const result = await uploadDoctorPhotoFromForm({
    doctor,
    kind,
    file: formData.get("file"),
    uploadedBy: ctx.adminId,
  });
  if (!result.ok) return result;

  await logAdminEdit({
    type: kind === "profile" ? "doctor.photo.updated" : "doctor.cover_photo.updated",
    doctorId: doctor._id,
    adminId: ctx.adminId,
    adminEmail: ctx.adminEmail,
    metadata: { url: result.url },
  });

  revalidateAdminDoctorPaths(doctor.get("slug") as string);
  return { ok: true, data: { url: result.url } };
}
