import type { Loose } from "@/lib/db/models/loose";
import type { Metadata } from "next";
import Link from "next/link";
import { Inbox, ExternalLink } from "lucide-react";
import { dbConnect } from "@/lib/db/mongoose";
import { User, Doctor } from "@/lib/db/models";
import { PageHeader } from "@/components/admin/page-header";
import { MarkReadyForm } from "./mark-ready-form";

export const metadata: Metadata = { title: "Admin · EMR queue" };
export const dynamic = "force-dynamic";

interface PendingUser {
  _id: string;
  email: string;
  phone: string | null;
  createdAt: string;
}

interface DoctorLean {
  _id: string;
  slug: string;
  name: { displayName: string; prefix: string };
  ownerId: string;
}

export default async function EmrQueuePage() {
  await dbConnect();

  const pending = (await (User as unknown as Loose)
    .find({ "emr.requested": true, "emr.seatStatus": "pending" })
    .sort({ createdAt: 1 })
    .select("_id email phone createdAt")
    .lean()) as PendingUser[];

  // Pull the matching Doctor row for each pending User so the queue can show
  // their public-profile name + slug. Done as one batched query keyed on
  // `ownerId`.
  const ownerIds = pending.map((u) => u._id);
  const doctors = ownerIds.length
    ? ((await (Doctor as unknown as Loose)
        .find({ ownerId: { $in: ownerIds } })
        .select("_id slug name ownerId")
        .lean()) as DoctorLean[])
    : [];
  const doctorByOwner = new Map<string, DoctorLean>();
  for (const d of doctors) doctorByOwner.set(String(d.ownerId), d);

  return (
    <div className="space-y-6">
      <PageHeader
        title="EMR queue"
        description={`${pending.length} doctor${pending.length === 1 ? "" : "s"} waiting on a free Shafa EMR seat.`}
        breadcrumb={[{ label: "EMR queue" }]}
      />

      {pending.length === 0 ? (
        <section className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          <Inbox className="mx-auto mb-2 size-6 text-slate-400" aria-hidden="true" />
          <p className="font-medium text-slate-700">Inbox zero.</p>
          <p>No doctors are waiting for an EMR seat. New requests appear here as doctors register.</p>
        </section>
      ) : (
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Doctor</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Waiting</th>
                  <th className="px-4 py-3">Mark ready</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pending.map((u) => {
                  const userId = String(u._id);
                  const d = doctorByOwner.get(userId);
                  const isSynthEmail = u.email.endsWith("@phone.daktar.link");
                  const days = Math.max(
                    0,
                    // eslint-disable-next-line react-hooks/purity
                    Math.floor((Date.now() - new Date(u.createdAt).getTime()) / 86400000),
                  );
                  return (
                    <tr key={userId} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        {d ? (
                          <Link
                            href={`/${d.slug}`}
                            target="_blank"
                            className="inline-flex items-center gap-1 font-medium hover:underline"
                          >
                            {d.name.displayName}
                            <ExternalLink className="size-3.5" aria-hidden="true" />
                          </Link>
                        ) : (
                          <span className="italic text-slate-500">no doctor profile</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {u.phone ? (
                          <a href={`tel:${u.phone}`} className="hover:underline">
                            {u.phone}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {isSynthEmail ? (
                          <span className="italic text-slate-400">no email on file</span>
                        ) : (
                          <a href={`mailto:${u.email}`} className="hover:underline">
                            {u.email}
                          </a>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {days === 0 ? "today" : `${days}d`}
                      </td>
                      <td className="px-4 py-3">
                        <MarkReadyForm
                          userId={userId}
                          suggestedEmail={isSynthEmail ? "" : u.email}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
