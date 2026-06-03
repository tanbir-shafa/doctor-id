import type { Loose } from "@/lib/db/models/loose";
import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, Pencil } from "lucide-react";
import { dbConnect } from "@/lib/db/mongoose";
import { Specialty } from "@/lib/db/models";
import { listDoctorsForAdmin } from "@/lib/db/queries/admin";
import { VerifiedBadge } from "@/components/profile/verified-badge";
import { PageHeader } from "@/components/admin/page-header";
import { Pagination } from "@/components/search/pagination";
import { SuspendButton } from "./suspend-button";

export const metadata: Metadata = { title: "Admin · Doctors" };
export const dynamic = "force-dynamic";

export default async function AdminDoctorsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    claimed?: string;
    specialty?: string;
    reviewGroup?: string;
    page?: string;
  }>;
}) {
  const sp = await searchParams;
  const reviewGroup = sp.reviewGroup === "true";

  const [{ doctors, total, page, pageSize, totalPages }, specialtyRows] = await Promise.all([
    listDoctorsForAdmin({
      q: sp.q,
      status: sp.status,
      claimed: sp.claimed,
      specialty: sp.specialty,
      reviewGroup,
      page: Number(sp.page) || 1,
    }),
    // Catalog feeds the filter dropdown. Connection is already pooled, this is
    // a tiny query (~36 rows) and we want the names sorted A→Z.
    (async () => {
      await dbConnect();
      return (await (Specialty as unknown as Loose)
        .find({ active: true })
        .sort({ name: 1 })
        .select("name")
        .lean()) as { name: string }[];
    })(),
  ]);

  const specialtyOptions = specialtyRows.map((s) => s.name);

  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(total, (page - 1) * pageSize + doctors.length);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Doctors"
        description={
          total === 0
            ? "No doctors match these filters."
            : `Showing ${rangeStart.toLocaleString()}–${rangeEnd.toLocaleString()} of ${total.toLocaleString()} doctors`
        }
        breadcrumb={[{ label: "Doctors" }]}
      />

      <form className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-sm">
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Search…"
          className="h-9 min-w-56 rounded-md border border-input bg-background px-3"
        />
        <select
          name="specialty"
          defaultValue={sp.specialty ?? ""}
          className="h-9 min-w-44 rounded-md border border-input bg-background px-3"
        >
          <option value="">Any specialty</option>
          {specialtyOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
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
          name="claimed"
          defaultValue={sp.claimed ?? ""}
          className="h-9 rounded-md border border-input bg-background px-3"
        >
          <option value="">Any claim status</option>
          <option value="true">Claimed</option>
          <option value="false">Unclaimed</option>
        </select>
        <label className="inline-flex items-center gap-2 px-2 text-xs text-slate-700">
          <input
            type="checkbox"
            name="reviewGroup"
            value="true"
            defaultChecked={reviewGroup}
            className="size-4 rounded border-input"
          />
          Pending duplicate review only
        </label>
        <button className="rounded-md bg-primary px-3 text-primary-foreground">Apply</button>
      </form>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Specialty</th>
                <th className="px-4 py-3">BMDC</th>
                <th className="px-4 py-3">Verification</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Claimed</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {doctors.map((d) => {
                const primary = d.specialties?.find((s) => s.isPrimary) ?? d.specialties?.[0];
                const extra = (d.specialties?.length ?? 0) - 1;
                return (
                  <tr key={d.slug} className="hover:bg-slate-50">
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/${d.slug}`}
                          target="_blank"
                          className="inline-flex items-center gap-1 font-medium hover:underline"
                        >
                          {d.name.displayName}
                          <ExternalLink className="size-3.5" aria-hidden="true" />
                        </Link>
                        {d.dupReviewGroup ? (
                          <span
                            title={`Pending duplicate-review group: ${d.dupReviewGroup}`}
                            className="rounded-full bg-amber-100 px-2 py-0.5 font-mono text-[10px] font-medium text-amber-800"
                          >
                            dup: {d.dupReviewGroup.length > 24 ? `${d.dupReviewGroup.slice(0, 22)}…` : d.dupReviewGroup}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      {primary ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="text-foreground">{primary.name}</span>
                          {extra > 0 ? (
                            <span
                              className="rounded-full bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600"
                              title={d.specialties.map((s) => s.name).join(", ")}
                            >
                              +{extra}
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{d.bmdcNumber ?? "—"}</td>
                    <td className="px-4 py-2">
                      <VerifiedBadge level={d.verificationLevel} />
                    </td>
                    <td className="px-4 py-2 capitalize">{d.status}</td>
                    <td className="px-4 py-2">{d.isClaimed ? "Yes" : "No"}</td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <Link
                          href={`/admin/doctors/${d.slug}/edit`}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <Pencil className="size-3" aria-hidden="true" />
                          Edit
                        </Link>
                        {d.status !== "suspended" ? <SuspendButton slug={d.slug} /> : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination page={page} totalPages={totalPages} searchParams={sp} />
    </div>
  );
}
