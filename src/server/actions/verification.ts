"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/config";
import { dbConnect } from "@/lib/db/mongoose";
import { Doctor, ClaimRequest, User } from "@/lib/db/models";
import { normalizeBmdc, isValidBmdcFormat } from "@/lib/utils/bmdc";
import { recordAuditLog } from "@/lib/audit/log";

type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

export async function requestVerificationAction(form: FormData): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not signed in." };

  const bmdcRaw = String(form.get("bmdcNumber") ?? "").trim();
  if (!isValidBmdcFormat(bmdcRaw)) {
    return { ok: false, error: "Enter a valid BMDC number (4–7 digits)." };
  }
  const bmdc = normalizeBmdc(bmdcRaw);
  const notes = String(form.get("notes") ?? "").slice(0, 1000);
  const documents = form.getAll("documentKey").map(String).filter(Boolean);

  await dbConnect();
  const doctor = await Doctor.findOne({ ownerId: session.user.id });
  if (!doctor) return { ok: false, error: "No profile found." };

  // Update doctor's BMDC number on the spot (admin will mark as verified later).
  if (doctor.get("bmdcNumber") !== bmdc) {
    doctor.set("bmdcNumber", bmdc);
    doctor.set("bmdcVerified", false);
    await doctor.save();
  }

  // Create the claim/verification request. The same model handles both
  // "claim this unclaimed profile" and "verify my BMDC" — distinguished by
  // whether `isClaimed` was already true.
  await (ClaimRequest as unknown as { create: Function }).create({
    doctorId: doctor._id,
    requestedBy: session.user.id,
    bmdcNumberProvided: bmdc,
    documentsUploaded: documents,
    notesFromDoctor: notes || null,
    status: "pending",
  });

  revalidatePath("/dashboard/verification");
  revalidatePath("/admin/verifications");
  return { ok: true };
}

// --- Admin review ---

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "admin") {
    return { ok: false as const, error: "Admin only." };
  }
  return {
    ok: true as const,
    userId: session.user.id,
    email: session.user.email ?? null,
  };
}

export async function approveClaimAction(claimId: string): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  await dbConnect();
  const claim = await (ClaimRequest as unknown as { findById: Function }).findById(claimId);
  if (!claim) return { ok: false, error: "Request not found." };
  if (claim.get("status") !== "pending") return { ok: false, error: "Already reviewed." };

  const doctor = await Doctor.findById(claim.get("doctorId"));
  if (!doctor) return { ok: false, error: "Linked doctor not found." };

  const now = new Date();
  doctor.set("bmdcVerified", true);
  doctor.set("bmdcVerifiedAt", now);
  doctor.set(
    "verificationLevel",
    doctor.get("nidVerified") ? "fully_verified" : "bmdc_verified",
  );
  if (!doctor.get("isClaimed")) {
    doctor.set("isClaimed", true);
    doctor.set("claimedAt", now);
  }
  await doctor.save();

  claim.set("status", "approved");
  claim.set("reviewedBy", guard.userId);
  claim.set("reviewedAt", now);
  claim.set("verifiedAt", now);
  await claim.save();

  // Approval also unlocks the requester's sign-in. New doctor accounts are
  // created with `approved: false` so they can't log in until this flag is
  // flipped — see auth.ts:completeRegistrationAction.
  const requesterId = claim.get("requestedBy");
  if (requesterId) {
    await User.updateOne({ _id: requesterId }, { $set: { approved: true } });
  }

  await recordAuditLog({
    type: "claim.approved",
    entityType: "ClaimRequest",
    entityId: claim._id,
    actorId: guard.userId,
    actorRole: "admin",
    actorEmail: guard.email,
    metadata: {
      doctorId: String(doctor._id),
      doctorSlug: doctor.get("slug"),
      verificationLevel: doctor.get("verificationLevel"),
    },
  });

  revalidatePath(`/${doctor.get("slug")}`);
  revalidatePath("/admin/verifications");
  return { ok: true };
}

export async function rejectClaimAction(claimId: string, notes: string): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  await dbConnect();
  const claim = await (ClaimRequest as unknown as { findById: Function }).findById(claimId);
  if (!claim) return { ok: false, error: "Request not found." };
  if (claim.get("status") !== "pending") return { ok: false, error: "Already reviewed." };

  const trimmedNotes = String(notes || "").slice(0, 1000);
  claim.set("status", "rejected");
  claim.set("reviewedBy", guard.userId);
  claim.set("reviewedAt", new Date());
  claim.set("reviewerNotes", trimmedNotes);
  await claim.save();

  await recordAuditLog({
    type: "claim.rejected",
    entityType: "ClaimRequest",
    entityId: claim._id,
    actorId: guard.userId,
    actorRole: "admin",
    actorEmail: guard.email,
    note: trimmedNotes || null,
    metadata: {
      doctorId: String(claim.get("doctorId")),
    },
  });

  revalidatePath("/admin/verifications");
  return { ok: true };
}

export async function suspendDoctorAction(slug: string, reason: string): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  await dbConnect();
  const doctor = await Doctor.findOne({ slug });
  if (!doctor) return { ok: false, error: "Doctor not found." };
  const trimmedReason = String(reason || "").slice(0, 120);
  doctor.set("status", "suspended");
  doctor.set("seoDescription", doctor.get("seoDescription") || `(suspended) ${trimmedReason}`);
  await doctor.save();

  await recordAuditLog({
    type: "doctor.suspended",
    entityType: "Doctor",
    entityId: doctor._id,
    actorId: guard.userId,
    actorRole: "admin",
    actorEmail: guard.email,
    note: trimmedReason || null,
  });

  revalidatePath(`/${slug}`);
  revalidatePath("/admin/doctors");
  return { ok: true };
}
