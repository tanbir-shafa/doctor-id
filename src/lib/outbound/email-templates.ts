/**
 * Outbound CAMPAIGN email templates + renderer.
 *
 * The claim email is rendered to look like the public profile detail page: a
 * gray page with white, bordered "cards" (header, About, Qualifications,
 * Experience, Chambers & schedule, Areas of focus, Languages) and the same
 * amber "Claim this profile" banner the unclaimed public page shows. The
 * markup is email-safe — table-based layout, inline styles, a bulletproof
 * button, a `<table>` schedule grid, no flexbox/grid/SVG — so it renders
 * across Gmail / Outlook / Apple Mail.
 *
 * Each template is a typed render FUNCTION returning the COMPLETE HTML document
 * (it owns its own page wrapper via `pageShell`, instead of the simple white-
 * card `shell()` the transactional emails use). Template ids are namespaced
 * `email-*` so they never collide with SMS ids (the script's 7-day idempotency
 * keys on `templateId`).
 *
 * Every doctor-derived value is HTML-escaped via `escapeHtml`. v1 scope:
 * English, one personalized claim template, HTML-only (a Bangla variant,
 * a plain-text part, and a `List-Unsubscribe` header are deferred).
 */

import { escapeHtml } from "@/lib/email/templates";

const BRAND = "#0e9ba0";
const BRAND_DARK = "#0f6e56";
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

export interface EmailQualification {
  degree: string;
  /** "Dhaka Medical College (2004)" */
  detail: string;
}
export interface EmailExperience {
  role: string;
  /** "Square Hospitals Ltd · 2016 – present" */
  detail: string;
}
export interface EmailScheduleDay {
  /** "Sat", "Sun", … */
  label: string;
  /** "5–9 PM" or "Closed" */
  time: string;
  open: boolean;
}
export interface EmailChamber {
  name: string;
  isPrimary: boolean;
  address: string;
  /** "" when not shown. */
  phone: string;
  /** "1,000 BDT" or "". */
  fee: string;
  /** Exactly 7 entries, Sat → Fri. */
  schedule: EmailScheduleDay[];
}

/** Everything a campaign email template needs about one doctor. All strings are
 * raw (un-escaped) — the renderer escapes them. Empty string / empty array /
 * null means "omit that piece". */
export interface EmailTemplateContext {
  displayName: string;
  firstName: string;
  initials: string;
  primarySpecialty: string;
  otherSpecialties: string;
  designation: string;
  institute: string;
  locationLabel: string;
  experienceLabel: string;
  bmdcLabel: string;
  viewsLabel: string;
  about: string;
  qualifications: EmailQualification[];
  experiences: EmailExperience[];
  chamber: EmailChamber | null;
  focusAreas: string[];
  languages: string[];
  claimUrl: string;
  unsubscribeUrl: string;
}

export interface OutboundEmailTemplate {
  id: string;
  description: string;
  language: "en" | "bn";
  render(ctx: EmailTemplateContext): { subject: string; html: string };
}

// --- email-safe building blocks ---------------------------------------------

/** Gray page + centered column + Daktar.Link header + footer (with unsubscribe). */
function pageShell(inner: string, unsubscribeUrl: string): string {
  return `<!doctype html>
<html><body style="font-family:${FONT};background:#f6f7f9;margin:0;padding:24px 0;">
  <table role="presentation" align="center" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;border-collapse:collapse;margin:0 auto;">
    <tr><td style="padding:0 16px;">
      <div style="font-size:20px;font-weight:600;color:${BRAND_DARK};margin:0 0 14px;padding-left:2px;">Daktar.Link</div>
      ${inner}
      <p style="font-size:12px;color:#9ca3af;text-align:center;margin:20px 0 0;line-height:1.7;">
        Sent from Daktar.Link — Bangladesh's verified doctor directory · by Shafa Care Ltd<br/>
        <a href="https://shafa.care" style="color:${BRAND};">shafa.care</a> &nbsp;·&nbsp; <a href="${unsubscribeUrl}" style="color:#9ca3af;">Unsubscribe</a>
      </p>
    </td></tr>
  </table>
</body></html>`;
}

/** A white, bordered card (the profile page's card look). */
function card(inner: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 14px;"><tr><td style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:18px 20px;">${inner}</td></tr></table>`;
}

function heading(text: string): string {
  return `<div style="font-size:15px;font-weight:600;color:#111827;margin:0 0 12px;">${escapeHtml(text)}</div>`;
}

function pills(items: string[]): string {
  return items
    .map(
      (f) =>
        `<span style="display:inline-block;background:#f1efe8;color:#444441;font-size:12px;padding:4px 11px;border-radius:999px;margin:0 6px 6px 0;">${escapeHtml(f)}</span>`,
    )
    .join("");
}

function headerCard(ctx: EmailTemplateContext): string {
  const specialty = escapeHtml(ctx.primarySpecialty);
  const specialtyLine = specialty
    ? `<div style="font-size:14px;color:#374151;margin-top:3px;">${specialty}${ctx.otherSpecialties ? ` <span style="color:#9ca3af;">&middot; ${escapeHtml(ctx.otherSpecialties)}</span>` : ""}</div>`
    : "";
  const desigParts = [ctx.designation, ctx.institute].filter(Boolean).map(escapeHtml);
  const desigLine = desigParts.length
    ? `<div style="font-size:13px;color:#4b5563;margin-top:3px;">${desigParts.join(" &middot; ")}</div>`
    : "";
  const metaParts = [ctx.locationLabel, ctx.experienceLabel, ctx.bmdcLabel, ctx.viewsLabel]
    .filter(Boolean)
    .map(escapeHtml);
  const metaLine = metaParts.length
    ? `<p style="font-size:13px;color:#6b7280;margin:12px 0 0;">${metaParts.join(" &middot; ")}</p>`
    : "";

  return card(`
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr>
        <td valign="top" width="80" style="padding-right:16px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td align="center" valign="middle" width="64" height="64" style="width:64px;height:64px;background:#e1f5ee;border-radius:12px;color:${BRAND_DARK};font-size:22px;font-weight:600;">${escapeHtml(ctx.initials)}</td>
          </tr></table>
        </td>
        <td valign="top">
          <div style="margin:0 0 6px;">
            <span style="display:inline-block;background:#f1efe8;color:#5f5e5a;font-size:11px;font-weight:600;padding:3px 9px;border-radius:999px;margin:0 6px 0 0;">Unverified</span>
            <span style="display:inline-block;background:#fef3c7;color:#78350f;font-size:11px;font-weight:600;padding:3px 9px;border-radius:999px;">Unclaimed profile</span>
          </div>
          <div style="font-size:20px;font-weight:600;color:#111827;line-height:1.2;">${escapeHtml(ctx.displayName)}</div>
          ${specialtyLine}
          ${desigLine}
        </td>
      </tr>
    </table>
    ${metaLine}`);
}

function claimBanner(ctx: EmailTemplateContext): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 14px;"><tr><td style="background:#fffbeb;border:1px solid #fcd34d;border-radius:12px;padding:14px 16px;">
    <p style="margin:0;font-size:14px;color:#78350f;">Are you <strong style="font-weight:600;">${escapeHtml(ctx.displayName)}</strong>?</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:10px 0 0;"><tr>
      <td bgcolor="#78350f" style="border-radius:8px;"><a href="${ctx.claimUrl}" style="display:inline-block;padding:9px 16px;font-size:14px;font-weight:600;color:#fffbeb;text-decoration:none;border-radius:8px;">Claim this profile</a></td>
    </tr></table>
    <p style="margin:9px 0 0;font-size:12px;color:#92400e;">Free &middot; phone + SMS verification</p>
  </td></tr></table>`;
}

function aboutCard(ctx: EmailTemplateContext): string {
  if (!ctx.about) return "";
  return card(`${heading("About")}<p style="font-size:14px;color:#374151;line-height:1.6;margin:0;">${escapeHtml(ctx.about)}</p>`);
}

function qualificationsCard(ctx: EmailTemplateContext): string {
  if (ctx.qualifications.length === 0) return "";
  const rows = ctx.qualifications
    .map(
      (q) =>
        `<p style="font-size:14px;margin:0 0 6px;color:#374151;"><strong style="color:#111827;font-weight:600;">${escapeHtml(q.degree)}</strong>${q.detail ? ` — ${escapeHtml(q.detail)}` : ""}</p>`,
    )
    .join("");
  return card(`${heading("Qualifications")}${rows}`);
}

function experienceCard(ctx: EmailTemplateContext): string {
  if (ctx.experiences.length === 0) return "";
  const rows = ctx.experiences
    .map(
      (e) =>
        `<div style="margin:0 0 10px;"><div style="font-size:14px;font-weight:600;color:#111827;">${escapeHtml(e.role)}</div>${e.detail ? `<div style="font-size:13px;color:#6b7280;">${escapeHtml(e.detail)}</div>` : ""}</div>`,
    )
    .join("");
  return card(`${heading("Experience")}${rows}`);
}

function scheduleGrid(days: EmailScheduleDay[]): string {
  const cells = days
    .map((d) => {
      const style = d.open
        ? "background:#e1f5ee;border:1px solid #b7e3e0;"
        : "background:#f4f4f1;border:1px solid #e5e7eb;color:#9ca3af;";
      return `<td align="center" valign="top" width="14%" style="border-radius:6px;padding:6px 1px;font-size:11px;${style}"><div style="font-weight:600;color:#111827;margin-bottom:2px;">${escapeHtml(d.label)}</div>${escapeHtml(d.time)}</td>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="3" style="border-collapse:separate;border-spacing:3px;table-layout:fixed;margin-top:12px;"><tr>${cells}</tr></table>`;
}

function chamberCard(ctx: EmailTemplateContext): string {
  const c = ctx.chamber;
  if (!c) return "";
  const primaryPill = c.isPrimary
    ? `<span style="display:inline-block;background:#e1f5ee;color:${BRAND_DARK};font-size:11px;font-weight:600;padding:3px 9px;border-radius:999px;">Primary</span>`
    : "";
  const contactBits = [c.phone, c.fee].filter(Boolean).map(escapeHtml).join(" &nbsp;&middot;&nbsp; ");
  const contactLine = contactBits
    ? `<p style="font-size:13px;color:#374151;margin:8px 0 0;">${contactBits}</p>`
    : "";
  return card(`${heading("Chambers & schedule")}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#fafafa;border:1px solid #eef0f2;border-radius:8px;"><tr><td style="padding:14px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td valign="top"><div style="font-size:15px;font-weight:600;color:#111827;">${escapeHtml(c.name)}</div></td>
        <td valign="top" align="right">${primaryPill}</td>
      </tr></table>
      ${c.address ? `<p style="font-size:13px;color:#6b7280;margin:4px 0 0;">${escapeHtml(c.address)}</p>` : ""}
      ${contactLine}
      ${scheduleGrid(c.schedule)}
    </td></tr></table>`);
}

function focusCard(ctx: EmailTemplateContext): string {
  if (ctx.focusAreas.length === 0) return "";
  return card(`${heading("Areas of focus")}<div>${pills(ctx.focusAreas)}</div>`);
}

function languagesCard(ctx: EmailTemplateContext): string {
  if (ctx.languages.length === 0) return "";
  return card(`${heading("Languages")}<div>${pills(ctx.languages)}</div>`);
}

export const OUTBOUND_EMAIL_TEMPLATES: Record<string, OutboundEmailTemplate> = {
  "email-en-claim": {
    id: "email-en-claim",
    description:
      "English claim invite — profile-page-style card layout; deep-links to /auth/register?slug=.",
    language: "en",
    render(ctx) {
      const subject = `Dr. ${ctx.firstName || ctx.displayName}, your Daktar.Link profile is ready to claim`;
      const inner = [
        headerCard(ctx),
        claimBanner(ctx),
        aboutCard(ctx),
        qualificationsCard(ctx),
        experienceCard(ctx),
        chamberCard(ctx),
        focusCard(ctx),
        languagesCard(ctx),
      ].join("\n");
      return { subject, html: pageShell(inner, ctx.unsubscribeUrl) };
    },
  },
};

/**
 * Render a campaign email for one recipient. The template owns its full HTML
 * document; this is the stable seam the outbound script calls.
 */
export function renderEmailTemplate(
  tpl: OutboundEmailTemplate,
  ctx: EmailTemplateContext,
): { subject: string; html: string } {
  return tpl.render(ctx);
}
