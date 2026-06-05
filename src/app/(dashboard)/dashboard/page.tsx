import type { Loose } from "@/lib/db/models/loose";
import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, ArrowRight, CheckCircle2, Circle, Award } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { dbConnect } from "@/lib/db/mongoose";
import { Doctor, ProfileView, User } from "@/lib/db/models";
import { computeCompleteness } from "@/lib/utils/completeness";
import { FOUNDING_DOCTOR_THRESHOLD } from "@/lib/utils/referral";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { EmrBanner } from "./emr-banner";
import type { DoctorDocLike } from "@/types/doctor";

export const metadata: Metadata = { title: "Dashboard overview" };
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ welcome?: string }>;
}

export default async function DashboardOverview({ searchParams }: PageProps) {
  const session = await auth();
  await dbConnect();
  const params = await searchParams;
  const isWelcome = params.welcome === "1";

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
  // For the single-CTA nudge: highest-weight section the doctor hasn't done.
  // (Ties broken by section order — basic info first, etc.) Score < 100 only.
  const nextSection =
    score < 100
      ? [...sections]
          .filter((s) => !s.done)
          .sort((a, b) => b.weight - a.weight)[0] ?? null
      : null;

  // eslint-disable-next-line react-hooks/purity
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const last30 = await (ProfileView as unknown as Loose).countDocuments({
    doctorId: doctor._id,
    viewedAt: { $gte: since },
  });

  // Read the EMR subdoc so the banner can render the right state. Missing
  // subdoc (legacy users) → treat as "not requested" → banner hidden.
  const userRow = await User.findById(session!.user.id)
    .select("emr approved")
    .lean<{
      emr?: { seatStatus?: "pending" | "ready" | "declined"; accountEmail?: string | null };
      approved?: boolean;
    } | null>();
  const emrStatus = userRow?.emr?.seatStatus ?? null;
  const emrEmail = userRow?.emr?.accountEmail ?? null;
  // `approved` gates publishing + public visibility (not login). Default true
  // (admins/legacy/seed); new doctors are false until an admin approves.
  const approved = userRow?.approved !== false;

  return (
    <div className="space-y-6">
      {emrStatus === "pending" || emrStatus === "ready" ? (
        <EmrBanner seatStatus={emrStatus} accountEmail={emrEmail} />
      ) : null}
      {!approved ? (
        <aside className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:px-6">
          <p className="font-semibold">Your account is under review</p>
          <p className="mt-1">
            You can edit and{" "}
            <Link href="/preview" target="_blank" className="font-medium underline">
              preview
            </Link>{" "}
            your profile now. Publishing and your public link unlock once an admin approves —
            usually within 24 hours.{" "}
            <Link href="/dashboard/verification" className="font-medium underline">
              Upload your BMDC certificate
            </Link>{" "}
            to speed it up.
          </p>
        </aside>
      ) : isWelcome ? (
        <aside className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 sm:px-6">
          <p className="font-semibold">Welcome to doctor.id.bd, {doctor.name.first}!</p>
          <p className="mt-1">
            Your profile is live-ready.{" "}
            <Link href="/dashboard/profile" className="font-medium underline">
              Polish your profile
            </Link>{" "}
            or{" "}
            <Link href="/dashboard/verification" className="font-medium underline">
              upload your BMDC certificate
            </Link>{" "}
            to get the verified badge faster.
          </p>
        </aside>
      ) : null}
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

      {nextSection ? (
        <aside className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm sm:px-6">
          <p>
            <span className="font-semibold text-foreground">{score}% complete</span>
            <span className="text-muted-foreground"> — </span>
            <span className="text-foreground">
              add <strong>{nextSection.label.toLowerCase()}</strong> to gain {nextSection.weight}%.
            </span>{" "}
            <Link href="/dashboard/profile" className="font-medium text-primary hover:underline">
              Polish your profile →
            </Link>
          </p>
        </aside>
      ) : null}

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

      <Card className="border-amber-200 bg-amber-50/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-900">
            <Award className="size-5" aria-hidden="true" /> Become a Founding Doctor
          </CardTitle>
          <CardDescription>
            {doctor.foundingDoctor?.isFounding
              ? "You've earned the Founding Doctor badge — thank you for growing the directory."
              : `Refer ${FOUNDING_DOCTOR_THRESHOLD} doctors who get verified to earn a permanent gold badge and top placement in search.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/dashboard/referrals"
            className="inline-flex items-center gap-1 text-sm font-medium text-amber-800 hover:underline"
          >
            {doctor.foundingDoctor?.isFounding ? "View your referrals" : "Get your referral link"}{" "}
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </CardContent>
      </Card>

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

      {doctor.status === "published" ? (
        <Card>
          <CardHeader>
            <CardTitle>Share your profile</CardTitle>
            <CardDescription>
              Drop these on a WhatsApp group, print them on your visiting card,
              or share on your Facebook page. Every scan or click lands a
              patient on your profile.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 sm:grid-cols-2">
              <li>
                <a
                  href={`/api/qr-card/${doctor.slug}`}
                  download={`${doctor.slug}-qr-card.png`}
                  className="block rounded-md border border-border p-3 hover:bg-accent"
                >
                  Download QR business card{" "}
                  <span className="text-xs text-muted-foreground">(1050×600 PNG, print-ready)</span>
                </a>
              </li>
              <li>
                <a
                  href={`/api/og/${doctor.slug}/square`}
                  download={`${doctor.slug}-profile-card.png`}
                  className="block rounded-md border border-border p-3 hover:bg-accent"
                >
                  Download square profile card{" "}
                  <span className="text-xs text-muted-foreground">(1080×1080 PNG, WhatsApp Status)</span>
                </a>
              </li>
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
