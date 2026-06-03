import type { Loose } from "@/lib/db/models/loose";
import type { Metadata } from "next";
import Link from "next/link";
import { Inbox } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { dbConnect } from "@/lib/db/mongoose";
import { Doctor, AppointmentRequest } from "@/lib/db/models";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RequestRow } from "./request-row";

export const metadata: Metadata = { title: "Appointment requests" };
export const dynamic = "force-dynamic";

const STATUSES = ["pending", "seen", "booked", "rejected"] as const;
type Status = (typeof STATUSES)[number];

interface RequestLean {
  _id: string;
  status: Status;
  patientName: string;
  patientPhone: string;
  chamberName: string | null;
  preferredDate: string;
  preferredTimeWindow: "morning" | "afternoon" | "evening";
  reason: string | null;
  createdAt: string;
}

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const activeStatus: Status = STATUSES.includes(sp.status as Status)
    ? (sp.status as Status)
    : "pending";

  const session = await auth();
  await dbConnect();
  const doctorDoc = await Doctor.findOne({ ownerId: session!.user.id })
    .select("_id slug name isClaimed")
    .lean<{
      _id: unknown;
      slug: string;
      name: { displayName: string; prefix: string };
      isClaimed: boolean;
    } | null>();

  if (!doctorDoc) {
    return (
      <div className="space-y-4">
        <PageHeader />
        <Card>
          <CardHeader>
            <CardTitle>No profile yet</CardTitle>
            <CardDescription>Finish your profile before patients can reach you.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Count per status — drives the filter chips.
  const counts = await (AppointmentRequest as unknown as Loose).aggregate([
    { $match: { doctorId: doctorDoc._id } },
    { $group: { _id: "$status", n: { $sum: 1 } } },
  ]);
  const countMap = new Map<Status, number>();
  for (const row of counts as { _id: Status; n: number }[]) countMap.set(row._id, row.n);

  const rowsRaw = await (AppointmentRequest as unknown as Loose)
    .find({ doctorId: doctorDoc._id, status: activeStatus })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
  const rows = (rowsRaw as unknown[]).map((r) =>
    JSON.parse(JSON.stringify(r)),
  ) as RequestLean[];

  const doctorName = doctorDoc.name.displayName;

  return (
    <div className="space-y-4">
      <PageHeader />

      {!doctorDoc.isClaimed ? (
        <Card>
          <CardHeader>
            <CardTitle>Pending admin approval</CardTitle>
            <CardDescription>
              Patients can&apos;t request appointments yet. Once admin approves your account, the
              form will appear on your public profile.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-1">
        {STATUSES.map((s) => {
          const n = countMap.get(s) ?? 0;
          const active = s === activeStatus;
          return (
            <Link
              key={s}
              href={`/dashboard/requests?status=${s}`}
              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-foreground hover:bg-accent"
              }`}
            >
              <span className="capitalize">{s}</span>
              <span
                className={`min-w-[18px] rounded-full px-1.5 text-center ${
                  active ? "bg-primary-foreground/20" : "bg-muted"
                }`}
              >
                {n}
              </span>
            </Link>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardHeader className="flex items-start gap-3 sm:flex-row sm:items-center">
            <Inbox className="size-5 text-muted-foreground" aria-hidden="true" />
            <div>
              <CardTitle>No {activeStatus} requests</CardTitle>
              <CardDescription>
                {activeStatus === "pending"
                  ? "When a patient submits a request from your public profile, it shows up here."
                  : `Nothing in the ${activeStatus} bucket right now.`}
              </CardDescription>
            </div>
          </CardHeader>
        </Card>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <RequestRow key={r._id} request={r} doctorName={doctorName} />
          ))}
        </ul>
      )}
    </div>
  );
}

function PageHeader() {
  return (
    <header>
      <h1 className="text-2xl font-bold tracking-tight text-foreground">Appointment requests</h1>
      <p className="text-sm text-muted-foreground">
        Patient-initiated requests from your public profile. Reply on WhatsApp to confirm timing.
      </p>
    </header>
  );
}
