import type { Loose } from "@/lib/db/models/loose";
import type { Metadata } from "next";
import { Send, Inbox, Ban } from "lucide-react";
import { dbConnect } from "@/lib/db/mongoose";
import { OutboundMessage, OptOut } from "@/lib/db/models";
import { PageHeader } from "@/components/admin/page-header";
import { AddOptOutForm, RemoveOptOutButton } from "./opt-out-form";

export const metadata: Metadata = { title: "Admin · Outbound" };
export const dynamic = "force-dynamic";

interface CampaignRow {
  _id: string; // = campaignId
  templates: string[];
  total: number;
  sent: number;
  failed: number;
  optedOut: number;
  skipped: number;
  claimed: number;
  firstSentAt: Date | null;
  lastSentAt: Date | null;
}

interface OptOutRow {
  phone: string;
  reason: string | null;
  createdAt: string;
}

export default async function AdminOutboundPage() {
  await dbConnect();

  // Aggregate per-campaign funnel + claim count.
  const campaignsRaw = (await (OutboundMessage as unknown as Loose).aggregate([
    {
      $group: {
        _id: "$campaignId",
        templates: { $addToSet: "$templateId" },
        total: { $sum: 1 },
        sent: { $sum: { $cond: [{ $eq: ["$status", "sent"] }, 1, 0] } },
        failed: { $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] } },
        optedOut: { $sum: { $cond: [{ $eq: ["$status", "opted_out"] }, 1, 0] } },
        skipped: { $sum: { $cond: [{ $eq: ["$status", "skipped"] }, 1, 0] } },
        claimed: { $sum: { $cond: [{ $ne: ["$claimedAt", null] }, 1, 0] } },
        firstSentAt: { $min: "$sentAt" },
        lastSentAt: { $max: "$sentAt" },
      },
    },
    { $sort: { lastSentAt: -1 } },
  ])) as CampaignRow[];
  const campaigns = (campaignsRaw as unknown[]).map((c) =>
    JSON.parse(JSON.stringify(c)),
  ) as CampaignRow[];

  const optOutsRaw = (await (OptOut as unknown as Loose)
    .find({})
    .sort({ createdAt: -1 })
    .limit(200)
    .lean()) as OptOutRow[];
  const optOuts = (optOutsRaw as unknown[]).map((o) =>
    JSON.parse(JSON.stringify(o)),
  ) as OptOutRow[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Outbound campaigns"
        description="SMS acquisition runs. Dispatch happens via `npm run outbound` — this page is read-only telemetry + the opt-out roster."
        breadcrumb={[{ label: "Outbound" }]}
      />

      {/* Campaigns */}
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Send className="size-4 text-primary" aria-hidden="true" />
            Campaigns ({campaigns.length})
          </div>
          <code className="hidden rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700 sm:inline">
            npm run outbound -- --campaign=&lt;id&gt; --template=&lt;t&gt;
          </code>
        </div>
        {campaigns.length === 0 ? (
          <EmptyState icon={Inbox}>
            No campaigns yet. Run <code>npm run outbound -- --campaign=&lt;id&gt; --template=&lt;t&gt;</code> on the host to start one.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Campaign</th>
                  <th className="px-4 py-3">Template(s)</th>
                  <th className="px-4 py-3 text-right">Sent</th>
                  <th className="px-4 py-3 text-right">Failed</th>
                  <th className="px-4 py-3 text-right">Opted out</th>
                  <th className="px-4 py-3 text-right">Claimed</th>
                  <th className="px-4 py-3 text-right">CTR</th>
                  <th className="px-4 py-3">Last sent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {campaigns.map((c) => {
                  const ctr = c.sent > 0 ? Math.round((c.claimed / c.sent) * 100) : 0;
                  return (
                    <tr key={c._id} className="hover:bg-slate-50">
                      <td className="px-4 py-2 font-medium">{c._id}</td>
                      <td className="px-4 py-2 text-slate-600">{c.templates.join(", ")}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{c.sent}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-rose-700">{c.failed}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{c.optedOut}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-emerald-700">{c.claimed}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{ctr}%</td>
                      <td className="px-4 py-2 text-slate-600">
                        {c.lastSentAt ? new Date(c.lastSentAt).toLocaleString() : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Opt-out roster */}
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Ban className="size-4 text-rose-600" aria-hidden="true" />
            Opt-out roster ({optOuts.length})
          </div>
        </div>
        <div className="border-b border-slate-200 px-4 py-3">
          <AddOptOutForm />
        </div>
        {optOuts.length === 0 ? (
          <EmptyState icon={Ban}>No phones on the opt-out list.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Added</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {optOuts.map((o) => (
                  <tr key={o.phone} className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-mono text-xs">{o.phone}</td>
                    <td className="px-4 py-2 text-slate-600">
                      {o.reason ?? <span className="italic text-slate-400">no reason</span>}
                    </td>
                    <td className="px-4 py-2 text-slate-600">
                      {new Date(o.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <RemoveOptOutButton phone={o.phone} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-slate-500">
      <Icon className="size-5 text-slate-400" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
