/**
 * Doctor account notifications — approval / rejection of BMDC and identity
 * (account) verification.
 *
 * Channel strategy (see CLAUDE.md #20 + the notifications plan):
 *   - SMS ALWAYS goes to `User.phone` — the OTP-verified account number. It's
 *     present for every self-registered doctor and is the reliable channel.
 *   - Email goes to `User.email` ONLY when it's verified (`emailVerified` set)
 *     and is not the synthetic `@phone.daktar.link` placeholder. We never mail
 *     an unverified address (typo → status leaked to a stranger; bounces hurt
 *     SES reputation).
 *
 * Both sends are best-effort and fire-and-forget — a notification failure must
 * never break the admin's approve/reject action. This module NEVER throws.
 */

import { dbConnect } from "@/lib/db/mongoose";
import { User } from "@/lib/db/models";
import { sendSms } from "@/lib/sms/client";
import { sendEmail } from "@/lib/email/ses";
import {
  bmdcApprovedTemplate,
  bmdcRejectedTemplate,
  identityApprovedTemplate,
  identityRejectedTemplate,
} from "@/lib/email/templates";
import { publicEnv } from "@/lib/env";

export type DoctorNotifyEvent =
  | "bmdc.approved"
  | "bmdc.rejected"
  | "identity.approved"
  | "identity.rejected";

/** Synthetic email handed to doctors who register without one — never deliverable. */
const PLACEHOLDER_EMAIL_DOMAIN = "@phone.daktar.link";

type UserContact = {
  phone?: string | null;
  email?: string | null;
  emailVerified?: Date | null;
};

/**
 * Pure channel selection — no I/O, so it's unit-testable. Returns the targets
 * we should actually send to for a given user.
 */
export function selectChannels(user: UserContact): { sms?: string; email?: string } {
  const out: { sms?: string; email?: string } = {};
  const phone = (user.phone ?? "").trim();
  if (phone) out.sms = phone;

  const email = (user.email ?? "").trim().toLowerCase();
  const verified = Boolean(user.emailVerified);
  if (email && verified && !email.endsWith(PLACEHOLDER_EMAIL_DOMAIN)) {
    out.email = email;
  }
  return out;
}

function appUrl(path: string): string {
  const base = publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
  return `${base}${path}`;
}

type Built = { sms: string; email: { subject: string; html: string } };

function buildMessages(opts: {
  event: DoctorNotifyEvent;
  doctorName: string;
  doctorSlug: string;
  notes?: string | null;
}): Built {
  const name = opts.doctorName || "Doctor";
  const dashboardUrl = appUrl("/dashboard/profile");
  const profileUrl = appUrl(`/${opts.doctorSlug}`);

  switch (opts.event) {
    case "bmdc.approved": {
      const t = bmdcApprovedTemplate({ name, dashboardUrl });
      return {
        sms: `Daktar.Link: Your profile is approved! You can now publish it: ${dashboardUrl}`,
        email: t,
      };
    }
    case "bmdc.rejected": {
      const t = bmdcRejectedTemplate({ name, notes: opts.notes, dashboardUrl });
      return {
        sms: `Daktar.Link: Your verification needs attention. Review and resubmit: ${dashboardUrl}`,
        email: t,
      };
    }
    case "identity.approved": {
      const t = identityApprovedTemplate({ name, profileUrl });
      return {
        sms: `Daktar.Link: Your identity is verified — your profile now shows the verified badge.`,
        email: t,
      };
    }
    case "identity.rejected": {
      const t = identityRejectedTemplate({ name, notes: opts.notes, dashboardUrl });
      return {
        sms: `Daktar.Link: Your account verification needs attention. Review and resubmit: ${dashboardUrl}`,
        email: t,
      };
    }
  }
}

/**
 * Notify a doctor of a verification outcome over SMS (always) + email (if
 * verified). Best-effort: loads the owner User, fires both channels, and
 * swallows every error so the caller's mutation always succeeds.
 */
export async function notifyDoctorVerification(opts: {
  userId: string | null | undefined;
  event: DoctorNotifyEvent;
  doctorName: string;
  doctorSlug: string;
  notes?: string | null;
}): Promise<void> {
  try {
    if (!opts.userId) return;
    await dbConnect();
    const user = await User.findById(opts.userId)
      .select("phone email emailVerified")
      .lean<UserContact | null>();
    if (!user) return;

    const channels = selectChannels(user);
    const msg = buildMessages(opts);

    if (channels.sms) {
      // Fire-and-forget — long-running PM2/EC2 process, so the promise resolves
      // (mirrors the appointment-notification pattern).
      sendSms({ to: channels.sms, body: msg.sms }).catch((err) =>
        console.error(`[notify ${opts.event}] SMS failed:`, err),
      );
    }
    if (channels.email) {
      sendEmail({ email: channels.email, subject: msg.email.subject, body: msg.email.html }).catch(
        (err) => console.error(`[notify ${opts.event}] email failed:`, err),
      );
    }
  } catch (err) {
    // A notification must never break the admin action that triggered it.
    console.error(`[notify ${opts.event}] dispatch failed:`, err);
  }
}
