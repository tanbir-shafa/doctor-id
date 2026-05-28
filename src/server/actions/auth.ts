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
import { User, Doctor } from "@/lib/db/models";
import { sendEmail } from "@/lib/email/ses";
import { verifyEmailTemplate, resetPasswordTemplate } from "@/lib/email/templates";
import { generateSlug } from "@/lib/utils/slug";
import { normalizeBmdc } from "@/lib/utils/bmdc";
import { loginRateLimiter, tokenRequestRateLimiter } from "@/lib/redis/ratelimit";
import {
  RegisterSchema,
  LoginSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
} from "@/lib/validators/auth";
import { adminEmails } from "@/lib/env";

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

// --- Register ---

export async function registerAction(form: FormData): Promise<ActionResult<{ email: string }>> {
  const raw = Object.fromEntries(form.entries());
  // `agreeTerms` arrives as the literal string "on" from an unchecked checkbox HTML POST;
  // normalize to boolean for the Zod literal(true).
  const candidate = { ...raw, agreeTerms: raw.agreeTerms === "on" || raw.agreeTerms === "true" };
  const parsed = RegisterSchema.safeParse(candidate);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { email, password, firstName, lastName, bmdcNumber } = parsed.data;

  await dbConnect();

  // Reject if email already exists.
  const existing = await User.findOne({ email: email.toLowerCase() }).select("_id").lean();
  if (existing) return { ok: false, error: "An account with this email already exists." };

  // Reject if BMDC number already claimed.
  const bmdc = normalizeBmdc(bmdcNumber);
  const bmdcClash = await Doctor.findOne({ bmdcNumber: bmdc, isClaimed: true })
    .select("_id")
    .lean();
  if (bmdcClash) {
    return {
      ok: false,
      error: "This BMDC number is already claimed. If this is yours, contact support.",
    };
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const role = adminEmails().includes(email.toLowerCase()) ? "admin" : "doctor";

  // Email-verification token (raw mailed to user; hash stored in DB).
  const rawToken = crypto.randomBytes(32).toString("hex");
  const verifyTokenHash = sha256(rawToken);
  const verifyTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const user = await User.create({
    email: email.toLowerCase(),
    passwordHash,
    role,
    verifyTokenHash,
    verifyTokenExpiresAt,
  });

  // Find or create a Doctor profile. If there's already an unclaimed profile
  // with this BMDC, attach to it. Otherwise mint a new draft.
  const displayName = `${firstName} ${lastName}`;
  let doctor = await Doctor.findOne({ bmdcNumber: bmdc, isClaimed: false });
  if (doctor) {
    await Doctor.updateOne(
      { _id: doctor._id },
      {
        $set: {
          userId: user._id,
          ownerId: user._id,
          isClaimed: true,
          claimedAt: new Date(),
        },
      },
    );
  } else {
    // New slug, retry on collision via disambiguator.
    let slug = generateSlug({ displayName });
    for (let i = 0; i < 5; i++) {
      const clash = await Doctor.findOne({ slug }).select("_id").lean();
      if (!clash) break;
      slug = generateSlug({ displayName, disambiguator: bmdc.slice(-4) + (i || "") });
    }
    doctor = await Doctor.create({
      ownerType: "doctor",
      ownerId: user._id,
      userId: user._id,
      slug,
      bmdcNumber: bmdc,
      name: { prefix: "Dr.", first: firstName, last: lastName, displayName },
      registrations: [{ council: "BMDC", number: bmdc }],
      isClaimed: true,
      claimedAt: new Date(),
      status: "draft",
    });
  }

  // Email the verification link. The action returns immediately if SES is
  // not configured (dev) — the link is logged to the console instead.
  const tpl = verifyEmailTemplate({ name: firstName, token: rawToken, email: email.toLowerCase() });
  await sendEmail({ to: email.toLowerCase(), ...tpl }).catch((err) => {
    console.error("Failed to send verification email:", err);
  });

  return { ok: true, data: { email: email.toLowerCase() } };
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
