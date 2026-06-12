import type { Metadata } from "next";
import Link from "next/link";
import { Download, FileText, ExternalLink, AlertTriangle } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { dbConnect } from "@/lib/db/mongoose";
import { Doctor } from "@/lib/db/models";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { buildRxPadDto } from "@/lib/rx-pad/dto";
import { publicEnv } from "@/lib/env";
import type { DoctorDocLike } from "@/types/doctor";

export const metadata: Metadata = { title: "Prescription pad" };
export const dynamic = "force-dynamic";

interface MissingMeta {
  key: string;
  label: string;
  fixHref: string;
  required: boolean;
}

const MISSING_META: Record<string, MissingMeta> = {
  name: { key: "name", label: "Your name", fixHref: "/dashboard/profile", required: true },
  bmdc: {
    key: "bmdc",
    label: "BMDC registration number",
    fixHref: "/dashboard/verification",
    required: true,
  },
  chamber: {
    key: "chamber",
    label: "At least one chamber",
    fixHref: "/dashboard/chambers",
    required: true,
  },
  photo: {
    key: "photo",
    label: "Profile photo (recommended)",
    fixHref: "/dashboard/photos",
    required: false,
  },
  qualifications: {
    key: "qualifications",
    label: "Qualifications / degrees (recommended)",
    fixHref: "/dashboard/profile",
    required: false,
  },
};

export default async function PrescriptionPadPage() {
  const session = await auth();
  await dbConnect();
  const doctorDoc = await Doctor.findOne({ ownerId: session!.user.id }).lean();
  if (!doctorDoc) return <p>No profile found.</p>;
  const doctor = JSON.parse(JSON.stringify(doctorDoc)) as DoctorDocLike & {
    slug: string;
    flags?: { rxPadGenerations?: number; rxPadGeneratedAt?: string | null };
  };

  const dto = buildRxPadDto(doctor, publicEnv.NEXT_PUBLIC_APP_URL);
  const generations = doctor.flags?.rxPadGenerations ?? 0;
  const lastAt = doctor.flags?.rxPadGeneratedAt
    ? new Date(doctor.flags.rxPadGeneratedAt).toLocaleString()
    : null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Prescription pad</h1>
        <p className="text-sm text-muted-foreground">
          A free A5 PDF with your identity, BMDC#, chambers, and a QR code to your public profile.
          Print and use as your chamber pad — patients see <strong>Daktar.Link</strong> on every
          prescription you hand out.
        </p>
      </header>

      {dto.ok ? (
        <>
          {/* Recommended items still missing — informational. */}
          {dto.ok && hasRecommendedMissing(doctor) ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="size-4 text-amber-600" aria-hidden="true" />
                  Make your pad look better
                </CardTitle>
                <CardDescription>
                  Your pad is ready to print, but adding these will make it look more polished:
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-sm">
                  {recommendedMissingFor(doctor).map((m) => (
                    <li key={m.key} className="flex items-center gap-2">
                      <Circle />
                      <span className="flex-1">{m.label}</span>
                      <Link
                        href={m.fixHref}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        Add →
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          {/* Preview + actions */}
          <Card>
            <CardHeader className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="size-5 text-primary" aria-hidden="true" />
                  Preview
                </CardTitle>
                <CardDescription>
                  {generations === 0
                    ? "First download — print on plain A5 paper."
                    : `Downloaded ${generations} time${generations === 1 ? "" : "s"}${lastAt ? ` · last ${lastAt}` : ""}.`}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href="/dashboard/prescription-pad/download"
                  className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  <Download className="size-4" aria-hidden="true" />
                  Download PDF
                </Link>
                <Link
                  href={`/${doctor.slug}`}
                  target="_blank"
                  className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
                >
                  View public profile
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              <iframe
                title="Prescription pad preview"
                src="/dashboard/prescription-pad/download?inline=1"
                className="h-[640px] w-full rounded-md border border-border bg-muted"
              />
              <p className="mt-3 text-xs text-muted-foreground">
                Identity card only — no medical content. The QR links to{" "}
                <strong>daktar.link/{doctor.slug}</strong> so patients can verify your profile
                online.
              </p>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-amber-600" aria-hidden="true" />
              Finish your profile to generate the pad
            </CardTitle>
            <CardDescription>
              We can&apos;t generate a prescription pad yet — the following are required:
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {dto.missing.map((k) => {
                const meta = MISSING_META[k];
                if (!meta) return null;
                return (
                  <li key={k} className="flex items-center gap-2">
                    {meta.required ? (
                      <span className="inline-flex size-5 items-center justify-center rounded-full bg-rose-100 text-rose-700">
                        !
                      </span>
                    ) : (
                      <Circle />
                    )}
                    <span className="flex-1">
                      {meta.label}
                      {meta.required ? (
                        <span className="ml-2 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-rose-700">
                          Required
                        </span>
                      ) : null}
                    </span>
                    <Link
                      href={meta.fixHref}
                      className={buttonVariants({
                        size: "sm",
                        variant: meta.required ? "default" : "outline",
                      })}
                    >
                      Fix →
                    </Link>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Circle() {
  return <span className="inline-block size-2 rounded-full bg-muted-foreground/40" />;
}

function hasRecommendedMissing(d: DoctorDocLike): boolean {
  return !d.photo?.url || !d.qualifications || d.qualifications.length === 0;
}

function recommendedMissingFor(d: DoctorDocLike): MissingMeta[] {
  const out: MissingMeta[] = [];
  if (!d.photo?.url) out.push(MISSING_META.photo!);
  if (!d.qualifications || d.qualifications.length === 0)
    out.push(MISSING_META.qualifications!);
  return out;
}
