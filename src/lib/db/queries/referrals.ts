/**
 * Read queries for the Founding Doctor referral program. The dashboard referral
 * hub uses these to show a doctor their referred colleagues + progress. The
 * authoritative counts also live (denormalized) on `Doctor.foundingDoctor`, but
 * the list view reads live so pending/qualified status is always current.
 */

import type { Loose } from "@/lib/db/models/loose";
import { dbConnect } from "@/lib/db/mongoose";
import { Referral } from "@/lib/db/models";

export interface ReferralListItem {
  _id: string;
  status: "pending" | "qualified";
  via: "register" | "claim";
  referredName: string | null;
  referredSlug: string | null;
  createdAt: string;
  qualifiedAt: string | null;
}

interface ReferralLean {
  _id: unknown;
  status: "pending" | "qualified";
  via: "register" | "claim";
  referredDoctorId: { name?: { displayName?: string }; slug?: string } | null;
  createdAt?: Date | string;
  qualifiedAt?: Date | string | null;
}

/** Every referral a doctor has made, newest first, with the referred doctor's name/slug. */
export async function listReferralsForDoctor(referrerDoctorId: string): Promise<ReferralListItem[]> {
  await dbConnect();
  const rows = (await (Referral as unknown as Loose)
    .find({ referrerDoctorId })
    .sort({ createdAt: -1 })
    .populate("referredDoctorId", "name.displayName slug")
    .lean()) as unknown as ReferralLean[];

  return rows.map((r) => ({
    _id: String(r._id),
    status: r.status,
    via: r.via,
    referredName: r.referredDoctorId?.name?.displayName ?? null,
    referredSlug: r.referredDoctorId?.slug ?? null,
    createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : "",
    qualifiedAt: r.qualifiedAt ? new Date(r.qualifiedAt).toISOString() : null,
  }));
}

/** Count of referrals that have qualified (referred doctor approved). */
export async function countQualifiedReferrals(referrerDoctorId: string): Promise<number> {
  await dbConnect();
  return (await (Referral as unknown as Loose).countDocuments({
    referrerDoctorId,
    status: "qualified",
  })) as number;
}
