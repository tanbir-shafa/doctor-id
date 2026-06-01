import type { Metadata } from "next";
import Link from "next/link";
import { Users, ShieldCheck, FileCheck2, Hourglass, ExternalLink } from "lucide-react";
import { dbConnect } from "@/lib/db/mongoose";
import { Doctor, ClaimRequest, User } from "@/lib/db/models";
import { PageHeader } from "@/components/admin/page-header";
import { StatBox } from "@/components/admin/stat-box";
import { classifySla, type SlaTone } from "@/lib/sla";

export const metadata: Metadata = { title: "Admin · Overview" };
export const dynamic = "force-dynamic";

interface RecentClaim {
  _id: string;
  createdAt: string;
  slaExpiresAt: string | null;
  status: string;
  doctorId: { slug: string; name: { displayName: string; prefix: string } } | null;
  requestedBy: { phone?: string | null; email?: string | null } | null;
}

interface RecentDoctor {
  slug: string;
  name: { displayName: string; prefix: string };
  isClaimed: boolean;
  createdAt: string;
}

const TONE_CHIP: Record<SlaTone, string> = {
  red: "bg-rose-100 text-rose-800",
  amber: "bg-amber-100 text-amber-900",
  green: "bg-emerald-100 text-emerald-900",
};

export default async function AdminOverview() {
  await dbConnect();
  const now = new Date();

  const [doctors, published, pendingClaims, doctorUsers, recentClaimsRaw, recentDoctorsRaw] =
    await Promise.all([
      (Doctor as unknown as { countDocuments: Function }).countDocuments({}),
      (Doctor as unknown as { countDocuments: Function }).countDocuments({ status: "published" }),
      (ClaimRequest as unknown as { countDocuments: Function }).countDocuments({ status: "pending" }),
      (User as unknown as { countDocuments: Function }).countDocuments({ role: "doctor" }),
      (ClaimRequest as unknown as { find: Function })
        .find({ status: "pending" })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate("doctorId", "slug name")
        .populate("requestedBy", "phone email")
        .lean(),
      (Doctor as unknown as { find: Function })
        .find({})
        .sort({ createdAt: -1 })
        .limit(5)
        .select("slug name isClaimed createdAt")
        .lean(),
    ]);

  const recentClaims = (recentClaimsRaw as unknown[]).map((c) =>
    JSON.parse(JSON.stringify(c)),
  ) as RecentClaim[];
  const recentDoctors = (recentDoctorsRaw as unknown[]).map((d) =>
    JSON.parse(JSON.stringify(d)),
  ) as RecentDoctor[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description="Operational health at a glance."
        breadcrumb={[{ label: "Overview" }]}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatBox
          tone="primary"
          value={doctors.toLocaleString()}
          label="Total profiles"
          icon={Users}
          href="/admin/doctors"
          hrefLabel="Browse all"
        />
        <StatBox
          tone="emerald"
          value={published.toLocaleString()}
          label="Published"
          icon={FileCheck2}
          href="/admin/doctors?status=published"
          hrefLabel="View published"
        />
        <StatBox
          tone={pendingClaims > 0 ? "rose" : "slate"}
          value={pendingClaims.toLocaleString()}
          label="Pending verifications"
          icon={Hourglass}
          href="/admin/verifications"
          hrefLabel="Open queue"
        />
        <StatBox
          tone="amber"
          value={doctorUsers.toLocaleString()}
          label="Doctor accounts"
          icon={ShieldCheck}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Recent pending verifications */}
        <Panel
          title="Recent pending verifications"
          action={
            <Link
              href="/admin/verifications"
              className="text-xs font-medium text-primary hover:underline"
            >
              Open queue →
            </Link>
          }
        >
          {recentClaims.length === 0 ? (
            <EmptyState>No pending verifications. Inbox zero.</EmptyState>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recentClaims.map((c) => {
                const sla = classifySla(c, now);
                return (
                  <li key={c._id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-800">
                        {c.doctorId?.name?.displayName ?? "Unknown doctor"}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {c.requestedBy?.phone ?? "no phone"}
                        {" · "}submitted {new Date(c.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${TONE_CHIP[sla.tone]}`}
                    >
                      {sla.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        {/* Recently added doctors */}
        <Panel
          title="Recently added doctors"
          action={
            <Link
              href="/admin/doctors"
              className="text-xs font-medium text-primary hover:underline"
            >
              All doctors →
            </Link>
          }
        >
          {recentDoctors.length === 0 ? (
            <EmptyState>No doctors yet.</EmptyState>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recentDoctors.map((d) => (
                <li key={d.slug} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <Link
                      href={`/${d.slug}`}
                      target="_blank"
                      className="inline-flex items-center gap-1 truncate font-medium text-slate-800 hover:underline"
                    >
                      {d.name.displayName}
                      <ExternalLink className="size-3" aria-hidden="true" />
                    </Link>
                    <p className="truncate text-xs text-slate-500">
                      {d.isClaimed ? "claimed" : "unclaimed"}
                      {" · "}added {new Date(d.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-8 text-center text-sm text-slate-500">{children}</div>;
}
