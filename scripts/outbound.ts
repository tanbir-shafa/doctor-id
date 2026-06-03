/**
 * Bulk outbound SMS acquisition script — A.8.
 *
 * Usage:
 *   npm run outbound -- --campaign=2026-w22-rxpad --template=en-claim-rx-pad
 *     [--cohort=city=Dhaka,specialty=Cardiology]
 *     [--limit=N]
 *     [--dry-run]
 *
 * Pipeline:
 *   1. Load unclaimed `published` doctors matching cohort filters.
 *   2. Skip doctors with no normalized phone (no point messaging).
 *   3. Skip phones on the OptOut list (single `$in` query).
 *   4. Skip doctors already messaged with this template in the last 7 days
 *      (idempotency — `(doctorId, templateId, sentAt within 7d)`).
 *   5. Render the template against each doctor's context.
 *   6. Hand the batch to `sendSmsBatch`, which groups identical bodies and
 *      chunks 20-per-call to honor MDL's per-call cap.
 *   7. Persist one `OutboundMessage` row per recipient with the final
 *      status (sent / failed / opted_out / skipped).
 *
 * Refuses to run when NODE_ENV=production unless `--force-prod` (mirrors
 * the seed script's guardrail).
 */

import mongoose from "mongoose";
import { dbConnect, dbDisconnect } from "@/lib/db/mongoose";
import { Doctor, OutboundMessage, OptOut } from "@/lib/db/models";
import { sendSmsBatch, type BulkSmsResult } from "@/lib/sms/client";
import { normalizeBdPhone } from "@/lib/utils/phone";
import {
  OUTBOUND_TEMPLATES,
  renderTemplate,
  segmentCount,
  hasUnresolvedPlaceholders,
} from "@/lib/outbound/templates";

if (process.env.NODE_ENV === "production" && !process.argv.includes("--force-prod")) {
  console.error("Refusing to run in production without --force-prod.");
  process.exit(1);
}

interface CliArgs {
  campaign: string | null;
  template: string | null;
  cohort: Record<string, string>;
  limit: number | null;
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { campaign: null, template: null, cohort: {}, limit: null, dryRun: false };
  for (const a of argv) {
    if (a === "--dry-run") args.dryRun = true;
    else if (a.startsWith("--campaign=")) args.campaign = a.slice("--campaign=".length);
    else if (a.startsWith("--template=")) args.template = a.slice("--template=".length);
    else if (a.startsWith("--limit=")) {
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
  contact?: { publicPhone?: string | null };
  specialties?: Array<{ name?: string; isPrimary?: boolean }>;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const template = OUTBOUND_TEMPLATES[args.template!];
  if (!template) {
    throw new Error(
      `Unknown template "${args.template}". Available: ${Object.keys(OUTBOUND_TEMPLATES).join(", ")}`,
    );
  }

  console.log(`→ Campaign: ${args.campaign}`);
  console.log(`→ Template: ${template.id} (${template.language}, ${template.personalized ? "personalized" : "broadcast"})`);
  if (args.dryRun) console.log("  (dry-run: no API calls, no DB writes)");

  await dbConnect();

  // Build the doctor query.
  const filter: Record<string, unknown> = {
    isClaimed: false,
    status: "published",
    "contact.publicPhone": { $ne: null },
  };
  if (args.cohort.city) filter["chambers.city"] = args.cohort.city;
  if (args.cohort.specialty) filter["specialties.name"] = args.cohort.specialty;

  const query = Doctor.find(filter).select("_id slug name contact specialties");
  if (args.limit) query.limit(args.limit);

  const doctorRows = (await query.lean()) as unknown as DoctorLean[];
  console.log(`→ Cohort matched ${doctorRows.length} unclaimed published doctors`);

  // Normalize phones up front and drop rows with no usable phone.
  const candidates: Array<DoctorLean & { phone: string }> = [];
  let skippedNoPhone = 0;
  for (const d of doctorRows) {
    const phone = normalizeBdPhone(d.contact?.publicPhone ?? null);
    if (!phone) {
      skippedNoPhone++;
      continue;
    }
    candidates.push({ ...d, phone });
  }

  // Single-query opt-out lookup.
  const phones = candidates.map((c) => c.phone);
  const optedOut = new Set<string>(
    phones.length
      ? (
          ((await OptOut.find({ phone: { $in: phones } }).select("phone").lean()) as Array<{
            phone: string;
          }>) ?? []
        ).map((r) => r.phone)
      : [],
  );

  // 7-day idempotency lookup — exclude doctors we already messaged on this
  // template recently. One query batched on doctorId.
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const doctorIds = candidates.map((c) => c._id as mongoose.Types.ObjectId);
  const recentRows = doctorIds.length
    ? ((await OutboundMessage.find({
        doctorId: { $in: doctorIds as never },
        templateId: template.id,
        sentAt: { $gte: sevenDaysAgo },
      })
        .select("doctorId")
        .lean()) as Array<{ doctorId: unknown }>)
    : [];
  const recentlyMessaged = new Set<string>(recentRows.map((r) => String(r.doctorId)));

  // Build the message list. Status defaults per row reflect what would
  // happen at send time; we'll persist these explicitly so the dashboard
  // shows the funnel.
  type Row = {
    doctor: DoctorLean & { phone: string };
    body: string;
    status: "queued" | "opted_out" | "skipped";
  };
  const rows: Row[] = candidates.map((d) => {
    if (optedOut.has(d.phone)) return { doctor: d, body: "", status: "opted_out" };
    if (recentlyMessaged.has(String(d._id))) return { doctor: d, body: "", status: "skipped" };
    const body = renderTemplate(template.body, {
      firstName: d.name.first,
      lastName: d.name.last,
      displayName: d.name.displayName,
      slug: d.slug,
      specialty: d.specialties?.find((s) => s.isPrimary)?.name ?? d.specialties?.[0]?.name ?? "",
    });
    return { doctor: d, body, status: "queued" };
  });

  const queued = rows.filter((r) => r.status === "queued");
  const segPreview = queued[0] ? segmentCount(queued[0].body) : { unicode: false, segments: 0 };
  const distinctBodies = new Set(queued.map((r) => r.body)).size;
  const calls = Math.ceil(distinctBodies / 1) * Math.ceil(queued.length / Math.max(distinctBodies, 1) / 20);

  console.log(`→ Skipped (no phone):     ${skippedNoPhone}`);
  console.log(`→ Skipped (opt-out):      ${rows.filter((r) => r.status === "opted_out").length}`);
  console.log(`→ Skipped (recently sent):${rows.filter((r) => r.status === "skipped").length}`);
  console.log(`→ Queued to send:         ${queued.length}`);
  console.log(
    `→ Body groups: ${distinctBodies} (${template.personalized ? "personalized" : "shared body"}) · ~${calls} MDL call(s) · ${segPreview.segments} segment${segPreview.segments === 1 ? "" : "s"}/SMS (${segPreview.unicode ? "Unicode" : "ASCII"})`,
  );

  // Guard: don't ship campaigns with unresolved placeholders.
  const broken = queued.find((r) => hasUnresolvedPlaceholders(r.body));
  if (broken) {
    console.error(
      `✗ Template has unresolved placeholders. Sample body: ${JSON.stringify(broken.body)}`,
    );
    process.exitCode = 1;
    return;
  }

  if (args.dryRun) {
    if (queued[0]) {
      console.log("\nSample rendered body:");
      console.log("  " + queued[0].body);
    }
    console.log("\n(dry-run complete — no SMS sent, no rows written)");
    return;
  }

  // Persist skipped + opted_out rows first so the dashboard reflects the
  // full funnel even when zero sends actually happen.
  if (rows.length > 0) {
    const nonQueued = rows.filter((r) => r.status !== "queued");
    if (nonQueued.length > 0) {
      await OutboundMessage.insertMany(
        nonQueued.map((r) => ({
          doctorId: r.doctor._id,
          campaignId: args.campaign,
          templateId: template.id,
          channel: "sms" as const,
          body: r.body || "(no body — skipped before render)",
          to: r.doctor.phone,
          status: r.status,
        })),
      );
    }
  }

  if (queued.length === 0) {
    console.log("Nothing to send.");
    return;
  }

  console.log(`\n→ Dispatching ${queued.length} SMS via MDL (chunked)…`);
  const sendResults: BulkSmsResult[] = await sendSmsBatch(
    queued.map((r) => ({ to: r.doctor.phone, body: r.body })),
  );

  // Persist one row per queued recipient with the final status.
  const docs = queued.map((r, i) => {
    const result = sendResults[i]!;
    return {
      doctorId: r.doctor._id,
      campaignId: args.campaign,
      templateId: template.id,
      channel: "sms" as const,
      body: r.body,
      to: r.doctor.phone,
      status: result.sent ? "sent" : "failed",
      sentAt: result.sent ? new Date() : null,
      errorMessage: result.errorMessage ?? null,
      batchId: result.batchId,
    };
  });
  await OutboundMessage.insertMany(docs);

  const sent = sendResults.filter((r) => r.sent).length;
  const failed = sendResults.length - sent;
  console.log("\n✓ Run complete:");
  console.table({
    queued: queued.length,
    sent,
    failed,
    optedOut: rows.filter((r) => r.status === "opted_out").length,
    skipped: rows.filter((r) => r.status === "skipped").length,
    skippedNoPhone,
  });
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
