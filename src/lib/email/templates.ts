import { publicEnv } from "@/lib/env";

/**
 * Email templates.
 *
 * Plain inline HTML — no React Email yet (deferred). Each template returns
 * `{ subject, html, text }` so callers just pass it into `sendEmail()`.
 */

const APP_NAME = "doctor.id.bd";

function shell(body: string): string {
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

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
