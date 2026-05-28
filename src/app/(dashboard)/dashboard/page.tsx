import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, ArrowRight, CheckCircle2, Circle } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { dbConnect } from "@/lib/db/mongoose";
import { Doctor, ProfileView } from "@/lib/db/models";
import { computeCompleteness } from "@/lib/utils/completeness";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DoctorDocLike } from "@/types/doctor";

export const metadata: Metadata = { title: "Dashboard overview" };
export const dynamic = "force-dynamic";

export default async function DashboardOverview() {
  const session = await auth();
  await dbConnect();

  const doctorDoc = await Doctor.findOne({ ownerId: session!.user.id }).lean();
  if (!doctorDoc) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center">
        <h2 className="text-lg font-semibold">No profile yet</h2>
        <p className="mt-1 text-sm text-muted-foreground">Sign out and register again to provision your profile.</p>
      </div>
    );
  }
  const doctor = JSON.parse(JSON.stringify(doctorDoc)) as DoctorDocLike;
  const { score, sections } = computeCompleteness(doctor);

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const last30 = await (ProfileView as unknown as { countDocuments: Function }).countDocuments({
    doctorId: doctor._id,
    viewedAt: { $gte: since },
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Welcome back, {doctor.name.first}</h1>
        <p className="text-sm text-muted-foreground">
          Your public profile is{" "}
          {doctor.status === "published" ? (
            <Link href={`/${doctor.slug}`} target="_blank" className="font-medium text-primary hover:underline">
              live at /{doctor.slug} <ExternalLink className="inline size-3.5" aria-hidden="true" />
            </Link>
          ) : (
            <span className="font-medium text-amber-700">currently a draft (not visible publicly)</span>
          )}
          .
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Completeness</CardDescription>
            <CardTitle className="text-3xl">{score}%</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${score}%` }}
                aria-label={`Profile ${score}% complete`}
              />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Profile views (30d)</CardDescription>
            <CardTitle className="text-3xl">{Intl.NumberFormat("en-IN").format(last30)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Total all-time: {Intl.NumberFormat("en-IN").format(doctor.profileViews)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Verification</CardDescription>
            <CardTitle className="text-base capitalize">
              {doctor.verificationLevel.replace("_", " ")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard/verification" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              Manage verification <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Finish your profile</CardTitle>
          <CardDescription>Higher completeness boosts your visibility in search results.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {sections.map((s) => (
              <li key={s.key} className="flex items-center gap-2 text-sm">
                {s.done ? (
                  <CheckCircle2 className="size-4 text-green-600" aria-hidden="true" />
                ) : (
                  <Circle className="size-4 text-muted-foreground" aria-hidden="true" />
                )}
                <span className={cn(s.done ? "text-muted-foreground line-through" : "text-foreground")}>
                  {s.label}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quick actions</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 sm:grid-cols-2">
            <li>
              <Link href="/dashboard/profile" className="block rounded-md border border-border p-3 hover:bg-accent">
                Edit your profile sections
              </Link>
            </li>
            <li>
              <Link href="/dashboard/chambers" className="block rounded-md border border-border p-3 hover:bg-accent">
                Add or edit a chamber
              </Link>
            </li>
            <li>
              <Link href="/dashboard/photos" className="block rounded-md border border-border p-3 hover:bg-accent">
                Upload a profile photo
              </Link>
            </li>
            <li>
              <Link href="/dashboard/verification" className="block rounded-md border border-border p-3 hover:bg-accent">
                Request BMDC verification
              </Link>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
