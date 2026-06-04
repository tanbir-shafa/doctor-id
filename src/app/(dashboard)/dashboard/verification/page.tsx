import type { Loose } from "@/lib/db/models/loose";
import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { dbConnect } from "@/lib/db/mongoose";
import { Doctor, ClaimRequest, IdentityVerificationRequest } from "@/lib/db/models";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { VerifiedBadge } from "@/components/profile/verified-badge";
import { VerificationRequestForm } from "./request-form";
import { AccountVerificationForm } from "./account-form";
import { classifySla } from "@/lib/db/queries/admin";
import type { DoctorDocLike, VerificationLevel } from "@/types/doctor";

export const metadata: Metadata = { title: "Verification" };
export const dynamic = "force-dynamic";

type LatestRequest = {
  status: string;
  createdAt: string;
  slaExpiresAt: string | null;
  reviewerNotes?: string | null;
} | null;

export default async function VerificationPage() {
  const session = await auth();
  await dbConnect();
  const doctorDoc = await Doctor.findOne({ ownerId: session!.user.id }).lean();
  if (!doctorDoc) return <p>No profile found.</p>;
  const doctor = JSON.parse(JSON.stringify(doctorDoc)) as DoctorDocLike;

  const [latestClaim, latestIdentity] = await Promise.all([
    (ClaimRequest as unknown as Loose).findOne({ doctorId: doctor._id }).sort({ createdAt: -1 }).lean(),
    (IdentityVerificationRequest as unknown as Loose)
      .findOne({ doctorId: doctor._id })
      .sort({ createdAt: -1 })
      .lean(),
  ]);

  const level = doctor.verificationLevel as VerificationLevel;
  const claim = JSON.parse(JSON.stringify(latestClaim ?? null)) as LatestRequest;
  const identity = JSON.parse(JSON.stringify(latestIdentity ?? null)) as LatestRequest;

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
              ? "BMDC and account identity both verified — your profile shows the blue Verified tick."
              : "Complete both verifications below to earn the blue Verified tick."}
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
              <span className="font-medium">Account verified:</span>{" "}
              {doctor.nidVerified ? "Yes" : "No"}
            </li>
          </ul>
        </CardContent>
      </Card>

      {/* --- BMDC verification --- */}
      {doctor.bmdcVerified ? (
        <VerifiedCard
          title="BMDC verification"
          description="Your BMDC registration has been verified against the public registry."
        />
      ) : claim?.status === "pending" ? (
        <UnderReviewCard title="BMDC verification" request={claim} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>BMDC verification</CardTitle>
            <CardDescription>
              Upload your BMDC certificate. <strong>We verify within 24 hours</strong> and grant
              the BMDC verified badge once your registration is confirmed against the BMDC public
              registry.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <RejectionNote request={claim} />
            <VerificationRequestForm initialBmdc={doctor.bmdcNumber ?? ""} />
          </CardContent>
        </Card>
      )}

      {/* --- Account (identity) verification --- */}
      {doctor.nidVerified ? (
        <VerifiedCard
          title="Account verification"
          description="Your identity has been verified against your Government photo ID."
        />
      ) : identity?.status === "pending" ? (
        <UnderReviewCard title="Account verification" request={identity} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Account verification</CardTitle>
            <CardDescription>
              Upload a Government photo ID (NID, Passport, or Driving License) and your legal name.{" "}
              <strong>We verify within 24 hours.</strong> Combined with BMDC verification, this
              earns the blue Verified tick.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <RejectionNote request={identity} />
            <AccountVerificationForm
              initialFirst={doctor.name.first}
              initialLast={doctor.name.last}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function VerifiedCard({ title, description }: { title: string; description: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckCircle2 className="size-5 text-emerald-600" aria-hidden="true" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  );
}

function UnderReviewCard({ title, request }: { title: string; request: NonNullable<LatestRequest> }) {
  const sla = classifySla(request);
  const submitted = new Date(request.createdAt).toLocaleString();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title} — under review</CardTitle>
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
}

function RejectionNote({ request }: { request: LatestRequest }) {
  if (!request || request.status !== "rejected" || !request.reviewerNotes) return null;
  return (
    <p className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">
      Your previous request was declined: {request.reviewerNotes}
    </p>
  );
}
