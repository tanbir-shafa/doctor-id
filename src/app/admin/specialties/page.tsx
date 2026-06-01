import type { Metadata } from "next";
import { dbConnect } from "@/lib/db/mongoose";
import { Specialty } from "@/lib/db/models";
import { PageHeader } from "@/components/admin/page-header";

export const metadata: Metadata = { title: "Admin · Specialties" };
export const dynamic = "force-dynamic";

export default async function AdminSpecialtiesPage() {
  await dbConnect();
  const rows = (await (Specialty as unknown as { find: Function })
    .find({})
    .sort({ sortOrder: 1, name: 1 })
    .lean()) as {
    name: string;
    nameBangla?: string;
    snomedCode?: string;
    slug: string;
    active: boolean;
  }[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Specialties"
        description={`${rows.length} specialties · master list seeded with 20 BD-relevant entries.`}
        breadcrumb={[{ label: "Specialties" }]}
      />

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
          Add / edit / disable currently lives in <code>scripts/seed.ts</code>. A UI editor is a v2
          ticket; until then, update the seed and re-run <code>npm run seed</code>.
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Bangla</th>
                <th className="px-4 py-3">SNOMED</th>
                <th className="px-4 py-3">Slug</th>
                <th className="px-4 py-3">Active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((s) => (
                <tr key={s.slug} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-medium">{s.name}</td>
                  <td className="px-4 py-2">{s.nameBangla ?? "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground">{s.snomedCode ?? "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground">/{s.slug}</td>
                  <td className="px-4 py-2">
                    {s.active ? (
                      <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                        Inactive
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
