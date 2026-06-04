import type { Metadata } from "next";
import { dbConnect } from "@/lib/db/mongoose";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listPendingIdentityRequests } from "@/lib/db/queries/admin";
import { PageHeader } from "@/components/admin/page-header";
import { IdentityReviewRow } from "./review-row";

export const metadata: Metadata = { title: "Admin · Account verifications" };
export const dynamic = "force-dynamic";

export default async function AdminAccountVerifications() {
  await dbConnect();
  const now = new Date();
  const { items, buckets } = await listPendingIdentityRequests(now);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Account verification queue"
        description={`24-hour verification SLA · ${items.length} pending`}
        breadcrumb={[{ label: "Account verifications" }]}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <BucketTile label="Breached" count={buckets.breached} tone="red" />
        <BucketTile label="<6h left" count={buckets.lt6h} tone="red" />
        <BucketTile label="6–12h left" count={buckets.lt12h} tone="amber" />
        <BucketTile label=">12h left" count={buckets.gt12h} tone="green" />
      </div>

      {items.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Inbox zero</CardTitle>
            <CardDescription>No pending account verification requests.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ul className="space-y-3">
          {items.map((c) => (
            <li key={c._id}>
              <IdentityReviewRow request={c} nowIso={now.toISOString()} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BucketTile({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: "red" | "amber" | "green";
}) {
  const colors = {
    red: "border-red-200 bg-red-50 text-red-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    green: "border-emerald-200 bg-emerald-50 text-emerald-900",
  }[tone];
  return (
    <div className={`rounded-lg border p-3 ${colors}`}>
      <p className="text-xs font-medium uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{count}</p>
    </div>
  );
}
