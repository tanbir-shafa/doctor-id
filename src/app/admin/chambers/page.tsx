import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, MapPin, Pencil, Star } from "lucide-react";
import { listChambersForAdmin } from "@/lib/db/queries/admin";
import { PageHeader } from "@/components/admin/page-header";
import { Pagination } from "@/components/search/pagination";
import { BD_DIVISIONS, BD_DISTRICTS } from "@/lib/geo/bd-districts";
import { DeleteChamberButton } from "./delete-chamber-button";

export const metadata: Metadata = { title: "Admin · Chambers" };
export const dynamic = "force-dynamic";

/**
 * Global chamber oversight — flattens every doctor's embedded `chambers[]` into
 * one searchable/filterable table. Browse + delete happen here; "Edit" deep-links
 * into the rich per-doctor editor (anchored at its Chambers section), which stays
 * the single validated/audited write surface for the whole array.
 */
export default async function AdminChambersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    division?: string;
    district?: string;
    status?: string;
    page?: string;
  }>;
}) {
  const sp = await searchParams;

  const { chambers, total, page, pageSize, totalPages } = await listChambersForAdmin({
    q: sp.q,
    division: sp.division,
    district: sp.district,
    status: sp.status,
    page: Number(sp.page) || 1,
  });

  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(total, (page - 1) * pageSize + chambers.length);

  // Districts grouped by division feed the filter dropdown's <optgroup>s.
  const districtsByDivision = BD_DIVISIONS.map((division) => ({
    division,
    districts: BD_DISTRICTS.filter((d) => d.division === division).map((d) => d.name),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Chambers"
        description={
          total === 0
            ? "No chambers match these filters."
            : `Showing ${rangeStart.toLocaleString()}–${rangeEnd.toLocaleString()} of ${total.toLocaleString()} chambers`
        }
        breadcrumb={[{ label: "Chambers" }]}
      />

      <form className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-sm">
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Search chamber or doctor…"
          className="h-9 min-w-56 rounded-md border border-input bg-background px-3"
        />
        <select
          name="division"
          defaultValue={sp.division ?? ""}
          className="h-9 min-w-40 rounded-md border border-input bg-background px-3"
        >
          <option value="">Any division</option>
          {BD_DIVISIONS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select
          name="district"
          defaultValue={sp.district ?? ""}
          className="h-9 min-w-44 rounded-md border border-input bg-background px-3"
        >
          <option value="">Any district</option>
          {districtsByDivision.map((g) => (
            <optgroup key={g.division} label={g.division}>
              {g.districts.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <select
          name="status"
          defaultValue={sp.status ?? ""}
          className="h-9 rounded-md border border-input bg-background px-3"
        >
          <option value="">Any doctor status</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
          <option value="suspended">Suspended</option>
        </select>
        <button className="rounded-md bg-primary px-3 text-primary-foreground">Apply</button>
      </form>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Chamber</th>
                <th className="px-4 py-3">Doctor</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Fee</th>
                <th className="px-4 py-3">Schedule</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {chambers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    No chambers found.
                  </td>
                </tr>
              ) : (
                chambers.map((c) => (
                  <tr key={c.chamberId} className="hover:bg-slate-50">
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{c.name}</span>
                        {c.isPrimary ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                            <Star className="size-2.5" aria-hidden="true" /> Primary
                          </span>
                        ) : null}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {c.area}
                        {c.floor ? ` · Floor ${c.floor}` : ""}
                        {c.room ? ` · Room ${c.room}` : ""}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <Link
                        href={`/${c.slug}`}
                        target="_blank"
                        className="inline-flex items-center gap-1 font-medium hover:underline"
                      >
                        {c.doctorName}
                        <ExternalLink className="size-3.5" aria-hidden="true" />
                      </Link>
                      <div className="text-xs capitalize text-muted-foreground">{c.doctorStatus}</div>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-1">
                        <MapPin className="size-3.5 text-slate-400" aria-hidden="true" />
                        <span>{c.district}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">{c.division}</div>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{c.phone || "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {c.consultationFee && c.consultationFee.amount > 0
                        ? `${c.consultationFee.amount.toLocaleString()} ${c.consultationFee.currency}`
                        : "—"}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {c.scheduleCount > 0
                        ? `${c.scheduleCount} slot${c.scheduleCount > 1 ? "s" : ""}`
                        : "—"}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <Link
                          href={`/admin/doctors/${c.slug}/edit#chambers`}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <Pencil className="size-3" aria-hidden="true" />
                          Edit
                        </Link>
                        <DeleteChamberButton
                          doctorId={c.doctorId}
                          chamberId={c.chamberId}
                          chamberName={c.name}
                        />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination page={page} totalPages={totalPages} searchParams={sp} />
    </div>
  );
}
