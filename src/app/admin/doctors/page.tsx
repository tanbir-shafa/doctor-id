import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { dbConnect } from "@/lib/db/mongoose";
import { Doctor } from "@/lib/db/models";
import { VerifiedBadge } from "@/components/profile/verified-badge";
import { SuspendButton } from "./suspend-button";
import type { DoctorDocLike } from "@/types/doctor";

export const metadata: Metadata = { title: "Admin · Doctors" };
export const dynamic = "force-dynamic";

export default async function AdminDoctorsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; claimed?: string }>;
}) {
  const sp = await searchParams;
  await dbConnect();

  const filter: Record<string, unknown> = {};
  if (sp.status) filter.status = sp.status;
  if (sp.claimed === "true") filter.isClaimed = true;
  if (sp.claimed === "false") filter.isClaimed = false;
  if (sp.q) filter.$text = { $search: sp.q };

  const rows = await (Doctor as unknown as { find: Function })
    .find(filter)
    .sort({ updatedAt: -1 })
    .limit(100)
    .lean();
  const doctors = (rows as unknown[]).map((d) => JSON.parse(JSON.stringify(d))) as DoctorDocLike[];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Doctors</h1>
        <p className="text-sm text-muted-foreground">{doctors.length} shown (max 100)</p>
      </header>

      <form className="flex flex-wrap gap-2 text-sm">
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Search…"
          className="h-9 min-w-56 rounded-md border border-input bg-background px-3"
        />
        <select name="status" defaultValue={sp.status ?? ""} className="h-9 rounded-md border border-input bg-background px-3">
          <option value="">Any status</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="suspended">Suspended</option>
        </select>
        <select name="claimed" defaultValue={sp.claimed ?? ""} className="h-9 rounded-md border border-input bg-background px-3">
          <option value="">Any claim status</option>
          <option value="true">Claimed</option>
          <option value="false">Unclaimed</option>
        </select>
        <button className="rounded-md bg-primary px-3 text-primary-foreground">Apply</button>
      </form>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left">
            <tr>
              <th className="p-2">Name</th>
              <th className="p-2">BMDC</th>
              <th className="p-2">Verification</th>
              <th className="p-2">Status</th>
              <th className="p-2">Claimed</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {doctors.map((d) => (
              <tr key={d.slug} className="border-t border-border">
                <td className="p-2">
                  <Link href={`/${d.slug}`} target="_blank" className="inline-flex items-center gap-1 hover:underline">
                    {d.name.displayName}
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                  </Link>
                </td>
                <td className="p-2 text-muted-foreground">{d.bmdcNumber ?? "—"}</td>
                <td className="p-2">
                  <VerifiedBadge level={d.verificationLevel} />
                </td>
                <td className="p-2">{d.status}</td>
                <td className="p-2">{d.isClaimed ? "Yes" : "No"}</td>
                <td className="p-2">
                  {d.status !== "suspended" ? <SuspendButton slug={d.slug} /> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
