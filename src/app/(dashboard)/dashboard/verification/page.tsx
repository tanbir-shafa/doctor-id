import type { Metadata } from "next";
import { auth } from "@/lib/auth/config";
import { dbConnect } from "@/lib/db/mongoose";
import { Doctor, ClaimRequest } from "@/lib/db/models";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { VerifiedBadge } from "@/components/profile/verified-badge";
import { VerificationRequestForm } from "./request-form";
import { classifySla } from "@/lib/db/queries/admin";
import type { DoctorDocLike, VerificationLevel } from "@/types/doctor";

export const metadata: Metadata = { title: "Verification" };
export const dynamic = "force-dynamic";

export default async function VerificationPage() {
  const session = await auth();
  await dbConnect();
  const doctorDoc = await Doctor.findOne({ ownerId: session!.user.id }).lean();
  if (!doctorDoc) return <p>No profile found.</p>;
  const doctor = JSON.parse(JSON.stringify(doctorDoc)) as DoctorDocLike;

  const latest = await (ClaimRequest as unknown as { findOne: Function })
    .findOne({ doctorId: doctor._id })
    .sort({ createdAt: -1 })
    .lean();

  const level = doctor.verificationLevel as VerificationLevel;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Verification</h1>
        <p className="text-sm text-muted-foreground">
          Verified profiles rank higher in search and earn patient trust faster.
        </p>
      </header>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Current status</CardTitle>
            <VerifiedBadge level={level} />
          </div>
          <CardDescription>
            {level === "fully_verified"
              ? "BMDC and NID both verified. Highest trust tier."
              : level === "bmdc_verified"
                ? "Your BMDC registration has been verified. Submit NID for full verification."
                : "Your profile is not yet verified. Submit your BMDC certificate to begin."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm">
            <li>
              <span className="font-medium">BMDC number:</span> {doctor.bmdcNumber ?? "—"}
            </li>
            <li>
              <span className="font-medium">BMDC verified:</span> {doctor.bmdcVerified ? "Yes" : "No"}
            </li>
            <li>
              <span className="font-medium">NID verified:</span> {doctor.nidVerified ? "Yes" : "No"}
            </li>
          </ul>
        </CardContent>
      </Card>

      {latest && (latest as { status: string }).status === "pending" ? (
        (() => {
          const latestTyped = latest as {
            createdAt: Date;
            slaExpiresAt: Date | null;
            status: string;
          };
          const sla = classifySla(latestTyped);
          const submitted = new Date(latestTyped.createdAt).toLocaleString();
          return (
            <Card>
              <CardHeader>
                <CardTitle>Request under review</CardTitle>
                <CardDescription>
                  We verify every submission within 24 hours. Submitted: {submitted}
                  {sla.remainingMs !== null
                    ? sla.tone === "red" && sla.bucket === "breached"
                      ? ` · We're past our SLA — escalating with the team.`
                      : ` · ${sla.label}`
                    : null}
                </CardDescription>
              </CardHeader>
            </Card>
          );
        })()
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Request verification</CardTitle>
            <CardDescription>
              Upload your BMDC certificate. <strong>We verify within 24 hours</strong> and grant
              the BMDC verified badge once your registration is confirmed against the BMDC public
              registry.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <VerificationRequestForm initialBmdc={doctor.bmdcNumber ?? ""} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
