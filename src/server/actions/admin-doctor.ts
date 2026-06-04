"use server";

import { revalidatePath } from "next/cache";
import { Types } from "mongoose";
import { auth } from "@/lib/auth/config";
import { dbConnect } from "@/lib/db/mongoose";
import { Doctor } from "@/lib/db/models";
import { computeCompleteness } from "@/lib/utils/completeness";
import { resolveVerifiedNameUpdate } from "@/lib/utils/verification";
import { uploadDoctorPhotoFromForm } from "@/lib/s3/doctor-photo";
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
  doctor.set("status", next);
  await doctor.save();

  await logAdminEdit({
    type: publish ? "doctor.published" : "doctor.unpublished",
    doctorId: doctor._id,
    adminId: ctx.adminId,
    adminEmail: ctx.adminEmail,
    metadata: { from: prev, to: next },
  });

  revalidateAdminDoctorPaths(doctor.get("slug"));
  return { ok: true };
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
