/**
 * Bulk outbound acquisition script — A.8 (SMS + email).
 *
 * Usage:
 *   npm run outbound -- --campaign=2026-w22-claim --template=en-claim-rx-pad
 *     [--channel=sms|email]   (default sms)
 *     [--cohort=district=Dhaka,specialty=Cardiology]
 *     [--email=doctor@example.com]   (filter to single doctor by public email)
 *     [--limit=N]
 *     [--dry-run]
 *
 * Pipeline (channel-agnostic except where a ChannelStrategy branches):
 *   1. Load unclaimed `published` doctors reachable on the channel (phone for
 *      SMS, email for email) matching the cohort filters.
 *   2. Skip doctors with no usable recipient (no point messaging).
 *   3. Skip recipients on the OptOut list for this channel (single `$in` query).
 *   4. Skip doctors already messaged with this template in the last 7 days
 *      (idempotency — `(doctorId, templateId, sentAt within 7d)`). Email and SMS
 *      templates live in separate id namespaces, so the windows are independent.
 *   5. Render the template against each doctor's context (claim deep-link =
 *      /auth/register?slug=…).
 *   6. Dispatch: SMS → `sendSmsBatch` (provider-aware chunking); email →
 *      `sendEmailBatch` (concurrency-bounded SES fan-out).
 *   7. Persist one `OutboundMessage` row per recipient with the final status
 *      (sent / failed / suppressed / opted_out / skipped).
 *
 * Refuses to run when NODE_ENV=production unless `--force-prod`.
 */

import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { dbConnect, dbDisconnect } from "@/lib/db/mongoose";
import { Doctor, OutboundMessage, OptOut } from "@/lib/db/models";
import { sendSmsBatch } from "@/lib/sms/client";
import { sendEmailBatch } from "@/lib/email/client";
import { getSmsProvider } from "@/lib/sms/provider";
import { normalizeBdPhone } from "@/lib/utils/phone";
import { normalizeEmail } from "@/lib/utils/email";
import { signUnsubscribe } from "@/lib/outbound/unsubscribe-token";
import { buildAutoProfileSummary } from "@/lib/seo/profile-text";
import type { DoctorDocLike } from "@/types/doctor";
import { publicEnv } from "@/lib/env";
import {
  OUTBOUND_TEMPLATES,
  renderTemplate,
  segmentCount,
  hasUnresolvedPlaceholders,
} from "@/lib/outbound/templates";
import {
  OUTBOUND_EMAIL_TEMPLATES,
  renderEmailTemplate,
  type EmailTemplateContext,
} from "@/lib/outbound/email-templates";

if (process.env.NODE_ENV === "production" && !process.argv.includes("--force-prod")) {
  console.error("Refusing to run in production without --force-prod.");
  process.exit(1);
}

type Channel = "sms" | "email";

interface CliArgs {
  campaign: string | null;
  template: string | null;
  channel: Channel;
  cohort: Record<string, string>;
  email: string | null;
  limit: number | null;
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    campaign: null,
    template: null,
    channel: "sms",
    cohort: {},
    email: null,
    limit: null,
    dryRun: false,
  };
  for (const a of argv) {
    if (a === "--dry-run") args.dryRun = true;
    else if (a.startsWith("--campaign=")) args.campaign = a.slice("--campaign=".length);
    else if (a.startsWith("--template=")) args.template = a.slice("--template=".length);
    else if (a.startsWith("--channel=")) {
      const c = a.slice("--channel=".length);
      if (c !== "sms" && c !== "email") throw new Error(`Invalid --channel: ${c} (sms|email)`);
      args.channel = c;
    } else if (a.startsWith("--email=")) {
      args.email = a.slice("--email=".length);
    } else if (a.startsWith("--limit=")) {
      const n = Number(a.slice("--limit=".length));
      if (!Number.isFinite(n) || n <= 0) throw new Error(`Invalid --limit: ${a}`);
      args.limit = n;
    } else if (a.startsWith("--cohort=")) {
      const pairs = a.slice("--cohort=".length).split(",");
      for (const p of pairs) {
        const [k, v] = p.split("=");
        if (k && v) args.cohort[k.trim()] = v.trim();
      }
    }
  }
  if (!args.campaign) throw new Error("--campaign=<id> is required");
  if (!args.template) throw new Error("--template=<id> is required");
  return args;
}

interface DoctorLean {
  _id: unknown;
  slug: string;
  name: { first: string; last: string; displayName: string; prefix: string };
  contact?: { publicPhone?: string | null; publicEmail?: string | null };
  specialties?: Array<{ name?: string; isPrimary?: boolean }>;
  // Extra fields the email profile-page card uses (email channel only).
  designation?: string | null;
  institute?: string | null;
  yearsOfExperience?: number | null;
  bmdcNumber?: string | null;
  bio?: string | null;
  concentrations?: string[];
  subSpecialties?: string[];
  languages?: string[];
  verificationLevel?: string;
  profileViews?: number;
  metrics?: { profileViews30d?: number };
  qualifications?: Array<{ degree?: string; institution?: string; year?: number }>;
  experience?: Array<{
    role?: string;
    organization?: string;
    from?: string | Date | null;
    to?: string | Date | null;
    current?: boolean;
  }>;
  chambers?: Array<{
    name?: string;
    address?: string;
    area?: string;
    district?: string;
    isPrimary?: boolean;
    phone?: string | null;
    consultationFee?: { amount?: number; currency?: string };
    schedule?: Array<{ day: string; startTime: string; endTime: string; available?: boolean }>;
  }>;
}

/** What a render produces — the body to dispatch, the (optional) subject, and
 * the compact value persisted to `OutboundMessage.body` for forensic replay. */
interface Rendered {
  dispatchBody: string;
  subject?: string;
  storedBody: string;
}

/** Uniform per-recipient send outcome, regardless of channel. */
interface UniformResult {
  sent: boolean;
  errorMessage?: string;
  suppressed?: boolean;
  batchId: string | null;
}

/** Per-channel behavior; the rest of the pipeline is shared. */
interface ChannelStrategy {
  channel: Channel;
  /** Human label for the template (id + language + flags). */
  templateLabel: string;
  /** Extra filter so we only load doctors reachable on this channel. */
  contactFilter: Record<string, unknown>;
  /** Projection — email pulls extra fields for the profile-preview card. */
  selectFields: string;
  /** Pull + normalize the destination from a doctor row; null → skip. */
  recipientOf(d: DoctorLean): string | null;
  /** Opt-out set for the cohort's recipients (single batched query). */
  loadOptedOut(recipients: string[]): Promise<Set<string>>;
  /** Render the message for one doctor (recipient already resolved). */
  render(d: DoctorLean, recipient: string): Rendered;
  /** Dispatch the queued rows; results returned in input order. */
  dispatch(rows: Array<{ recipient: string; rendered: Rendered }>): Promise<UniformResult[]>;
}

function primarySpecialty(d: DoctorLean): string {
  return d.specialties?.find((s) => s.isPrimary)?.name ?? d.specialties?.[0]?.name ?? "";
}

// --- email profile-card helpers (Bangladesh week: Sat → Fri) ---------------
const DAY_ORDER = ["sat", "sun", "mon", "tue", "wed", "thu", "fri"] as const;
const DAY_LABEL: Record<(typeof DAY_ORDER)[number], string> = {
  sat: "Sat",
  sun: "Sun",
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
};

/** "17:00" → { label: "5", mer: "PM" } (minutes kept only when non-zero). */
function fmt12(hhmm: string): { label: string; mer: "AM" | "PM" } {
  const [hStr, mStr] = hhmm.split(":");
  const H = Number(hStr);
  const M = Number(mStr ?? "0");
  const mer = H >= 12 ? "PM" : "AM";
  let h = H % 12;
  if (h === 0) h = 12;
  return { label: M ? `${h}:${String(M).padStart(2, "0")}` : `${h}`, mer };
}

/** Compact range for a schedule cell: "5–9 PM" / "10 AM–1 PM". */
function compactRange(start: string, end: string): string {
  const s = fmt12(start);
  const e = fmt12(end);
  return s.mer === e.mer ? `${s.label}–${e.label} ${e.mer}` : `${s.label} ${s.mer}–${e.label} ${e.mer}`;
}

/** Build a 7-entry Sat→Fri grid from a chamber's slots. */
function scheduleDays(
  slots: Array<{ day: string; startTime: string; endTime: string; available?: boolean }>,
): Array<{ label: string; time: string; open: boolean }> {
  return DAY_ORDER.map((day) => {
    const slot = slots.find((s) => s.day === day && s.available !== false);
    return {
      label: DAY_LABEL[day],
      time: slot ? compactRange(slot.startTime, slot.endTime) : "Closed",
      open: Boolean(slot),
    };
  });
}

function yearOf(d: string | Date | null | undefined): string {
  if (!d) return "";
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? "" : String(dt.getFullYear());
}

function makeSmsStrategy(templateId: string): ChannelStrategy {
  const template = OUTBOUND_TEMPLATES[templateId];
  if (!template) {
    throw new Error(
      `Unknown SMS template "${templateId}". Available: ${Object.keys(OUTBOUND_TEMPLATES).join(", ")}`,
    );
  }
  return {
    channel: "sms",
    templateLabel: `${template.id} (${template.language}, ${template.personalized ? "personalized" : "broadcast"})`,
    contactFilter: { "contact.publicPhone": { $ne: null } },
    selectFields: "_id slug name contact specialties",
    recipientOf: (d) => normalizeBdPhone(d.contact?.publicPhone ?? null),
    async loadOptedOut(recipients) {
      if (!recipients.length) return new Set();
      const rows = (await OptOut.find({ phone: { $in: recipients } })
        .select("phone")
        .lean()) as Array<{ phone: string }>;
      return new Set(rows.map((r) => r.phone));
    },
    render(d) {
      const body = renderTemplate(template.body, {
        firstName: d.name.first,
        lastName: d.name.last,
        displayName: d.name.displayName,
        slug: d.slug,
        specialty: primarySpecialty(d),
      });
      return { dispatchBody: body, storedBody: body };
    },
    async dispatch(rows) {
      const results = await sendSmsBatch(rows.map((r) => ({ to: r.recipient, body: r.rendered.dispatchBody })));
      return results.map((r) => ({
        sent: r.sent,
        errorMessage: r.errorMessage,
        batchId: r.batchId || null,
      }));
    },
  };
}

function makeEmailStrategy(templateId: string): ChannelStrategy {
  const template = OUTBOUND_EMAIL_TEMPLATES[templateId];
  if (!template) {
    throw new Error(
      `Unknown email template "${templateId}". Available: ${Object.keys(OUTBOUND_EMAIL_TEMPLATES).join(", ")}`,
    );
  }
  const appUrl = publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  return {
    channel: "email",
    templateLabel: `${template.id} (${template.language}, personalized)`,
    contactFilter: { "contact.publicEmail": { $ne: null } },
    selectFields:
      "_id slug name contact specialties subSpecialties concentrations designation institute yearsOfExperience bmdcNumber bio languages verificationLevel profileViews metrics qualifications experience chambers",
    recipientOf: (d) => normalizeEmail(d.contact?.publicEmail ?? null),
    async loadOptedOut(recipients) {
      if (!recipients.length) return new Set();
      const rows = (await OptOut.find({ channel: "email", email: { $in: recipients } })
        .select("email")
        .lean()) as Array<{ email: string }>;
      return new Set(rows.map((r) => r.email));
    },
    render(d, recipient) {
      const primary = primarySpecialty(d);
      const chamberRaw = d.chambers?.find((c) => c.isPrimary) ?? d.chambers?.[0];
      const otherSpecialties = (d.specialties ?? [])
        .map((s) => s.name)
        .filter((n): n is string => Boolean(n) && n !== primary)
        .slice(0, 2)
        .join(", ");
      const initials =
        `${d.name.first?.[0] ?? ""}${d.name.last?.[0] ?? ""}`.toUpperCase() || "DR";

      const views = d.metrics?.profileViews30d ?? 0;
      const allTimeViews = d.profileViews ?? 0;
      const viewsLabel =
        views >= 100
          ? `${views.toLocaleString("en-IN")} views this month`
          : allTimeViews >= 100
            ? `${allTimeViews.toLocaleString("en-IN")} profile views`
            : "";

      const focusSource =
        (d.subSpecialties?.length ? d.subSpecialties : d.concentrations) ?? [];

      const chamber = chamberRaw
        ? {
            name: chamberRaw.name ?? "",
            isPrimary: Boolean(chamberRaw.isPrimary),
            address: [chamberRaw.address, chamberRaw.area, chamberRaw.district]
              .filter(Boolean)
              .join(", "),
            // Chamber phone is a clinic line — not gated by personal privacy flags.
            phone: chamberRaw.phone ?? "",
            fee:
              chamberRaw.consultationFee?.amount && chamberRaw.consultationFee.amount > 0
                ? `${chamberRaw.consultationFee.amount.toLocaleString("en-IN")} ${chamberRaw.consultationFee.currency ?? "BDT"}`
                : "",
            schedule: scheduleDays(chamberRaw.schedule ?? []),
          }
        : null;

      const ctx: EmailTemplateContext = {
        displayName: d.name.displayName,
        firstName: d.name.first,
        initials,
        primarySpecialty: primary,
        otherSpecialties,
        designation: d.designation ?? "",
        institute: d.institute ?? "",
        locationLabel: chamberRaw
          ? [chamberRaw.area, chamberRaw.district].filter(Boolean).join(", ")
          : "",
        experienceLabel: d.yearsOfExperience ? `${d.yearsOfExperience}+ years experience` : "",
        bmdcLabel: d.bmdcNumber ? `BMDC Reg. ${d.bmdcNumber}` : "",
        viewsLabel,
        about: buildAutoProfileSummary(d as unknown as DoctorDocLike),
        qualifications: (d.qualifications ?? [])
          .filter((q) => q.degree)
          .slice(0, 4)
          .map((q) => ({
            degree: q.degree ?? "",
            detail: [q.institution, q.year ? `(${q.year})` : ""].filter(Boolean).join(" "),
          })),
        experiences: (d.experience ?? [])
          .filter((e) => e.role)
          .slice(0, 3)
          .map((e) => {
            const from = yearOf(e.from);
            const to = e.current ? "present" : yearOf(e.to);
            const period = [from, to].filter(Boolean).join(" – ");
            return {
              role: e.role ?? "",
              detail: [e.organization, period].filter(Boolean).join(" · "),
            };
          }),
        chamber,
        focusAreas: focusSource.filter(Boolean).slice(0, 6),
        languages: (d.languages ?? []).filter(Boolean).slice(0, 4),
        claimUrl: `${appUrl}/auth/register?slug=${encodeURIComponent(d.slug)}`,
        unsubscribeUrl: `${appUrl}/api/unsubscribe?token=${signUnsubscribe(recipient)}`,
      };
      const { subject, html } = renderEmailTemplate(template, ctx);
      // Persist the subject (concise, scannable); the HTML is reconstructable
      // from templateId + the doctor's data, so no forensic fidelity is lost.
      return { dispatchBody: html, subject, storedBody: subject };
    },
    async dispatch(rows) {
      const batchId = randomUUID();
      const results = await sendEmailBatch(
        rows.map((r) => ({ to: r.recipient, subject: r.rendered.subject ?? "", body: r.rendered.dispatchBody })),
      );
      return results.map((r) => ({
        sent: r.sent,
        errorMessage: r.errorMessage,
        suppressed: r.suppressed,
        batchId,
      }));
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const strategy = args.channel === "email" ? makeEmailStrategy(args.template!) : makeSmsStrategy(args.template!);

  console.log(`→ Campaign: ${args.campaign}`);
  console.log(`→ Channel:  ${strategy.channel}`);
  console.log(`→ Template: ${strategy.templateLabel}`);
  if (args.email) console.log(`→ Email filter: ${args.email}`);
  if (args.dryRun) console.log("  (dry-run: no API calls, no DB writes)");

  await dbConnect();

  // Build the doctor query — shared base + channel contact filter + cohort.
  const filter: Record<string, unknown> = {
    isClaimed: false,
    status: "published",
    ...strategy.contactFilter,
  };
  if (args.cohort.district) filter["chambers.district"] = args.cohort.district;
  if (args.cohort.specialty) filter["specialties.name"] = args.cohort.specialty;
  if (args.email) {
    const normalized = normalizeEmail(args.email);
    if (!normalized) {
      console.error(`✗ Invalid email: ${args.email}`);
      process.exitCode = 1;
      return;
    }
    filter["contact.publicEmail"] = normalized;
  }

  const query = Doctor.find(filter).select(strategy.selectFields);
  if (args.limit) query.limit(args.limit);

  const doctorRows = (await query.lean()) as unknown as DoctorLean[];
  console.log(`→ Cohort matched ${doctorRows.length} unclaimed published doctors`);

  // Resolve recipients up front; drop rows with no usable recipient.
  const candidates: Array<{ doctor: DoctorLean; recipient: string }> = [];
  let skippedNoContact = 0;
  for (const d of doctorRows) {
    const recipient = strategy.recipientOf(d);
    if (!recipient) {
      skippedNoContact++;
      continue;
    }
    candidates.push({ doctor: d, recipient });
  }

  // Single-query opt-out lookup (channel-keyed).
  const recipients = candidates.map((c) => c.recipient);
  const optedOut = await strategy.loadOptedOut(recipients);

  // 7-day idempotency — exclude doctors already messaged on this template
  // recently. One query batched on doctorId. Bypassed for a single-email test
  // (--email), so the same address can be re-tested without waiting 7 days.
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const doctorIds = candidates.map((c) => c.doctor._id as mongoose.Types.ObjectId);
  const recentRows =
    doctorIds.length && !args.email
      ? ((await OutboundMessage.find({
          doctorId: { $in: doctorIds as never },
          templateId: args.template,
          sentAt: { $gte: sevenDaysAgo },
        })
          .select("doctorId")
          .lean()) as Array<{ doctorId: unknown }>)
      : [];
  if (args.email) console.log("→ Idempotency: bypassed (single-email test)");
  const recentlyMessaged = new Set<string>(recentRows.map((r) => String(r.doctorId)));

  type Row = {
    doctor: DoctorLean;
    recipient: string;
    rendered: Rendered | null;
    status: "queued" | "opted_out" | "skipped";
  };
  const rows: Row[] = candidates.map(({ doctor, recipient }) => {
    if (optedOut.has(recipient)) return { doctor, recipient, rendered: null, status: "opted_out" };
    if (recentlyMessaged.has(String(doctor._id)))
      return { doctor, recipient, rendered: null, status: "skipped" };
    return { doctor, recipient, rendered: strategy.render(doctor, recipient), status: "queued" };
  });

  const queued = rows.filter((r) => r.status === "queued");

  // Guard: don't ship a campaign with unresolved {{placeholders}} in body or subject.
  const broken = queued.find(
    (r) =>
      r.rendered != null &&
      (hasUnresolvedPlaceholders(r.rendered.dispatchBody) ||
        (r.rendered.subject != null && hasUnresolvedPlaceholders(r.rendered.subject))),
  );
  if (broken) {
    console.error(
      `✗ Template has unresolved placeholders. Sample: ${JSON.stringify(broken.rendered?.subject ?? broken.rendered?.dispatchBody)}`,
    );
    process.exitCode = 1;
    return;
  }

  const optedOutCount = rows.filter((r) => r.status === "opted_out").length;
  const skippedCount = rows.filter((r) => r.status === "skipped").length;
  console.log(`→ Skipped (no contact):    ${skippedNoContact}`);
  console.log(`→ Skipped (opt-out):       ${optedOutCount}`);
  console.log(`→ Skipped (recently sent): ${skippedCount}`);
  console.log(`→ Queued to send:          ${queued.length}`);

  if (strategy.channel === "sms") {
    printSmsPreview(queued);
  } else if (queued[0]?.rendered) {
    console.log(`→ Sample subject: ${queued[0].rendered.subject}`);
  }

  if (args.dryRun) {
    if (queued[0]?.rendered) {
      console.log("\nSample rendered message:");
      console.log("  " + (queued[0].rendered.subject ?? queued[0].rendered.dispatchBody));
    }
    console.log("\n(dry-run complete — nothing sent, no rows written)");
    return;
  }

  // Persist skipped + opted_out rows first so the dashboard reflects the full
  // funnel even when zero sends actually happen.
  const nonQueued = rows.filter((r) => r.status !== "queued");
  if (nonQueued.length > 0) {
    await OutboundMessage.insertMany(
      nonQueued.map((r) => ({
        doctorId: r.doctor._id,
        campaignId: args.campaign,
        templateId: args.template,
        channel: strategy.channel,
        body: r.rendered?.storedBody || "(no body — skipped before render)",
        to: r.recipient,
        status: r.status,
      })),
    );
  }

  if (queued.length === 0) {
    console.log("Nothing to send.");
    return;
  }

  console.log(`\n→ Dispatching ${queued.length} ${strategy.channel} message(s)…`);
  const sendResults = await strategy.dispatch(
    queued.map((r) => ({ recipient: r.recipient, rendered: r.rendered! })),
  );

  // Persist one row per queued recipient with the final status.
  const docs = queued.map((r, i) => {
    const result = sendResults[i]!;
    const status = result.sent ? "sent" : result.suppressed ? "suppressed" : "failed";
    return {
      doctorId: r.doctor._id,
      campaignId: args.campaign,
      templateId: args.template,
      channel: strategy.channel,
      body: r.rendered!.storedBody,
      to: r.recipient,
      status,
      sentAt: result.sent ? new Date() : null,
      errorMessage: result.errorMessage ?? null,
      batchId: result.batchId,
    };
  });
  await OutboundMessage.insertMany(docs);

  const sent = sendResults.filter((r) => r.sent).length;
  const suppressed = sendResults.filter((r) => !r.sent && r.suppressed).length;
  const failed = sendResults.length - sent - suppressed;
  console.log("\n✓ Run complete:");
  console.table({
    queued: queued.length,
    sent,
    failed,
    suppressed,
    optedOut: optedOutCount,
    skipped: skippedCount,
    skippedNoContact,
  });
}

/** SMS-only dry-run preview: body groups, gateway calls, segment cost. */
function printSmsPreview(queued: Array<{ rendered: { dispatchBody: string } | null }>): void {
  const bodies = queued.map((r) => r.rendered!.dispatchBody);
  const segPreview = bodies[0] ? segmentCount(bodies[0]) : { unicode: false, segments: 0 };
  const distinctBodies = new Set(bodies).size;
  const provider = getSmsProvider();
  const bodyCounts = new Map<string, number>();
  for (const b of bodies) bodyCounts.set(b, (bodyCounts.get(b) ?? 0) + 1);
  let singletons = 0;
  let calls = 0;
  for (const count of bodyCounts.values()) {
    if (count >= 2) calls += Math.ceil(count / provider.maxBatch);
    else singletons += 1;
  }
  if (singletons > 0) calls += Math.ceil(singletons / provider.maxBatch);
  console.log(
    `→ Body groups: ${distinctBodies} · ~${calls} ${provider.name} call(s) · ${segPreview.segments} segment${segPreview.segments === 1 ? "" : "s"}/SMS (${segPreview.unicode ? "Unicode" : "ASCII"})`,
  );
}

main()
  .catch((err) => {
    console.error("Outbound script failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await dbDisconnect();
    // mongoose 9 sometimes lingers — force exit to unblock CI.
    setTimeout(() => process.exit(process.exitCode ?? 0), 100).unref();
    void mongoose;
  });
