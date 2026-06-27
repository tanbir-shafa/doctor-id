"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { dbConnect } from "@/lib/db/mongoose";
import { Doctor, ProfileView, User, AppointmentRequest } from "@/lib/db/models";
import type { Loose } from "@/lib/db/models/loose";
import { profileViewRateLimiter, reportProfileRateLimiter } from "@/lib/redis/ratelimit";
import { clientIpHash as ipHash } from "@/lib/utils/request-ip";
import { auth } from "@/lib/auth/config";
import { computeCompleteness, missingPublishRequirements } from "@/lib/utils/completeness";
import { isBotUserAgent } from "@/lib/utils/bot-detection";
import { resolveVerifiedNameUpdate } from "@/lib/utils/verification";
import type { DoctorDocLike } from "@/types/doctor";
import type { HomeScoreboard } from "@/types/home";
import bcrypt from "bcryptjs";
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
  // Daily salt so the same viewer counts as one view per day. IP is derived via
  // the trusted-proxy helper (nginx X-Real-IP / right-most XFF), not the
  // spoofable left-most hop.
  const day = new Date().toISOString().slice(0, 10);
  return ipHash(await headers(), { salt: day, length: 16 });
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

  // Don't count crawlers / scripting clients (option 1). Even though the page
  // now fires this from the client (option 2), JS-capable bots and direct hits
  // to this action still reach here — this is the defense-in-depth filter.
  if (isBotUserAgent(userAgent)) return { ok: true };

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
    // Lifetime counter + 30d window cache (T12 — surfaces as "views this
    // month" chip on the public profile). lastViewedAt powers freshness
    // signals later.
    Doctor.updateOne(
      { _id: doctor._id },
      {
        $inc: { profileViews: 1, "metrics.profileViews30d": 1 },
        $set: { "metrics.lastViewedAt": new Date() },
      },
    ),
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
  // Unauthenticated public form — rate-limit per trusted IP to stop report spam.
  const rl = await reportProfileRateLimiter.limit(`report:${ipHash(await headers(), { length: 16 })}`);
  if (!rl.success) {
    return { ok: false, error: "Too many reports from your network. Try again later." };
  }
  const reason = (args.reason ?? "").trim();
  if (reason.length < 10) {
    return { ok: false, error: "Please give us at least a sentence describing the issue." };
  }
  if (reason.length > 1000) {
    return { ok: false, error: "Please keep your report under 1000 characters." };
  }
  await dbConnect();
  const doctor = await Doctor.findOne({ slug: args.slug }).select("_id name").lean();
  if (!doctor) return { ok: false, error: "Doctor not found." };

  // In v1 we just log + push to a `reports` collection-less array on the doc.
  // The admin panel reads this in Step 8.
  console.warn(`[report] slug=${args.slug} reason="${reason.slice(0, 200)}"`);
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
  // Account verification binds the profile name to the NID legal name. Editing
  // first/last away from the verified snapshot revokes the identity badge; the
  // display name is locked to "prefix first last" while still verified.
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
 * Loop A — designation + institute + years of experience. Three flat fields
 * that surface on the public profile header. Empty string sets the field
 * to `null` so the chip hides.
 */
export async function updateProfileStatusAction(form: FormData): Promise<ActionResult> {
  const ctx = await loadMyDoctor();
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
  const {doctor} = ctx;
  doctor.set("designation", parsed.data.designation?.trim() || null);
  doctor.set("institute", parsed.data.institute?.trim() || null);
  doctor.set("yearsOfExperience", parsed.data.yearsOfExperience ?? null);
  doctor.set("profileCompletenessScore", bumpCompleteness(doctor.toObject()));
  await doctor.save();
  revalidatePath(`/${doctor.get("slug")}`);
  return { ok: true };
}

/**
 * Loop A — credentials block: awards, memberships, publications. The dashboard
 * editor submits the full lists (not deltas), same pattern as qualifications
 * and experience.
 *
 * Wire format: form fields "awards", "memberships", "publications" each carry
 * a JSON-encoded array string.
 */
export async function updateProfileCredentialsAction(form: FormData): Promise<ActionResult> {
  const ctx = await loadMyDoctor();
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
  const {doctor} = ctx;
  // Normalize empty-string optional fields back to undefined so Mongoose
  // doesn't persist empty strings.
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
  revalidatePath(`/${doctor.get("slug")}`);
  return { ok: true };
}

/**
 * Areas of focus — free-form concentration tags. Replaced wholesale like
 * specialties. NOT part of the completeness score, so no recompute here.
 *
 * Wire format: form field "concentrations" carries a JSON-encoded array string.
 */
export async function updateProfileConcentrationsAction(form: FormData): Promise<ActionResult> {
  const ctx = await loadMyDoctor();
  if (!ctx.ok) return ctx;
  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get("concentrations") ?? "[]"));
  } catch {
    return { ok: false, error: "Could not read concentrations payload." };
  }
  const parsed = ProfileConcentrationsSchema.safeParse({ concentrations: raw });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  // Trim + drop empties + case-insensitive dedupe so the DB stays tidy.
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
  revalidatePath(`/${doctor.get("slug")}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Replace the chambers array wholesale.
 *
 * The dashboard editor submits the full list (not deltas), matching the
 * pattern used by specialties/qualifications/experience. Server-side we
 * Zod-validate per-chamber (HH:mm, no overlap, single primary), then normalize
 * the primary flag so exactly one chamber is primary when ≥1 are present.
 *
 * Wire format: form field "chambers" carries a JSON-encoded array string.
 */
export async function updateChambersAction(form: FormData): Promise<ActionResult> {
  const ctx = await loadMyDoctor();
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

  // Normalize primary flag: if no chamber is explicitly primary but there's
  // at least one chamber, the first becomes primary. (Public profile fell
  // back to chambers[0] already; making it explicit keeps the DB tidy.)
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

  revalidatePath(`/${doctor.get("slug")}`);
  revalidatePath("/dashboard/chambers");
  revalidatePath("/dashboard");
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
  // Publishing is gated by admin approval. Unpublishing (→ draft) is always
  // allowed. `User.approved` defaults true (admins/legacy/seed); new doctors
  // are false until an admin approves via the BMDC claim queue.
  if (publish) {
    const user = await User.findById(ctx.userId).select("approved").lean<{ approved?: boolean } | null>();
    if (user?.approved === false) {
      return {
        ok: false,
        error:
          "Your profile can be published once an admin approves your account (usually within 24 hours).",
      };
    }
    // Quality gate: the profile must carry the mandatory fields (name, photo,
    // ≥1 specialty, ≥1 qualification) before it can go public.
    const missing = missingPublishRequirements(
      JSON.parse(JSON.stringify(doctor.toObject())) as DoctorDocLike,
    );
    if (missing.length > 0) {
      return {
        ok: false,
        error: `Add these before publishing: ${missing.map((s) => s.label).join(", ")}.`,
      };
    }
  }
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

/**
 * Read-only scoreboard for the logged-in-doctor home page overlay
 * (`<HomeTop>` calls this on mount). Returns `{ ok: false }` for anonymous
 * visitors and non-doctor accounts (e.g. admins have no Doctor doc), which the
 * client treats as "render the marketing hero instead". No mutation, so it
 * skips the Zod/rate-limit steps of the write-action pattern, but keeps the
 * auth + ownership guard via `loadMyDoctor()`.
 */
export async function loadHomeScoreboardAction(): Promise<ActionResult<HomeScoreboard>> {
  const ctx = await loadMyDoctor();
  if (!ctx.ok) return ctx;
  const { doctor, userId } = ctx;

  const plain = JSON.parse(JSON.stringify(doctor.toObject())) as DoctorDocLike;
  const { score, sections } = computeCompleteness(plain);
  // Same single-CTA nudge rule as the dashboard: highest-weight unfinished
  // section, ties broken by section order. Null at 100%.
  const nextSection =
    score < 100
      ? [...sections].filter((s) => !s.done).sort((a, b) => b.weight - a.weight)[0] ?? null
      : null;

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [views30d, pendingRequests, userRow] = await Promise.all([
    (ProfileView as unknown as Loose).countDocuments({
      doctorId: doctor._id,
      viewedAt: { $gte: since },
    }) as Promise<number>,
    AppointmentRequest.countDocuments({ doctorId: doctor._id, status: "pending" }),
    User.findById(userId)
      .select("emr")
      .lean<{ emr?: { seatStatus?: "pending" | "ready" | "declined" } } | null>(),
  ]);

  return {
    ok: true,
    data: {
      firstName: plain.name.first,
      slug: plain.slug,
      published: plain.status === "published",
      views30d,
      viewsAllTime: plain.profileViews ?? 0,
      pendingRequests,
      completeness: score,
      nextAction: nextSection ? { label: nextSection.label, weight: nextSection.weight } : null,
      emrSeatStatus: userRow?.emr?.seatStatus ?? null,
    },
  };
}
