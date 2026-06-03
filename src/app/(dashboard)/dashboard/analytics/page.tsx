import type { Loose } from "@/lib/db/models/loose";
import type { Metadata } from "next";
import { auth } from "@/lib/auth/config";
import { dbConnect } from "@/lib/db/mongoose";
import { Doctor, ProfileView } from "@/lib/db/models";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Analytics" };
export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const session = await auth();
  await dbConnect();
  const doctorRaw = await Doctor.findOne({ ownerId: session!.user.id })
    .select("_id slug profileViews")
    .lean();
  if (!doctorRaw) return <p>No profile found.</p>;
  const doctor = doctorRaw as unknown as { _id: unknown; slug: string; profileViews?: number };

  // eslint-disable-next-line react-hooks/purity
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Aggregate daily counts + top referrers in one pipeline so we make a single
  // round trip instead of two.
  const [dailyResult, referrers] = await Promise.all([
    (ProfileView as unknown as Loose).aggregate([
      { $match: { doctorId: doctor._id, viewedAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$viewedAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    (ProfileView as unknown as Loose).aggregate([
      { $match: { doctorId: doctor._id, viewedAt: { $gte: since }, referrer: { $ne: null } } },
      { $group: { _id: "$referrer", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
  ]);

  const daily = dailyResult as { _id: string; count: number }[];
  const maxCount = Math.max(1, ...daily.map((d) => d.count));
  const total30 = daily.reduce((acc, d) => acc + d.count, 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Profile insights</h1>
        <p className="text-sm text-muted-foreground">Last 30 days, public profile views.</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardDescription>30-day views</CardDescription><CardTitle className="text-3xl">{total30}</CardTitle></CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>All-time</CardDescription><CardTitle className="text-3xl">{doctor.profileViews ?? 0}</CardTitle></CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Daily avg</CardDescription><CardTitle className="text-3xl">{Math.round(total30 / 30)}</CardTitle></CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Daily views</CardTitle></CardHeader>
        <CardContent>
          {daily.length === 0 ? (
            <p className="text-sm text-muted-foreground">No views yet in the last 30 days.</p>
          ) : (
            <ul className="flex h-40 items-end gap-1">
              {daily.map((d) => (
                <li
                  key={d._id}
                  title={`${d._id}: ${d.count}`}
                  className="flex-1 rounded-t bg-primary/80"
                  style={{ height: `${(d.count / maxCount) * 100}%` }}
                  aria-label={`${d._id}: ${d.count} views`}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Top referrers</CardTitle></CardHeader>
        <CardContent>
          {(referrers as { _id: string; count: number }[]).length === 0 ? (
            <p className="text-sm text-muted-foreground">No referrers tracked yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {(referrers as { _id: string; count: number }[]).map((r) => (
                <li key={r._id} className="flex items-center justify-between">
                  <span className="truncate text-muted-foreground">{r._id}</span>
                  <span className="font-medium">{r.count}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
