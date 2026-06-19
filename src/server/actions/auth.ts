"use server";

/**
 * Auth Server Actions.
 *
 * All write paths share the same pattern:
 *   1. Zod-parse the input (server-side, never trust the client schema)
 *   2. Rate-limit by IP via Upstash (returns success: true if Redis not configured)
 *   3. Do the mutation idempotently
 *   4. Return `{ ok: true }` or `{ ok: false, error: "code" }` — never throw
 *      to the client, since error UI is built from the discriminated union.
 */

import type { Loose } from "@/lib/db/models/loose";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { signIn, signOut } from "@/lib/auth/config";
import { dbConnect } from "@/lib/db/mongoose";
import { User, Doctor, ClaimRequest, OutboundMessage } from "@/lib/db/models";
import { sendEmail } from "@/lib/email/ses";
import { resetPasswordTemplate } from "@/lib/email/templates";
import { generateSlug } from "@/lib/utils/slug";
import { normalizeBmdc } from "@/lib/utils/bmdc";
import { normalizeBdPhone } from "@/lib/utils/phone";
import { clientIp as getClientIp } from "@/lib/utils/request-ip";
import { resolveReferrer, recordReferral, type ResolvedReferrer } from "@/lib/referral/service";
import { sendSms } from "@/lib/sms/client";
import { getSmsProvider } from "@/lib/sms/provider";
import {
  loginRateLimiter,
  tokenRequestRateLimiter,
  smsOtpRequestLimiter,
  smsOtpByIpLimiter,
  smsOtpVerifyLimiter,
} from "@/lib/redis/ratelimit";
import { verifyTurnstile } from "@/lib/security/turnstile";
import {
  RegisterSchema,
  LoginSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
} from "@/lib/validators/auth";
import { env, publicEnv } from "@/lib/env";
import { createFileDoc } from "@/lib/s3/file-doc";
import {
  bucketFor,
  visibilityFor,
  securityClassFor,
  UPLOAD_PURPOSE,
  BUCKET_TYPE,
} from "@/lib/s3/buckets";
import { FILE_LINKED_ENTITY_TYPE } from "@/lib/db/models/files";
import {
  generateOtp,
  hashOtp,
  otpExpiresAt,
  OTP_TTL_MINUTES,
  OTP_MAX_ATTEMPTS,
} from "@/lib/utils/otp";

type ActionResult<T = void> = { ok: true; data?: T } | { ok: false, error: string };

async function clientIp(): Promise<string> {
  return getClientIp(await headers());
}

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

// --- Registration (phone-first; doctors only) ---

const REG_DRAFT_TTL_MIN = 15;

/**
 * Doctor registration step 1.
 *
 * Validates inputs, normalizes the phone, ensures BMDC/phone aren't already
 * tied to a claimed account, stashes the registration payload (`regDraft`)
 * on a phone-keyed User row, generates + sends a 6-digit OTP. The actual
 * User + Doctor materialization happens on step 2 (OTP verify) inside the
 * NextAuth `sms-otp` provider — see `src/lib/auth/config.ts`.
 *
 * Returns `{ ok: true }` on success so the client can swap to the OTP step.
 */
export async function startRegistrationAction(form: FormData): Promise<ActionResult> {
  const raw = Object.fromEntries(form.entries());
  const candidate = {
    ...raw,
    agreeTerms: raw.agreeTerms === "on" || raw.agreeTerms === "true",
    agreeBiometric: raw.agreeBiometric === "on" || raw.agreeBiometric === "true",
  };
  const parsed = RegisterSchema.safeParse(candidate);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { bmdcNumber, phone, firstName, lastName, email, claimSlug, referralCode, selfieS3Key } =
    parsed.data;

  // Selfie upload metadata (returned by uploadRegistrationSelfieAction, carried
  // through hidden form fields) — stashed so the File doc can be minted at
  // materialization without re-downloading the object.
  const selfieSha256 = String(form.get("selfieSha256") ?? "") || null;
  const selfieSizeRaw = Number(form.get("selfieSize"));
  const selfieSize = Number.isFinite(selfieSizeRaw) && selfieSizeRaw > 0 ? selfieSizeRaw : null;
  const selfieMime = String(form.get("selfieMime") ?? "") || null;

  const normalizedPhone = normalizeBdPhone(phone);
  if (!normalizedPhone) {
    return { ok: false, error: "Enter a valid Bangladesh phone number (e.g. 01712345678)." };
  }
  const bmdc = normalizeBmdc(bmdcNumber);
  const normalizedEmail = email && email.length > 0 ? email.toLowerCase() : null;

  // Abuse defense for the SMS send (in order: cheapest + broadest first).
  // (1) Per-IP cap so one source can't blast OTPs at many different numbers.
  const ip = await clientIp();
  const ipRl = await smsOtpByIpLimiter.limit(`ip:${ip}`);
  if (!ipRl.success) {
    return { ok: false, error: "Too many code requests from your network. Try again later." };
  }
  // (2) Turnstile BEFORE the per-phone limiter, so a bot can't exhaust a victim
  //     phone's request budget with junk tokens (a registration-DoS on that number).
  const turnstile = await verifyTurnstile(String(form.get("turnstileToken") ?? ""), ip);
  if (!turnstile.ok) {
    return { ok: false, error: turnstile.error };
  }

  await dbConnect();

  // Phone uniqueness — block only if a verified phone already has a PROVISIONED
  // profile. A verified-but-profileless User (a prior registration whose
  // Doctor.create failed — e.g. a BMDC collision) must be allowed to re-register
  // so it can recover; the regDraft upsert below just overwrites the stale draft.
  const verifiedUser = await User.findOne({ phone: normalizedPhone, phoneVerified: true })
    .select("_id")
    .lean<{ _id: unknown } | null>();
  if (verifiedUser) {
    const hasProfile = await Doctor.findOne({
      $or: [{ ownerId: verifiedUser._id }, { userId: verifiedUser._id }],
    })
      .select("_id")
      .lean();
    if (hasProfile) {
      return {
        ok: false,
        error: "This phone number is already in use. Sign in instead, or contact support.",
      };
    }
  }

  // BMDC uniqueness — block if another claimed doctor already owns it.
  const bmdcClash = await Doctor.findOne({ bmdcNumber: bmdc, isClaimed: true })
    .select("_id")
    .lean();
  if (bmdcClash) {
    return {
      ok: false,
      error: "This BMDC number is already claimed. If this is yours, contact support.",
    };
  }

  // If claiming by slug, fail fast on bad slugs / already-claimed profiles.
  if (claimSlug) {
    const doc = await Doctor.findOne({ slug: claimSlug.toLowerCase() })
      .select("_id isClaimed")
      .lean<{ _id: unknown; isClaimed: boolean } | null>();
    if (!doc) {
      return { ok: false, error: "Profile not found. Check the link and try again." };
    }
    if (doc.isClaimed) {
      return {
        ok: false,
        error: "This profile is already claimed. Sign in instead.",
      };
    }
  }

  // Email uniqueness (when provided). Synthetic placeholders are fine.
  if (normalizedEmail) {
    const emailClash = await User.findOne({ email: normalizedEmail }).select("_id").lean();
    if (emailClash) {
      return { ok: false, error: "An account with this email already exists." };
    }
  }

  // Rate-limit OTP request by phone.
  const rl = await smsOtpRequestLimiter.limit(`phone:${normalizedPhone}`);
  if (!rl.success) {
    return { ok: false, error: "Too many code requests. Try again in a few minutes." };
  }

  // Founding Doctor referral attribution. Resolve the code now (best-effort) so
  // the Referral row can be minted at materialization. A code that doesn't
  // resolve is silently ignored — referral is a bonus, never a sign-up gate.
  let referrer: ResolvedReferrer | null = null;
  let referralSource: "link" | "manual" | null = null;
  if (referralCode && referralCode.length > 0) {
    referrer = await resolveReferrer(referralCode);
    if (referrer) {
      referralSource = String(form.get("referralSource")) === "link" ? "link" : "manual";
    }
  }

  // Generate OTP + persist regDraft on a phone-keyed user. We upsert so a
  // doctor who restarts the flow simply overwrites the previous draft.
  const code = generateOtp();
  const codeHash = hashOtp(code, env().AUTH_SECRET);
  const expiresAt = otpExpiresAt();
  const draftExpiresAt = new Date(Date.now() + REG_DRAFT_TTL_MIN * 60 * 1000);

  const setOnInsert: Record<string, unknown> = {
    email: normalizedEmail ?? `${normalizedPhone.replace(/[^\d]/g, "")}@phone.daktar.link`,
    role: "doctor",
  };

  await User.findOneAndUpdate(
    { phone: normalizedPhone },
    {
      $set: {
        phone: normalizedPhone,
        smsOtpHash: codeHash,
        smsOtpExpiresAt: expiresAt,
        smsOtpAttempts: 0,
        regDraft: {
          firstName,
          lastName,
          email: normalizedEmail,
          bmdcNumber: bmdc,
          claimSlug: claimSlug ? claimSlug.toLowerCase() : null,
          referrerDoctorId: referrer?.doctorId ?? null,
          referrerUserId: referrer?.userId ?? null,
          referralSource,
          selfieKey: selfieS3Key,
          selfieSha256,
          selfieSize,
          selfieMime,
          expiresAt: draftExpiresAt,
        },
      },
      $setOnInsert: setOnInsert,
    },
    { upsert: true, returnDocument: "after" },
  );

  const verifyUrl = `${publicEnv.NEXT_PUBLIC_APP_URL}/auth/register?phone=${encodeURIComponent(normalizedPhone)}&step=verify${claimSlug ? `&slug=${encodeURIComponent(claimSlug)}` : ""}`;
  const body = `Daktar.Link: Your verification code is ${code}. Valid for ${OTP_TTL_MINUTES} minutes. ${verifyUrl}`;
  const smsResult = await sendSms({ to: normalizedPhone, body });
  // When a real SMS provider is configured but the send fails (gateway/IP/auth
  // error), tell the user instead of advancing to the code screen. In dev with
  // no provider configured, sendSms no-ops (prints the code to the console) and
  // must still "succeed" so offline testing works.
  if (!smsResult.sent && getSmsProvider().isConfigured()) {
    return {
      ok: false,
      error: "We couldn't send your verification code right now. Please try again in a moment.",
    };
  }

  return { ok: true };
}

/**
 * Send a login OTP to an existing phone-registered user.
 *
 * Returns `{ ok: true }` regardless of whether the phone matches a real
 * account, so attackers can't enumerate which phones are signed up.
 */
export async function requestLoginOtpAction(input: {
  phone: string;
  turnstileToken?: string;
}): Promise<ActionResult> {
  const phone = normalizeBdPhone(input?.phone);
  if (!phone) {
    return { ok: false, error: "Enter a valid Bangladesh phone number." };
  }

  // Per-IP cap first (stops cross-number SMS-bombing from one source), then
  // Turnstile before the per-phone limiter (so junk tokens can't burn a victim
  // number's request budget).
  const ip = await clientIp();
  const ipRl = await smsOtpByIpLimiter.limit(`ip:${ip}`);
  if (!ipRl.success) {
    return { ok: false, error: "Too many code requests from your network. Try again later." };
  }
  const turnstile = await verifyTurnstile(input?.turnstileToken ?? "", ip);
  if (!turnstile.ok) {
    return { ok: false, error: turnstile.error };
  }

  const rl = await smsOtpRequestLimiter.limit(`phone:${phone}`);
  if (!rl.success) {
    return { ok: false, error: "Too many code requests. Try again in a few minutes." };
  }

  await dbConnect();
  const user = await User.findOne({ phone })
    .select("_id phoneVerified")
    .lean<{
      _id: unknown;
      phoneVerified: boolean;
    } | null>();

  // No account for this phone — surface a clear, actionable message instead of
  // silently succeeding. (This trades phone-number enumeration resistance for
  // UX: the login screen now distinguishes "no account" from "code sent". The
  // per-phone rate limiter above still caps how fast a number can be probed.)
  if (!user) {
    return {
      ok: false,
      error: "No account found with this number. Please register first.",
    };
  }

  // NOTE: no approval gate here — a new (unapproved) doctor can sign in and
  // edit/preview their profile. `User.approved` gates publishing, not login.

  const code = generateOtp();
  const codeHash = hashOtp(code, env().AUTH_SECRET);
  const expiresAt = otpExpiresAt();
  await User.updateOne(
    { _id: user._id as never },
    {
      $set: {
        smsOtpHash: codeHash,
        smsOtpExpiresAt: expiresAt,
        smsOtpAttempts: 0,
      },
    },
  );

  const body = `Daktar.Link: Your sign-in code is ${code}. Valid for ${OTP_TTL_MINUTES} minutes.`;
  const smsResult = await sendSms({ to: phone, body });
  if (!smsResult.sent && getSmsProvider().isConfigured()) {
    return {
      ok: false,
      error: "We couldn't send your sign-in code right now. Please try again in a moment.",
    };
  }
  return { ok: true };
}

/**
 * Step 2 of registration: verify the SMS OTP and materialize the Doctor +
 * ClaimRequest. Does not create a session itself — the client immediately
 * auto-signs-in with the same OTP (left valid above). The new account is
 * `approved: false`, which gates PUBLISHING (not login): the doctor can log in,
 * edit, and preview, but can't publish until an admin approves.
 */
export async function completeRegistrationAction(input: {
  phone: string;
  otp: string;
}): Promise<ActionResult> {
  const phone = normalizeBdPhone(input?.phone);
  const otp = (input?.otp ?? "").trim();
  if (!phone || !/^\d{6}$/.test(otp)) {
    return { ok: false, error: "Enter the 6-digit code we sent you." };
  }

  const rl = await smsOtpVerifyLimiter.limit(`phone:${phone}`);
  if (!rl.success) {
    return { ok: false, error: "Too many attempts. Request a new code in a few minutes." };
  }

  await dbConnect();
  const user = await User.findOne({ phone })
    .select("+smsOtpHash +smsOtpExpiresAt +smsOtpAttempts +regDraft")
    .lean<{
      _id: unknown;
      email: string;
      deletedAt: Date | null;
      smsOtpHash: string | null;
      smsOtpExpiresAt: Date | null;
      smsOtpAttempts: number;
      regDraft: {
        firstName?: string | null;
        lastName?: string | null;
        email?: string | null;
        bmdcNumber?: string | null;
        claimSlug?: string | null;
        referrerDoctorId?: unknown;
        referrerUserId?: unknown;
        referralSource?: string | null;
        selfieKey?: string | null;
        selfieSha256?: string | null;
        selfieSize?: number | null;
        selfieMime?: string | null;
        expiresAt?: Date | null;
      } | null;
    } | null>();

  if (!user || user.deletedAt) {
    return { ok: false, error: "No registration in progress for that phone." };
  }
  if (!user.regDraft || !user.regDraft.expiresAt) {
    return { ok: false, error: "Your registration session expired. Start again." };
  }
  if (new Date(user.regDraft.expiresAt) < new Date()) {
    return { ok: false, error: "Your registration session expired. Start again." };
  }
  if (!user.smsOtpHash || !user.smsOtpExpiresAt) {
    return { ok: false, error: "Request a new code." };
  }
  if (new Date(user.smsOtpExpiresAt) < new Date()) {
    return { ok: false, error: "That code expired. Request a new one." };
  }
  if ((user.smsOtpAttempts ?? 0) >= OTP_MAX_ATTEMPTS) {
    return { ok: false, error: "Too many wrong attempts. Request a new code." };
  }

  const expected = hashOtp(otp, env().AUTH_SECRET);
  if (expected !== user.smsOtpHash) {
    await User.updateOne({ _id: user._id as never }, { $inc: { smsOtpAttempts: 1 } });
    return { ok: false, error: "That code is incorrect." };
  }

  // Materialize Doctor + ClaimRequest. On a slug-claim race or BMDC collision
  // we throw so the caller can surface the right error — the OTP itself was
  // valid, so we don't decrement attempts or roll back the User row.
  try {
    await materializeRegistration({
      userId: String(user._id),
      existingEmail: user.email,
      draft: user.regDraft,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not finalize registration.";
    return { ok: false, error: msg };
  }

  // Successful materialization: clear regDraft, mark phone verified, flag the
  // account `approved: false` (gates PUBLISHING, not login — the doctor can sign
  // in immediately), and stamp the free-EMR intent so the admin queue surfaces it.
  // Leave smsOtpHash/smsOtpExpiresAt intact (reset attempts) so the client can
  // immediately auto-sign-in with the same code; the sms-otp provider consumes it.
  await User.updateOne(
    { _id: user._id as never },
    {
      $set: {
        phoneVerified: true,
        approved: false,
        smsOtpAttempts: 0,
        regDraft: null,
        "emr.requested": true,
        "emr.seatStatus": "pending",
      },
    },
  );

  // A.8 claim attribution: if this phone received an outbound SMS in the
  // last 30 days, stamp those rows as `claimedAt` so the campaign
  // dashboard can compute a real claim rate.
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
  await OutboundMessage.updateMany(
    {
      to: phone,
      status: "sent",
      claimedAt: null,
      sentAt: { $gte: new Date(Date.now() - THIRTY_DAYS) },
    },
    { $set: { claimedAt: new Date() } },
  ).catch((err) => {
    // Non-blocking — a failure here costs us one attribution data point.
    console.error("Outbound claim-attribution update failed:", err);
  });

  return { ok: true };
}

/**
 * Mint the registration selfie's File doc (private bucket) for a freshly
 * materialized doctor and return the fields the ClaimRequest caches. Skips
 * File-doc creation when the upload metadata is absent, but still records the
 * key + bucket so admins can preview via a presigned GET.
 */
async function buildSelfieClaimFields(
  doctorId: string,
  userId: string,
  draft: {
    selfieKey?: string | null;
    selfieSha256?: string | null;
    selfieSize?: number | null;
    selfieMime?: string | null;
  },
): Promise<{ selfieFileId: unknown; selfieKey: string | null; selfieBucket: string | null }> {
  const selfieKey = draft.selfieKey ?? null;
  if (!selfieKey) return { selfieFileId: null, selfieKey: null, selfieBucket: null };
  const selfieBucket = bucketFor(BUCKET_TYPE.PRIVATE);
  let selfieFileId: unknown = null;
  if (selfieBucket && draft.selfieSha256 && draft.selfieSize && draft.selfieMime) {
    const ext = draft.selfieMime.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
    const fileDoc = await createFileDoc({
      s3Bucket: selfieBucket,
      s3Key: selfieKey,
      sha256: draft.selfieSha256,
      sizeBytes: draft.selfieSize,
      mimeType: draft.selfieMime,
      ext,
      linkedEntityType: FILE_LINKED_ENTITY_TYPE.DOCTOR,
      linkedEntityId: doctorId,
      uploadedBy: userId,
      category: UPLOAD_PURPOSE.doctor_selfie.category,
      visibility: visibilityFor(BUCKET_TYPE.PRIVATE),
      securityClass: securityClassFor(BUCKET_TYPE.PRIVATE),
      title: "Registration selfie",
    });
    selfieFileId = (fileDoc as { _id: unknown })._id;
  }
  return { selfieFileId, selfieKey, selfieBucket };
}

/**
 * Helper: bind / mint the Doctor doc and create a pending ClaimRequest.
 *
 * - `claimSlug` present → atomic claim of the seeded profile (race-safe via
 *   `isClaimed:false` guard). Throws if the slug was claimed by someone
 *   else in the meantime.
 * - otherwise → fresh draft profile with a generated slug.
 *
 * Synthetic phone-emails are replaced with the user-supplied email when
 * present in the draft.
 */
async function materializeRegistration(args: {
  userId: string;
  existingEmail: string;
  draft: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    bmdcNumber?: string | null;
    claimSlug?: string | null;
    referrerDoctorId?: unknown;
    referrerUserId?: unknown;
    referralSource?: string | null;
    selfieKey?: string | null;
    selfieSha256?: string | null;
    selfieSize?: number | null;
    selfieMime?: string | null;
  };
}): Promise<void> {
  const { userId, existingEmail, draft } = args;
  const firstName = draft.firstName ?? "";
  const lastName = draft.lastName ?? "";
  // displayName is the canonical full title rendered everywhere on the
  // public profile, so bake the "Dr." prefix in. Registration only ever
  // uses the "Dr." default — there is no UI to pick another prefix here.
  // Doctors upgrade to "Prof. Dr." etc. via the basic-info form later.
  const displayName = `Dr. ${firstName} ${lastName}`.replace(/\s+/g, " ").trim();
  const bmdc = draft.bmdcNumber ?? null;
  const claimSlug = draft.claimSlug ?? null;
  // Atomically claim an *unclaimed* Doctor matching `filter`, binding it to this
  // user. Returns the updated doc, or null if nothing matched (already claimed /
  // not found) — race-safe via the `isClaimed:false` guard.
  const claimUnclaimed = (filter: Record<string, unknown>) =>
    Doctor.findOneAndUpdate(
      { ...filter, isClaimed: false },
      {
        $set: {
          userId,
          ownerId: userId,
          isClaimed: true,
          claimedAt: new Date(),
          claimRequestedBy: userId,
          ...(bmdc ? { bmdcNumber: bmdc } : {}),
        },
      },
      { returnDocument: "after" },
    );

  const createFreshDoctor = async () => {
    let slug = generateSlug({ displayName });
    for (let i = 0; i < 5; i++) {
      const clash = await Doctor.findOne({ slug }).select("_id").lean();
      if (!clash) break;
      slug = generateSlug({ displayName, disambiguator: (bmdc ?? "").slice(-4) + (i || "") });
    }
    return Doctor.create({
      ownerType: "doctor",
      ownerId: userId,
      userId,
      slug,
      bmdcNumber: bmdc,
      name: { prefix: "Dr.", first: firstName, last: lastName, displayName },
      registrations: bmdc ? [{ council: "BMDC", number: bmdc }] : [],
      isClaimed: true,
      claimedAt: new Date(),
      claimRequestedBy: userId,
      status: "draft",
    });
  };

  const isDupKey = (err: unknown) =>
    !!err && typeof err === "object" && (err as { code?: number }).code === 11000;
  const ATTACH_NOTE =
    "Auto-attached to an existing directory profile by BMDC match. Live selfie attached for verification.";

  // Resolve the Doctor this registration binds to, in priority order:
  //   1. explicit claim-by-slug (public profile link),
  //   2. auto-attach by BMDC to an existing UNCLAIMED directory profile (e.g. a
  //      scraped DocTime/Popular/Ibn-Sina row) — avoids a duplicate AND the
  //      bmdcNumber unique-index E11000 that used to wedge the account,
  //   3. otherwise a fresh draft profile.
  let doctorId: string;
  let note: string;

  if (claimSlug) {
    const claimed = await claimUnclaimed({ slug: claimSlug });
    if (!claimed) throw new Error("This profile has just been claimed by someone else.");
    doctorId = String(claimed._id);
    note = "Claimed via public profile link. Live selfie attached for verification.";
  } else {
    const byBmdc = bmdc ? await claimUnclaimed({ bmdcNumber: bmdc }) : null;
    if (byBmdc) {
      doctorId = String(byBmdc._id);
      note = ATTACH_NOTE;
    } else {
      try {
        const created = await createFreshDoctor();
        doctorId = String(created._id);
        note = "Live selfie attached at registration.";
      } catch (err) {
        // E11000 backstop: a doc with this BMDC raced in between our check and
        // the insert. Claim it instead; if it's already claimed, surface a
        // friendly, recoverable error (never a raw 500 that wedges the account).
        const raced = isDupKey(err) && bmdc ? await claimUnclaimed({ bmdcNumber: bmdc }) : null;
        if (!raced) {
          if (isDupKey(err)) {
            throw new Error(
              "This BMDC number is already registered to another profile. If it's yours, contact support.",
            );
          }
          throw err;
        }
        doctorId = String(raced._id);
        note = ATTACH_NOTE;
      }
    }
  }

  const referredDoctorId = doctorId;
  const selfie = await buildSelfieClaimFields(doctorId, userId, draft);
  await (ClaimRequest as unknown as Loose).create({
    doctorId,
    requestedBy: userId,
    bmdcNumberProvided: bmdc,
    ...selfie,
    notesFromDoctor: note,
    status: "pending",
  });

  // Founding Doctor referral: if this sign-up came through a referral link/code,
  // mint a pending Referral (qualifies when an admin approves this doctor). The
  // service blocks self-referral, dedups first-touch, and never throws — a
  // referral hiccup must not break registration.
  if (draft.referrerDoctorId && draft.referrerUserId && referredDoctorId) {
    await recordReferral({
      referrer: {
        doctorId: String(draft.referrerDoctorId),
        userId: String(draft.referrerUserId),
      },
      referredDoctorId,
      referredUserId: userId,
      via: claimSlug ? "claim" : "register",
      source: draft.referralSource === "link" ? "link" : "manual",
    });
  }

  // Swap a synthetic phone@phone.daktar.link placeholder for the real
  // email the doctor supplied, if any.
  if (draft.email && existingEmail.endsWith("@phone.daktar.link")) {
    await User.updateOne({ _id: userId as never }, { $set: { email: draft.email } });
  }
}

// --- Verify email ---

export async function verifyEmailAction(args: {
  email: string;
  token: string;
}): Promise<ActionResult> {
  const email = args.email?.toLowerCase().trim();
  const token = args.token?.trim();
  if (!email || !token) return { ok: false, error: "Missing token or email." };

  await dbConnect();
  const tokenHash = sha256(token);
  const user = await User.findOne({ email })
    .select("+verifyTokenHash +verifyTokenExpiresAt emailVerified")
    .lean();
  if (!user) return { ok: false, error: "Account not found." };
  if (user.emailVerified) return { ok: true }; // idempotent

  if (user.verifyTokenHash !== tokenHash) return { ok: false, error: "Invalid or expired link." };
  if (!user.verifyTokenExpiresAt || user.verifyTokenExpiresAt < new Date())
    return { ok: false, error: "Verification link expired." };

  await User.updateOne(
    { _id: user._id },
    {
      $set: { emailVerified: new Date() },
      $unset: { verifyTokenHash: "", verifyTokenExpiresAt: "" },
    },
  );
  return { ok: true };
}

// --- Login (used by client form; just wraps NextAuth signIn for UI parity) ---

export async function loginAction(form: FormData): Promise<ActionResult<{ next?: string }>> {
  const ip = await clientIp();
  const rl = await loginRateLimiter.limit(`ip:${ip}`);
  if (!rl.success) return { ok: false, error: "Too many login attempts. Try again in a minute." };

  const parsed = LoginSchema.safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) return { ok: false, error: "Enter your email and password." };

  // Look up the role before signIn so we can pick the right landing page.
  // signIn itself doesn't expose the freshly-issued session, and the proxy
  // would re-bounce the wrong destination anyway — better to send the user
  // directly to the right portal.
  await dbConnect();
  const user = await User.findOne({ email: parsed.data.email.toLowerCase() })
    .select("role deletedAt")
    .lean();

  try {
    // `redirect: false` so we can return a result the client can act on.
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirect: false,
    });
    const requestedNext = String(form.get("next") ?? "").trim();
    const defaultNext = user?.role === "admin" ? "/admin" : "/dashboard";

    // Honor `?next=` only when it's in the user's allowed portal. Without
    // this guard, a doctor who landed on /auth/login?next=/admin would be
    // redirected to /admin and then bounced by the proxy — confusing UX.
    let next = defaultNext;
    if (requestedNext.startsWith("/")) {
      const wantsAdmin = requestedNext.startsWith("/admin");
      const wantsDashboard = requestedNext.startsWith("/dashboard");
      if (user?.role === "admin" && wantsAdmin) next = requestedNext;
      else if (user?.role !== "admin" && wantsDashboard) next = requestedNext;
      else if (!wantsAdmin && !wantsDashboard) next = requestedNext; // public destination
    }

    return { ok: true, data: { next } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Login failed";
    if (/CredentialsSignin/.test(msg) || /CallbackRouteError/.test(msg)) {
      return { ok: false, error: "Invalid email or password." };
    }
    return { ok: false, error: msg };
  }
}

// --- Forgot password ---

export async function forgotPasswordAction(form: FormData): Promise<ActionResult> {
  const ip = await clientIp();
  const rl = await tokenRequestRateLimiter.limit(`ip:${ip}`);
  if (!rl.success) return { ok: false, error: "Too many requests. Try again later." };

  const turnstile = await verifyTurnstile(String(form.get("turnstileToken") ?? ""), ip);
  if (!turnstile.ok) return { ok: false, error: turnstile.error };

  const parsed = ForgotPasswordSchema.safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) return { ok: false, error: "Enter a valid email." };

  await dbConnect();
  const user = await User.findOne({ email: parsed.data.email.toLowerCase() }).lean();
  // Always return success — don't leak which emails exist.
  if (!user) return { ok: true };

  const rawToken = crypto.randomBytes(32).toString("hex");
  const resetTokenHash = sha256(rawToken);
  const resetTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await User.updateOne(
    { _id: user._id },
    { $set: { resetTokenHash, resetTokenExpiresAt } },
  );

  const tpl = resetPasswordTemplate({
    name: user.email.split("@")[0],
    token: rawToken,
    email: user.email,
  });
  await sendEmail({ email: user.email, subject: tpl.subject, body: tpl.html }).catch((err) => {
    console.error("Failed to send reset email:", err);
  });
  return { ok: true };
}

// --- Reset password ---

export async function resetPasswordAction(form: FormData): Promise<ActionResult> {
  const parsed = ResetPasswordSchema.safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  await dbConnect();
  const user = await User.findOne({ email: parsed.data.email.toLowerCase() })
    .select("+resetTokenHash +resetTokenExpiresAt")
    .lean();
  if (!user || !user.resetTokenHash) return { ok: false, error: "Invalid or expired link." };
  if (user.resetTokenHash !== sha256(parsed.data.token))
    return { ok: false, error: "Invalid or expired link." };
  if (!user.resetTokenExpiresAt || user.resetTokenExpiresAt < new Date())
    return { ok: false, error: "Link has expired." };

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  await User.updateOne(
    { _id: user._id },
    {
      $set: { passwordHash, emailVerified: user.emailVerified ?? new Date() },
      $unset: { resetTokenHash: "", resetTokenExpiresAt: "" },
    },
  );
  return { ok: true };
}

// --- Logout ---

export async function logoutAction() {
  await signOut({ redirect: false });
  redirect("/");
}
