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
import { sendSms } from "@/lib/sms/client";
import {
  loginRateLimiter,
  tokenRequestRateLimiter,
  smsOtpRequestLimiter,
  smsOtpVerifyLimiter,
} from "@/lib/redis/ratelimit";
import {
  RegisterSchema,
  LoginSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
} from "@/lib/validators/auth";
import { env, publicEnv } from "@/lib/env";
import {
  generateOtp,
  hashOtp,
  otpExpiresAt,
  OTP_TTL_MINUTES,
  OTP_MAX_ATTEMPTS,
} from "@/lib/utils/otp";

type ActionResult<T = void> = { ok: true; data?: T } | { ok: false, error: string };

async function clientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown"
  );
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
    documentS3Keys: form.getAll("documentS3Keys").map(String).filter(Boolean),
  };
  const parsed = RegisterSchema.safeParse(candidate);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { bmdcNumber, phone, firstName, lastName, email, claimSlug, documentS3Keys } = parsed.data;

  const normalizedPhone = normalizeBdPhone(phone);
  if (!normalizedPhone) {
    return { ok: false, error: "Enter a valid Bangladesh phone number (e.g. 01712345678)." };
  }
  const bmdc = normalizeBmdc(bmdcNumber);
  const normalizedEmail = email && email.length > 0 ? email.toLowerCase() : null;

  await dbConnect();

  // Phone uniqueness — block if another verified user already owns it.
  const phoneClash = await User.findOne({ phone: normalizedPhone, phoneVerified: true })
    .select("_id")
    .lean();
  if (phoneClash) {
    return {
      ok: false,
      error: "This phone number is already in use. Sign in instead, or contact support.",
    };
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

  // Generate OTP + persist regDraft on a phone-keyed user. We upsert so a
  // doctor who restarts the flow simply overwrites the previous draft.
  const code = generateOtp();
  const codeHash = hashOtp(code, env().AUTH_SECRET);
  const expiresAt = otpExpiresAt();
  const draftExpiresAt = new Date(Date.now() + REG_DRAFT_TTL_MIN * 60 * 1000);

  const setOnInsert: Record<string, unknown> = {
    email: normalizedEmail ?? `${normalizedPhone.replace(/[^\d]/g, "")}@phone.doctor.id.bd`,
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
          documentKeys: documentS3Keys ?? [],
          expiresAt: draftExpiresAt,
        },
      },
      $setOnInsert: setOnInsert,
    },
    { upsert: true, returnDocument: "after" },
  );

  const verifyUrl = `${publicEnv.NEXT_PUBLIC_APP_URL}/auth/register?phone=${encodeURIComponent(normalizedPhone)}&step=verify${claimSlug ? `&slug=${encodeURIComponent(claimSlug)}` : ""}`;
  const body = `doctor.id.bd: Your verification code is ${code}. Valid for ${OTP_TTL_MINUTES} minutes. ${verifyUrl}`;
  await sendSms({ to: normalizedPhone, body });

  return { ok: true };
}

/**
 * Send a login OTP to an existing phone-registered user.
 *
 * Returns `{ ok: true }` regardless of whether the phone matches a real
 * account, so attackers can't enumerate which phones are signed up.
 */
export async function requestLoginOtpAction(input: { phone: string }): Promise<ActionResult> {
  const phone = normalizeBdPhone(input?.phone);
  if (!phone) {
    return { ok: false, error: "Enter a valid Bangladesh phone number." };
  }

  const rl = await smsOtpRequestLimiter.limit(`phone:${phone}`);
  if (!rl.success) {
    return { ok: false, error: "Too many code requests. Try again in a few minutes." };
  }

  await dbConnect();
  const user = await User.findOne({ phone })
    .select("_id phoneVerified approved")
    .lean<{
      _id: unknown;
      phoneVerified: boolean;
      approved: boolean;
    } | null>();

  // Silent no-op for unknown / unverified-only phones — avoids enumeration.
  if (!user) return { ok: true };

  // Surface a clear "still waiting on admin" message for accounts that
  // exist but haven't been approved. This is a known-account path so the
  // enumeration risk doesn't apply: an attacker already knows the phone
  // belongs to a (pending) account.
  if (user.approved === false) {
    return {
      ok: false,
      error:
        "Your account is pending admin approval. We'll text you once it's ready (usually within 24 hours).",
    };
  }

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

  const body = `doctor.id.bd: Your sign-in code is ${code}. Valid for ${OTP_TTL_MINUTES} minutes.`;
  await sendSms({ to: phone, body });
  return { ok: true };
}

/**
 * Step 2 of registration: verify the SMS OTP and materialize the Doctor +
 * ClaimRequest. **Does not sign the user in** — admin approval is required
 * before the doctor can log in. The form shows a "pending approval" landing
 * after this returns ok.
 */
export async function completeRegistrationAction(input: {
  phone: string;
  otp: string;
}): Promise<ActionResult<{ status: "pending_approval" }>> {
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
        documentKeys?: string[];
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

  // Successful materialization: clear OTP + regDraft, mark phone verified,
  // flag the account `approved: false` (admin must approve before login),
  // and stamp the free-EMR intent so the admin queue surfaces it.
  await User.updateOne(
    { _id: user._id as never },
    {
      $set: {
        phoneVerified: true,
        approved: false,
        smsOtpHash: null,
        smsOtpExpiresAt: null,
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

  return { ok: true, data: { status: "pending_approval" } };
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
    documentKeys?: string[];
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
  const docs = draft.documentKeys ?? [];

  if (claimSlug) {
    const claimed = await Doctor.findOneAndUpdate(
      { slug: claimSlug, isClaimed: false },
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
    if (!claimed) {
      throw new Error("This profile has just been claimed by someone else.");
    }
    await (ClaimRequest as unknown as { create: Function }).create({
      doctorId: claimed._id,
      requestedBy: userId,
      bmdcNumberProvided: bmdc,
      documentsUploaded: docs,
      notesFromDoctor:
        docs.length > 0
          ? "Claimed via public profile link. Verification documents attached."
          : "Claimed via public profile link.",
      status: "pending",
    });
  } else {
    let slug = generateSlug({ displayName });
    for (let i = 0; i < 5; i++) {
      const clash = await Doctor.findOne({ slug }).select("_id").lean();
      if (!clash) break;
      slug = generateSlug({
        displayName,
        disambiguator: (bmdc ?? "").slice(-4) + (i || ""),
      });
    }
    const doctor = await Doctor.create({
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
    await (ClaimRequest as unknown as { create: Function }).create({
      doctorId: doctor._id,
      requestedBy: userId,
      bmdcNumberProvided: bmdc,
      documentsUploaded: docs,
      notesFromDoctor:
        docs.length > 0 ? "Verification documents attached at registration." : null,
      status: "pending",
    });
  }

  // Swap a synthetic phone@phone.doctor.id.bd placeholder for the real
  // email the doctor supplied, if any.
  if (draft.email && existingEmail.endsWith("@phone.doctor.id.bd")) {
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
  await sendEmail({ to: user.email, ...tpl }).catch((err) => {
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
