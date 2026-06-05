/**
 * Founding Doctor referral — server service (touches Mongoose).
 *
 * Three operations, all best-effort and non-throwing so a referral hiccup can
 * never break registration or claim approval:
 *   - resolveReferrer(code)            — code → referrer identity (slug, then BMDC)
 *   - recordReferral({...})            — mint a pending Referral (first-touch, no self-ref)
 *   - qualifyReferralAndRecompute(id)  — on approval: pending → qualified, award badge
 *
 * Pure threshold logic lives in `@/lib/utils/referral`.
 */

import type { Loose } from "@/lib/db/models/loose";
import { dbConnect } from "@/lib/db/mongoose";
import { Doctor, Referral } from "@/lib/db/models";
import { normalizeBmdc } from "@/lib/utils/bmdc";
import { isFoundingQualified } from "@/lib/utils/referral";

export interface ResolvedReferrer {
  doctorId: string;
  userId: string;
  slug: string;
  displayName: string;
}

interface ReferrerLean {
  _id: unknown;
  userId?: unknown;
  slug: string;
  name?: { displayName?: string };
}

/**
 * Resolve a referral code to its referrer. Accepts the referrer's profile
 * `slug` (the canonical link param) first, then falls back to a BMDC number so
 * a manually-typed code is forgiving. Returns null for anything that doesn't
 * resolve to a real, signed-up doctor (a referrer must have a bound `userId`).
 * Never throws — referral is a bonus, not a gate.
 */
export async function resolveReferrer(code: string): Promise<ResolvedReferrer | null> {
  const trimmed = (code ?? "").trim();
  if (!trimmed) return null;
  try {
    await dbConnect();
    let doc = (await (Doctor as unknown as Loose)
      .findOne({ slug: trimmed.toLowerCase() })
      .select("_id userId slug name.displayName")
      .lean()) as ReferrerLean | null;

    if (!doc) {
      const bmdc = normalizeBmdc(trimmed);
      if (bmdc) {
        doc = (await (Doctor as unknown as Loose)
          .findOne({ bmdcNumber: bmdc, isClaimed: true })
          .select("_id userId slug name.displayName")
          .lean()) as ReferrerLean | null;
      }
    }

    if (!doc || !doc.userId) return null;
    return {
      doctorId: String(doc._id),
      userId: String(doc.userId),
      slug: doc.slug,
      displayName: doc.name?.displayName ?? doc.slug,
    };
  } catch (err) {
    console.warn("[referral] resolveReferrer failed", err);
    return null;
  }
}

/**
 * Record a pending referral when a referred doctor registers/claims. Blocks
 * self-referral (by user and by doctor) and relies on the unique index on
 * `referredDoctorId` for first-touch dedup (duplicate-key is swallowed). Never
 * throws — a referral failure must not break registration.
 */
export async function recordReferral(args: {
  referrer: { doctorId: string; userId: string };
  referredDoctorId: string;
  referredUserId: string;
  via: "register" | "claim";
  source?: "link" | "manual";
}): Promise<void> {
  const { referrer, referredDoctorId, referredUserId, via, source } = args;
  if (
    String(referrer.userId) === String(referredUserId) ||
    String(referrer.doctorId) === String(referredDoctorId)
  ) {
    return; // no self-referral
  }
  try {
    await dbConnect();
    await (Referral as unknown as Loose).create({
      referrerDoctorId: referrer.doctorId,
      referrerUserId: referrer.userId,
      referredDoctorId,
      referredUserId,
      via,
      source: source ?? "link",
      status: "pending",
    });
  } catch (err) {
    // 11000 = duplicate key → this doctor was already referred (first-touch wins).
    if ((err as { code?: number })?.code !== 11000) {
      console.warn("[referral] recordReferral failed", err);
    }
  }
}

/**
 * On admin approval of a referred doctor: flip their pending referral to
 * `qualified`, recount the referrer's qualified referrals, and award the
 * Founding Doctor badge if the threshold is crossed. Idempotent — acts only on
 * a `pending` referral, so re-approval is a no-op. Permanent — never unsets an
 * already-awarded badge. Returns whether the badge was *newly* awarded plus the
 * referrer's slug so the caller can revalidate + audit. Never throws.
 */
export async function qualifyReferralAndRecompute(
  referredDoctorId: string,
): Promise<{ awarded: boolean; referrerSlug: string | null }> {
  try {
    await dbConnect();
    const referral = await (Referral as unknown as Loose).findOneAndUpdate(
      { referredDoctorId, status: "pending" },
      { $set: { status: "qualified", qualifiedAt: new Date() } },
      { returnDocument: "after" },
    );
    if (!referral) return { awarded: false, referrerSlug: null };

    const referrerDoctorId = referral.get("referrerDoctorId");
    const qualifiedCount = (await (Referral as unknown as Loose).countDocuments({
      referrerDoctorId,
      status: "qualified",
    })) as number;

    const referrer = await Doctor.findById(referrerDoctorId);
    if (!referrer) return { awarded: false, referrerSlug: null };

    const wasFounding = Boolean(referrer.get("foundingDoctor")?.isFounding);
    referrer.set("foundingDoctor.qualifiedReferrals", qualifiedCount);
    let awarded = false;
    if (!wasFounding && isFoundingQualified(qualifiedCount)) {
      referrer.set("foundingDoctor.isFounding", true);
      referrer.set("foundingDoctor.awardedAt", new Date());
      awarded = true;
    }
    await referrer.save();
    return { awarded, referrerSlug: (referrer.get("slug") as string) ?? null };
  } catch (err) {
    console.warn("[referral] qualifyReferralAndRecompute failed", err);
    return { awarded: false, referrerSlug: null };
  }
}
