import type { Metadata } from "next";
import Link from "next/link";
import { Award, CheckCircle2, Clock } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { dbConnect } from "@/lib/db/mongoose";
import { Doctor } from "@/lib/db/models";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { listReferralsForDoctor } from "@/lib/db/queries/referrals";
import { buildReferralLink, FOUNDING_DOCTOR_THRESHOLD } from "@/lib/utils/referral";
import { publicEnv } from "@/lib/env";
import { CopyLink } from "./copy-link";
import type { DoctorDocLike } from "@/types/doctor";

export const metadata: Metadata = { title: "Refer & earn" };
export const dynamic = "force-dynamic";

export default async function ReferralsPage() {
  const session = await auth();
  await dbConnect();
  const doctorDoc = await Doctor.findOne({ ownerId: session!.user.id }).lean();
  if (!doctorDoc) return <p>No profile found.</p>;
  const doctor = JSON.parse(JSON.stringify(doctorDoc)) as DoctorDocLike;

  const referrals = await listReferralsForDoctor(String(doctor._id));
  const qualified = referrals.filter((r) => r.status === "qualified").length;
  const pending = referrals.filter((r) => r.status === "pending").length;
  const isFounding = Boolean(doctor.foundingDoctor?.isFounding);
  // BMDC number is the friendly code doctors share + type. Falls back to the
  // slug only for the rare profile without a BMDC number on file.
  const hasBmdc = Boolean(doctor.bmdcNumber);
  const referralCode = doctor.bmdcNumber || doctor.slug;
  const link = buildReferralLink(publicEnv.NEXT_PUBLIC_APP_URL, referralCode);
  const remaining = Math.max(0, FOUNDING_DOCTOR_THRESHOLD - qualified);
  const pct = Math.min(100, Math.round((qualified / FOUNDING_DOCTOR_THRESHOLD) * 100));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Refer &amp; earn the Founding Doctor badge
        </h1>
        <p className="text-sm text-muted-foreground">
          Invite fellow doctors with your link. When {FOUNDING_DOCTOR_THRESHOLD} of them get
          verified, you earn the permanent Founding Doctor badge — and top placement in search.
        </p>
      </header>

      {isFounding ? (
        <aside className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Award className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">You&apos;re a Founding Doctor 🎉</p>
            <p className="mt-1">
              Your profile shows the gold Founding Doctor badge and ranks at the top of search
              results.
            </p>
          </div>
        </aside>
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Qualified referrals</CardDescription>
          <CardTitle className="text-3xl">
            {qualified} / {FOUNDING_DOCTOR_THRESHOLD}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-amber-500 transition-all"
              style={{ width: `${pct}%` }}
              aria-label={`${qualified} of ${FOUNDING_DOCTOR_THRESHOLD} qualified`}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {isFounding
              ? "Badge earned — thank you for growing the directory."
              : `${remaining} more verified ${remaining === 1 ? "doctor" : "doctors"} to unlock the badge.`}
            {pending > 0 ? ` ${pending} pending admin approval.` : ""}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your referral link</CardTitle>
          <CardDescription>
            Share this on WhatsApp, Facebook, or in person. Doctors who register or claim their
            profile through it are credited to you. They can also type your{" "}
            {hasBmdc ? "BMDC number" : "code"}{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">{referralCode}</code> manually
            during registration.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CopyLink link={link} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Doctors you&apos;ve referred</CardTitle>
          <CardDescription>
            A referral qualifies once that doctor is approved by our team.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {referrals.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No referrals yet. Share your link to get started.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {referrals.map((r) => (
                <li key={r._id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 truncate font-medium text-foreground">
                    {r.referredSlug ? (
                      <Link href={`/${r.referredSlug}`} target="_blank" className="hover:underline">
                        {r.referredName ?? r.referredSlug}
                      </Link>
                    ) : (
                      (r.referredName ?? "A doctor")
                    )}
                  </span>
                  {r.status === "qualified" ? (
                    <span className="inline-flex shrink-0 items-center gap-1 text-emerald-700">
                      <CheckCircle2 className="size-4" aria-hidden="true" /> Qualified
                    </span>
                  ) : (
                    <span className="inline-flex shrink-0 items-center gap-1 text-muted-foreground">
                      <Clock className="size-4" aria-hidden="true" /> Pending
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
