"use server";

import type { Loose } from "@/lib/db/models/loose";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/config";
import { dbConnect } from "@/lib/db/mongoose";
import { Doctor, ClaimRequest, IdentityVerificationRequest, User } from "@/lib/db/models";
import { normalizeBmdc, isValidBmdcFormat } from "@/lib/utils/bmdc";
import { computeVerificationLevel } from "@/lib/utils/verification";
import { AccountVerificationSchema } from "@/lib/validators/verification";
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
  const documentFileIds = form.getAll("documentFileId").map(String).filter(Boolean);

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
  await (ClaimRequest as unknown as Loose).create({
    doctorId: doctor._id,
    requestedBy: session.user.id,
    bmdcNumberProvided: bmdc,
    documentFileIds,
    notesFromDoctor: notes || null,
    status: "pending",
  });

  revalidatePath("/dashboard/verification");
  revalidatePath("/admin/verifications");
  return { ok: true };
}

/**
 * Account (identity) verification request — doctor submits a Gov photo ID +
 * legal first/last name. Admin reviews in /admin/account-verifications. This
 * is independent of the BMDC claim flow and never touches sign-in state.
 */
export async function requestAccountVerificationAction(form: FormData): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not signed in." };

  const parsed = AccountVerificationSchema.safeParse({
    legalFirstName: form.get("legalFirstName"),
    legalLastName: form.get("legalLastName"),
    idDocumentType: form.get("idDocumentType"),
    documentFileIds: form.getAll("documentFileId").map(String).filter(Boolean),
    notes: String(form.get("notes") ?? "") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await dbConnect();
  const doctor = await Doctor.findOne({ ownerId: session.user.id });
  if (!doctor) return { ok: false, error: "No profile found." };
  if (doctor.get("nidVerified")) {
    return { ok: false, error: "Your account is already verified." };
  }

  // One open request at a time — avoids duplicate queue entries.
  const existing = await (IdentityVerificationRequest as unknown as Loose)
    .findOne({ doctorId: doctor._id, status: "pending" })
    .lean();
  if (existing) {
    return { ok: false, error: "You already have an account verification under review." };
  }

  await (IdentityVerificationRequest as unknown as Loose).create({
    doctorId: doctor._id,
    requestedBy: session.user.id,
    legalName: { first: parsed.data.legalFirstName, last: parsed.data.legalLastName },
    idDocumentType: parsed.data.idDocumentType,
    documentFileIds: parsed.data.documentFileIds,
    notesFromDoctor: parsed.data.notes || null,
    status: "pending",
  });

  revalidatePath("/dashboard/verification");
  revalidatePath("/admin/account-verifications");
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
  const claim = await (ClaimRequest as unknown as Loose).findById(claimId);
  if (!claim) return { ok: false, error: "Request not found." };
  if (claim.get("status") !== "pending") return { ok: false, error: "Already reviewed." };

  const doctor = await Doctor.findById(claim.get("doctorId"));
  if (!doctor) return { ok: false, error: "Linked doctor not found." };

  const now = new Date();
  doctor.set("bmdcVerified", true);
  doctor.set("bmdcVerifiedAt", now);
  doctor.set(
    "verificationLevel",
    computeVerificationLevel(true, Boolean(doctor.get("nidVerified"))),
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
    entityId: claim._id as string,
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
  const claim = await (ClaimRequest as unknown as Loose).findById(claimId);
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
    entityId: claim._id as string,
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

// --- Admin review: account (identity) verification ---

export async function approveAccountVerificationAction(requestId: string): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  await dbConnect();
  const req = await (IdentityVerificationRequest as unknown as Loose).findById(requestId);
  if (!req) return { ok: false, error: "Request not found." };
  if (req.get("status") !== "pending") return { ok: false, error: "Already reviewed." };

  const doctor = await Doctor.findById(req.get("doctorId"));
  if (!doctor) return { ok: false, error: "Linked doctor not found." };

  const legal = (req.get("legalName") ?? {}) as { first?: string; last?: string };
  const first = String(legal.first ?? "").trim();
  const last = String(legal.last ?? "").trim();
  if (!first || !last) return { ok: false, error: "Request is missing the legal name." };

  const now = new Date();
  const prefix = String(doctor.get("name.prefix") ?? "Dr.");
  // Bind the profile name to the verified NID legal name and lock the public
  // display name to "prefix first last" (see the name-change guard).
  doctor.set("name.first", first);
  doctor.set("name.last", last);
  doctor.set("name.displayName", `${prefix} ${first} ${last}`.replace(/\s+/g, " ").trim());
  doctor.set("legalName", { first, last });
  doctor.set("idDocumentType", req.get("idDocumentType"));
  doctor.set("nidVerified", true);
  doctor.set("nidVerifiedAt", now);
  doctor.set(
    "verificationLevel",
    computeVerificationLevel(Boolean(doctor.get("bmdcVerified")), true),
  );
  await doctor.save();

  req.set("status", "approved");
  req.set("reviewedBy", guard.userId);
  req.set("reviewedAt", now);
  req.set("verifiedAt", now);
  await req.save();

  await recordAuditLog({
    type: "identity.approved",
    entityType: "IdentityVerificationRequest",
    entityId: req._id as string,
    actorId: guard.userId,
    actorRole: "admin",
    actorEmail: guard.email,
    metadata: {
      doctorId: String(doctor._id),
      doctorSlug: doctor.get("slug"),
      verificationLevel: doctor.get("verificationLevel"),
      idDocumentType: req.get("idDocumentType"),
    },
  });

  revalidatePath(`/${doctor.get("slug")}`);
  revalidatePath("/admin/account-verifications");
  return { ok: true };
}

export async function rejectAccountVerificationAction(
  requestId: string,
  notes: string,
): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  await dbConnect();
  const req = await (IdentityVerificationRequest as unknown as Loose).findById(requestId);
  if (!req) return { ok: false, error: "Request not found." };
  if (req.get("status") !== "pending") return { ok: false, error: "Already reviewed." };

  const trimmedNotes = String(notes || "").slice(0, 1000);
  req.set("status", "rejected");
  req.set("reviewedBy", guard.userId);
  req.set("reviewedAt", new Date());
  req.set("reviewerNotes", trimmedNotes);
  await req.save();

  await recordAuditLog({
    type: "identity.rejected",
    entityType: "IdentityVerificationRequest",
    entityId: req._id as string,
    actorId: guard.userId,
    actorRole: "admin",
    actorEmail: guard.email,
    note: trimmedNotes || null,
    metadata: {
      doctorId: String(req.get("doctorId")),
    },
  });

  revalidatePath("/admin/account-verifications");
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
