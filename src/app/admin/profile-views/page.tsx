import type { Loose } from "@/lib/db/models/loose";
import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, Eye, Users, Bot } from "lucide-react";
import { dbConnect } from "@/lib/db/mongoose";
import { Doctor } from "@/lib/db/models";
import { listDoctorsByViews } from "@/lib/db/queries/admin";
import { PageHeader } from "@/components/admin/page-header";
import { StatBox } from "@/components/admin/stat-box";
import { Pagination } from "@/components/search/pagination";

export const metadata: Metadata = { title: "Admin · Profile views" };
export const dynamic = "force-dynamic";

const num = (n: number) => Intl.NumberFormat("en-IN").format(n);

export default async function AdminProfileViewsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; status?: string; crawled?: string; page?: string }>;
}) {
  const sp = await searchParams;

  const [{ doctors, total, page, pageSize, totalPages }, totalDoctors, sums, crawledCount] =
    await Promise.all([
      listDoctorsByViews({
        sort: sp.sort,
        status: sp.status,
        crawled: sp.crawled,
        page: Number(sp.page) || 1,
      }),
      (async () => {
        await dbConnect();
        return (await (Doctor as unknown as Loose).countDocuments({})) as number;
      })(),
      (async () => {
        await dbConnect();
        const rows = (await (Doctor as unknown as Loose).aggregate([
          {
            $group: {
              _id: null,
              human: { $sum: "$profileViews" },
              bot: { $sum: "$botViews" },
            },
          },
        ])) as { human: number; bot: number }[];
        return { human: rows[0]?.human ?? 0, bot: rows[0]?.bot ?? 0 };
      })(),
      (async () => {
        await dbConnect();
        return (await (Doctor as unknown as Loose).countDocuments({ botViews: { $gt: 0 } })) as number;
      })(),
    ]);

  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(total, (page - 1) * pageSize + doctors.length);
  const notCrawled = totalDoctors - crawledCount;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Profile views"
        description={
          total === 0
            ? "No doctors match this filter."
            : `Showing ${num(rangeStart)}–${num(rangeEnd)} of ${num(total)} doctors`
        }
        breadcrumb={[{ label: "Profile views" }]}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatBox
          tone="primary"
          value={num(totalDoctors)}
          label="Total profiles"
          icon={Users}
          href="/admin/doctors"
          hrefLabel="Browse all"
        />
        <StatBox
          tone="emerald"
          value={num(sums.human)}
          label="Real (human) views"
          icon={Eye}
        />
        <StatBox
          tone="slate"
          value={num(sums.bot)}
          label="Bot / crawler views"
          icon={Bot}
        />
        <StatBox
          tone="amber"
          value={`${num(crawledCount)} / ${num(notCrawled)}`}
          label="Profiles crawled / not crawled"
          icon={Bot}
          href="/admin/profile-views?crawled=false"
          hrefLabel="See never-crawled"
        />
      </div>

      <form className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-sm">
        <select
          name="sort"
          defaultValue={sp.sort ?? "all"}
          className="h-9 min-w-48 rounded-md border border-input bg-background px-3"
        >
          <option value="all">Most viewed — humans (all-time)</option>
          <option value="30d">Most viewed — humans (30 days)</option>
          <option value="recent">Recently viewed (human)</option>
          <option value="bots">Most crawled by bots</option>
        </select>
        <select
          name="status"
          defaultValue={sp.status ?? ""}
          className="h-9 rounded-md border border-input bg-background px-3"
        >
          <option value="">Any status</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="suspended">Suspended</option>
        </select>
        <select
          name="crawled"
          defaultValue={sp.crawled ?? ""}
          className="h-9 rounded-md border border-input bg-background px-3"
        >
          <option value="">Any crawl status</option>
          <option value="true">Crawled by a bot</option>
          <option value="false">Never crawled</option>
        </select>
        <button className="rounded-md bg-primary px-3 text-primary-foreground">Apply</button>
      </form>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Doctor</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Human views</th>
                <th className="px-4 py-3 text-right">Human (30d)</th>
                <th className="px-4 py-3 text-right">Bot crawls</th>
                <th className="px-4 py-3 text-center">Crawled?</th>
                <th className="px-4 py-3 text-right">Last human view</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {doctors.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">
                    No doctors to show.
                  </td>
                </tr>
              ) : (
                doctors.map((d) => {
                  const lastViewed = d.metrics?.lastViewedAt;
                  const bots = d.botViews ?? 0;
                  return (
                    <tr key={d.slug} className="hover:bg-slate-50">
                      <td className="px-4 py-2">
                        <Link
                          href={`/${d.slug}`}
                          target="_blank"
                          className="inline-flex items-center gap-1 font-medium hover:underline"
                        >
                          {d.name.displayName}
                          <ExternalLink className="size-3.5" aria-hidden="true" />
                        </Link>
                      </td>
                      <td className="px-4 py-2 capitalize">{d.status}</td>
                      <td className="px-4 py-2 text-right font-medium tabular-nums">
                        {num(d.profileViews ?? 0)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {num(d.metrics?.profileViews30d ?? 0)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-500">{num(bots)}</td>
                      <td className="px-4 py-2 text-center">
                        {bots > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                            <Bot className="size-3" aria-hidden="true" /> yes
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400">no</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right text-muted-foreground">
                        {lastViewed ? new Date(lastViewed).toLocaleString() : "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination page={page} totalPages={totalPages} searchParams={sp} />
    </div>
  );
}
