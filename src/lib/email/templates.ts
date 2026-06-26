import { publicEnv } from "@/lib/env";

/**
 * Email templates.
 *
 * Plain inline HTML — no React Email yet (deferred). Each template returns
 * `{ subject, html, text }`; callers pass `subject` + `html` (as `body`) into
 * `sendEmail()` (the SES port sends an HTML body — see ses.ts).
 */

const APP_NAME = "Daktar.Link";

export function shell(body: string): string {
  return `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background:#f6f7f9; padding:24px 0; margin:0;">
  <table align="center" width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;padding:32px;border:1px solid #e5e7eb;">
    <tr><td>
      <h1 style="margin:0 0 16px;font-size:20px;color:#111827;">${APP_NAME}</h1>
      ${body}
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
      <p style="font-size:12px;color:#6b7280;margin:0;">
        Sent from ${APP_NAME} — Bangladesh's verified doctor directory<br/>
        by Shafa Care Ltd · <a href="https://shafa.care" style="color:#0e9ba0;">shafa.care</a>
      </p>
    </td></tr>
  </table>
</body></html>`;
}

export function verifyEmailTemplate(opts: { name: string; token: string; email: string }) {
  const url = `${publicEnv.NEXT_PUBLIC_APP_URL}/auth/verify-email?token=${encodeURIComponent(opts.token)}&email=${encodeURIComponent(opts.email)}`;
  const body = `
    <p style="font-size:15px;color:#111827;margin:0 0 12px;">Hi ${escapeHtml(opts.name)},</p>
    <p style="font-size:15px;color:#374151;margin:0 0 20px;">
      Welcome to ${APP_NAME}. Please confirm your email to finish setting up your profile.
    </p>
    <p>
      <a href="${url}" style="display:inline-block;padding:10px 18px;background:#0e9ba0;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Verify email</a>
    </p>
    <p style="font-size:13px;color:#6b7280;margin:20px 0 0;">
      Or paste this link into your browser:<br/><span style="color:#0e9ba0;">${url}</span>
    </p>
    <p style="font-size:13px;color:#6b7280;margin:12px 0 0;">This link expires in 24 hours.</p>
  `;
  return {
    subject: `Verify your ${APP_NAME} email`,
    html: shell(body),
    text: `Hi ${opts.name},\n\nVerify your email: ${url}\n\nThis link expires in 24 hours.`,
  };
}

export function resetPasswordTemplate(opts: { name: string; token: string; email: string }) {
  const url = `${publicEnv.NEXT_PUBLIC_APP_URL}/auth/reset-password?token=${encodeURIComponent(opts.token)}&email=${encodeURIComponent(opts.email)}`;
  const body = `
    <p style="font-size:15px;color:#111827;margin:0 0 12px;">Hi ${escapeHtml(opts.name)},</p>
    <p style="font-size:15px;color:#374151;margin:0 0 20px;">
      We received a request to reset your ${APP_NAME} password. If this wasn't you, ignore this email — your password will stay the same.
    </p>
    <p>
      <a href="${url}" style="display:inline-block;padding:10px 18px;background:#0e9ba0;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Reset password</a>
    </p>
    <p style="font-size:13px;color:#6b7280;margin:20px 0 0;">This link expires in 1 hour.</p>
  `;
  return {
    subject: `Reset your ${APP_NAME} password`,
    html: shell(body),
    text: `Reset your password: ${url}\n\nThis link expires in 1 hour.`,
  };
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// --- Verification / approval notification emails ---
//
// Sent to a doctor's VERIFIED account email when an admin reviews their BMDC
// claim or identity (account) verification. SMS is the always-on channel
// (see src/lib/notifications/doctor.ts); these are the email counterpart.

function cta(url: string, label: string): string {
  return `<p><a href="${url}" style="display:inline-block;padding:10px 18px;background:#0e9ba0;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">${escapeHtml(label)}</a></p>`;
}

function notesBlock(notes?: string | null): string {
  if (!notes) return "";
  return `
    <p style="font-size:14px;color:#374151;margin:16px 0 4px;font-weight:600;">Reviewer notes</p>
    <p style="font-size:14px;color:#374151;margin:0 0 4px;padding:12px 14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;white-space:pre-wrap;">${escapeHtml(notes)}</p>`;
}

export function bmdcApprovedTemplate(opts: { name: string; dashboardUrl: string }) {
  const body = `
    <p style="font-size:15px;color:#111827;margin:0 0 12px;">Hi ${escapeHtml(opts.name)},</p>
    <p style="font-size:15px;color:#374151;margin:0 0 20px;">
      Good news — your profile has been approved. You can now publish it to make it public and start sharing your ${APP_NAME} link.
    </p>
    ${cta(opts.dashboardUrl, "Publish your profile")}`;
  return {
    subject: `Your ${APP_NAME} profile is approved`,
    html: shell(body),
    text: `Hi ${opts.name},\n\nYour ${APP_NAME} profile has been approved. You can now publish it: ${opts.dashboardUrl}`,
  };
}

export function bmdcRejectedTemplate(opts: { name: string; notes?: string | null; dashboardUrl: string }) {
  const body = `
    <p style="font-size:15px;color:#111827;margin:0 0 12px;">Hi ${escapeHtml(opts.name)},</p>
    <p style="font-size:15px;color:#374151;margin:0 0 8px;">
      We reviewed your verification request and couldn't approve it yet. Please check the details below and resubmit from your dashboard.
    </p>
    ${notesBlock(opts.notes)}
    ${cta(opts.dashboardUrl, "Review and resubmit")}`;
  return {
    subject: `Action needed on your ${APP_NAME} verification`,
    html: shell(body),
    text: `Hi ${opts.name},\n\nWe couldn't approve your verification yet.${opts.notes ? `\n\nReviewer notes: ${opts.notes}` : ""}\n\nReview and resubmit: ${opts.dashboardUrl}`,
  };
}

export function identityApprovedTemplate(opts: { name: string; profileUrl: string }) {
  const body = `
    <p style="font-size:15px;color:#111827;margin:0 0 12px;">Hi ${escapeHtml(opts.name)},</p>
    <p style="font-size:15px;color:#374151;margin:0 0 20px;">
      Your identity has been verified. Your public profile now shows the verified badge.
    </p>
    ${cta(opts.profileUrl, "View your profile")}`;
  return {
    subject: `Your ${APP_NAME} identity is verified`,
    html: shell(body),
    text: `Hi ${opts.name},\n\nYour identity has been verified — your profile now shows the verified badge: ${opts.profileUrl}`,
  };
}

export function identityRejectedTemplate(opts: { name: string; notes?: string | null; dashboardUrl: string }) {
  const body = `
    <p style="font-size:15px;color:#111827;margin:0 0 12px;">Hi ${escapeHtml(opts.name)},</p>
    <p style="font-size:15px;color:#374151;margin:0 0 8px;">
      We reviewed your account verification and couldn't approve it yet. Please check the details below and resubmit from your dashboard.
    </p>
    ${notesBlock(opts.notes)}
    ${cta(opts.dashboardUrl, "Review and resubmit")}`;
  return {
    subject: `Action needed on your ${APP_NAME} account verification`,
    html: shell(body),
    text: `Hi ${opts.name},\n\nWe couldn't approve your account verification yet.${opts.notes ? `\n\nReviewer notes: ${opts.notes}` : ""}\n\nReview and resubmit: ${opts.dashboardUrl}`,
  };
}
