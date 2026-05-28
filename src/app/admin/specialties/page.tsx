import type { Metadata } from "next";
import { dbConnect } from "@/lib/db/mongoose";
import { Specialty } from "@/lib/db/models";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export const metadata: Metadata = { title: "Admin · Specialties" };
export const dynamic = "force-dynamic";

export default async function AdminSpecialtiesPage() {
  await dbConnect();
  const rows = await (Specialty as unknown as { find: Function })
    .find({})
    .sort({ sortOrder: 1, name: 1 })
    .lean();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Specialties</h1>
        <p className="text-sm text-muted-foreground">Master list of medical specialties — seeded with 20 BD-relevant entries.</p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>{rows.length} specialties</CardTitle>
          <CardDescription>
            Add/edit/disable functionality lives in the seed script today. A UI editor is on the v2 roadmap; until then,
            edit <code>scripts/seed.ts</code> and re-run <code>npm run seed</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-2">Name</th>
                <th>Bangla</th>
                <th>SNOMED</th>
                <th>Slug</th>
                <th>Active</th>
              </tr>
            </thead>
            <tbody>
              {(rows as { name: string; nameBangla?: string; snomedCode?: string; slug: string; active: boolean }[]).map(
                (s) => (
                  <tr key={s.slug} className="border-t border-border">
                    <td className="py-2 font-medium">{s.name}</td>
                    <td>{s.nameBangla ?? "—"}</td>
                    <td className="text-muted-foreground">{s.snomedCode ?? "—"}</td>
                    <td className="text-muted-foreground">/{s.slug}</td>
                    <td>{s.active ? "Yes" : "No"}</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
