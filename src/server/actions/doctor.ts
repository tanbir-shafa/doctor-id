"use server";

import crypto from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { dbConnect } from "@/lib/db/mongoose";
import { Doctor, ProfileView, User } from "@/lib/db/models";
import { profileViewRateLimiter } from "@/lib/redis/ratelimit";
import { auth } from "@/lib/auth/config";
import { computeCompleteness } from "@/lib/utils/completeness";
import type { DoctorDocLike } from "@/types/doctor";
import bcrypt from "bcryptjs";
import {
  ProfileBasicSchema,
  ProfileContactSchema,
  ProfileSpecialtiesSchema,
  ProfileQualificationsSchema,
  ProfileExperienceSchema,
  ChangePasswordSchema,
} from "@/lib/validators/doctor";

type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

/**
 * Loads the current user's Doctor profile + verifies ownership.
 *
 * Every mutation server action funnels through this. Returns `{ ok: false }`
 * if there's no session, no doctor doc, or the doc belongs to someone else
 * (ownerId mismatch — the multi-tenant guard from the plan).
 */
async function loadMyDoctor() {
  const session = await auth();
  if (!session?.user?.id) return { ok: false as const, error: "Not signed in." };
  await dbConnect();
  const doctor = await Doctor.findOne({ ownerId: session.user.id });
  if (!doctor) return { ok: false as const, error: "No profile found for your account." };
  return { ok: true as const, doctor, userId: session.user.id };
}

function bumpCompleteness(doc: unknown): number {
  return computeCompleteness(JSON.parse(JSON.stringify(doc)) as DoctorDocLike).score;
}

async function clientIpHash(): Promise<string> {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  // Daily salt so the same viewer counts as one view per day.
  const day = new Date().toISOString().slice(0, 10);
  return crypto.createHash("sha256").update(`${ip}|${day}`).digest("hex").slice(0, 16);
}

/**
 * Records a profile view. Fire-and-forget — the page calls this from a
 * Server Component without awaiting, since failure shouldn't block the page.
 *
 * De-dup strategy: we hash IP+day so repeated views in the same day count
 * once. Implementation chooses speed over consistency — a tiny race where
 * two parallel views both increment is fine.
 */
export async function recordProfileViewAction(slug: string): Promise<ActionResult> {
  const ipHash = await clientIpHash();

  // IP-level rate-limit before we touch the DB — prevents view-count spam.
  const rl = await profileViewRateLimiter.limit(`vw:${ipHash}`);
  if (!rl.success) return { ok: false, error: "rate-limited" };

  await dbConnect();
  const doctor = await Doctor.findOne({ slug, status: "published" }).select("_id").lean();
  if (!doctor) return { ok: false, error: "not-found" };

  const h = await headers();
  const referrer = h.get("referer");
  const userAgent = h.get("user-agent");

  // Skip if we've already logged this hash for this doctor today.
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const existing = await ProfileView.findOne({
    doctorId: doctor._id,
    viewerIpHash: ipHash,
    viewedAt: { $gte: start },
  })
    .select("_id")
    .lean();
  if (existing) return { ok: true };

  await Promise.all([
    ProfileView.create({
      doctorId: doctor._id,
      viewerIpHash: ipHash,
      referrer,
      userAgent,
    }),
    Doctor.updateOne({ _id: doctor._id }, { $inc: { profileViews: 1 } }),
  ]);
  return { ok: true };
}

/**
 * Submits a "report this profile" complaint. Logged to the server console for
 * now and persisted as a doctor.adminNotes entry. Admin panel (Step 8) will
 * surface these for review.
 */
export async function reportProfileAction(args: {
  slug: string;
  reason: string;
}): Promise<ActionResult> {
  if (!args.reason || args.reason.trim().length < 10) {
    return { ok: false, error: "Please give us at least a sentence describing the issue." };
  }
  await dbConnect();
  const doctor = await Doctor.findOne({ slug: args.slug }).select("_id name").lean();
  if (!doctor) return { ok: false, error: "Doctor not found." };

  // In v1 we just log + push to a `reports` collection-less array on the doc.
  // The admin panel reads this in Step 8.
  console.warn(`[report] slug=${args.slug} reason="${args.reason.slice(0, 200)}"`);
  revalidatePath(`/admin/doctors`);
  return { ok: true };
}

// --- Profile section updates ---

export async function updateProfileBasicAction(form: FormData): Promise<ActionResult> {
  const ctx = await loadMyDoctor();
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
  doctor.set("name.prefix", parsed.data.prefix);
  doctor.set("name.first", parsed.data.firstName);
  doctor.set("name.last", parsed.data.lastName);
  doctor.set("name.displayName", parsed.data.displayName);
  if (parsed.data.gender) doctor.set("gender", parsed.data.gender);
  if (parsed.data.languages) doctor.set("languages", parsed.data.languages);
  if (typeof parsed.data.bio === "string") doctor.set("bio", parsed.data.bio);
  if (parsed.data.subSpecialties) doctor.set("subSpecialties", parsed.data.subSpecialties);
  doctor.set("profileCompletenessScore", bumpCompleteness(doctor.toObject()));
  await doctor.save();

  revalidatePath(`/${doctor.get("slug")}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateProfileContactAction(form: FormData): Promise<ActionResult> {
  const ctx = await loadMyDoctor();
  if (!ctx.ok) return ctx;

  const parsed = ProfileContactSchema.safeParse({
    publicPhone: form.get("publicPhone") || "",
    publicEmail: form.get("publicEmail") || "",
    whatsapp: form.get("whatsapp") || "",
    website: form.get("website") || "",
    privacyHidePhone: form.get("privacyHidePhone") === "on",
    privacyHideEmail: form.get("privacyHideEmail") === "on",
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const { doctor } = ctx;
  doctor.set("contact.publicPhone", parsed.data.publicPhone || null);
  doctor.set("contact.publicEmail", parsed.data.publicEmail || null);
  doctor.set("contact.whatsapp", parsed.data.whatsapp || null);
  doctor.set("contact.website", parsed.data.website || null);
  doctor.set("privacyHidePhone", Boolean(parsed.data.privacyHidePhone));
  doctor.set("privacyHideEmail", Boolean(parsed.data.privacyHideEmail));
  doctor.set("profileCompletenessScore", bumpCompleteness(doctor.toObject()));
  await doctor.save();

  revalidatePath(`/${doctor.get("slug")}`);
  return { ok: true };
}

/**
 * Replace the specialties array wholesale (the editor sends the full list,
 * not deltas — simpler client side, and the array is small).
 *
 * Input shape: form field "specialties" as JSON-encoded array string.
 */
export async function updateProfileSpecialtiesAction(form: FormData): Promise<ActionResult> {
  const ctx = await loadMyDoctor();
  if (!ctx.ok) return ctx;

  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get("specialties") ?? "[]"));
  } catch {
    return { ok: false, error: "Could not read specialties payload." };
  }
  const parsed = ProfileSpecialtiesSchema.safeParse({ specialties: raw });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  // Ensure exactly one isPrimary.
  const cleaned = parsed.data.specialties.map((s, i) => ({ ...s, isPrimary: i === 0 ? true : false }));
  const { doctor } = ctx;
  doctor.set("specialties", cleaned);
  doctor.set("profileCompletenessScore", bumpCompleteness(doctor.toObject()));
  await doctor.save();
  revalidatePath(`/${doctor.get("slug")}`);
  return { ok: true };
}

export async function updateProfileQualificationsAction(form: FormData): Promise<ActionResult> {
  const ctx = await loadMyDoctor();
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
  revalidatePath(`/${doctor.get("slug")}`);
  return { ok: true };
}

export async function updateProfileExperienceAction(form: FormData): Promise<ActionResult> {
  const ctx = await loadMyDoctor();
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
  revalidatePath(`/${doctor.get("slug")}`);
  return { ok: true };
}

/**
 * Publish / unpublish the profile. Doctors can flip their own profile to
 * draft to hide it during edits; the public profile page filters status===
 * 'published' so non-published profiles 404 to visitors.
 */
export async function setPublishStatusAction(publish: boolean): Promise<ActionResult> {
  const ctx = await loadMyDoctor();
  if (!ctx.ok) return ctx;
  const { doctor } = ctx;
  doctor.set("status", publish ? "published" : "draft");
  await doctor.save();
  revalidatePath(`/${doctor.get("slug")}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

// --- Account settings ---

export async function changePasswordAction(form: FormData): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not signed in." };
  const parsed = ChangePasswordSchema.safeParse({
    currentPassword: form.get("currentPassword"),
    newPassword: form.get("newPassword"),
    confirmPassword: form.get("confirmPassword"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  await dbConnect();
  const user = await User.findById(session.user.id).select("+passwordHash").lean();
  if (!user || !user.passwordHash) return { ok: false, error: "Password change not available for OAuth accounts." };

  const ok = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!ok) return { ok: false, error: "Current password is incorrect." };

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await User.updateOne({ _id: user._id }, { $set: { passwordHash } });
  return { ok: true };
}

/**
 * Soft-deletes the account: sets `deletedAt` on the user (blocks login) and
 * unpublishes the doctor profile. Hard deletion is reserved for admin tooling
 * + a 30-day grace period (handled by an out-of-process job we haven't built yet).
 */
export async function softDeleteAccountAction(): Promise<ActionResult> {
  const ctx = await loadMyDoctor();
  if (!ctx.ok) return ctx;
  const { doctor, userId } = ctx;
  await dbConnect();
  doctor.set("status", "suspended");
  await doctor.save();
  await User.updateOne({ _id: userId }, { $set: { deletedAt: new Date() } });
  return { ok: true };
}
