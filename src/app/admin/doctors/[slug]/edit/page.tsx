import type { Loose } from "@/lib/db/models/loose";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { dbConnect } from "@/lib/db/mongoose";
import { Doctor, Specialty, File } from "@/lib/db/models";
import { getPresignedUrl } from "@/lib/s3/s3-service";
import { missingPublishRequirements } from "@/lib/utils/completeness";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PageHeader } from "@/components/admin/page-header";
import { listAuditLogForEntity } from "@/lib/audit/log";
import type { DoctorDocLike } from "@/types/doctor";
import { AdminBasicSection } from "./sections/basic-section";
import { AdminVerificationSection } from "./sections/verification-section";
import { AdminContactSection } from "./sections/contact-section";
import { AdminSpecialtiesSection } from "./sections/specialties-section";
import { AdminConcentrationsSection } from "./sections/concentrations-section";
import { AdminQualificationsSection } from "./sections/qualifications-section";
import { AdminExperienceSection } from "./sections/experience-section";
import { AdminStatusSection } from "./sections/status-section";
import { AdminCredentialsSection } from "./sections/credentials-section";
import { AdminChambersSection } from "./sections/chambers-section";
import { AdminPhotosSection } from "./sections/photos-section";
import { AdminPublishSection } from "./sections/publish-section";
import { AuditHistoryPanel } from "./audit-history";

export const metadata: Metadata = { title: "Admin · Edit doctor" };
export const dynamic = "force-dynamic";

export default async function AdminDoctorEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { slug } = await params;
  const { created } = await searchParams;
  await dbConnect();
  const doctorDoc = await Doctor.findOne({ slug }).lean();
  if (!doctorDoc) notFound();
  const doctor = JSON.parse(JSON.stringify(doctorDoc)) as DoctorDocLike;
  const doctorId = String(doctor._id);

  // Presign the verified Gov ID (private bucket) for the Verification card, if any.
  let identityDocumentUrl: string | null = null;
  if (doctor.identityDocumentFileId) {
    const idFile = (await (File as unknown as Loose)
      .findById(doctor.identityDocumentFileId)
      .select("s3Bucket s3Key")
      .lean()) as { s3Bucket?: string; s3Key?: string } | null;
    if (idFile?.s3Bucket && idFile?.s3Key) {
      identityDocumentUrl = await getPresignedUrl(idFile.s3Bucket, idFile.s3Key, 3600, {
        ResponseContentDisposition: "inline",
      });
    }
  }

  // Specialty catalog feeds the SpecialtiesEditor's <datalist>.
  const specialtyDocs = await (Specialty as unknown as Loose)
    .find({ active: true })
    .sort({ sortOrder: 1, name: 1 })
    .select("name")
    .lean();
  const specialtyCatalog = (specialtyDocs as unknown as { name: string }[]).map((s) => s.name);

  const auditEntries = await listAuditLogForEntity("Doctor", doctorId, 20);

  const chambersInitial = (doctor.chambers ?? []).map((c) => ({
    name: c.name,
    address: c.address,
    area: c.area,
    district: c.district,
    division: c.division,
    phone: c.phone ?? "",
    floor: c.floor ?? "",
    room: c.room ?? "",
    consultationFee: c.consultationFee ?? { amount: 0, currency: "BDT" as const },
    coordinates: c.coordinates
      ? { lat: c.coordinates.lat, lng: c.coordinates.lng }
      : { lat: null, lng: null },
    schedule: c.schedule ?? [],
    isPrimary: Boolean(c.isPrimary),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Edit · ${doctor.name.displayName}`}
        description={
          doctor.bmdcNumber
            ? `BMDC ${doctor.bmdcNumber} · ${doctor.isClaimed ? "claimed" : "unclaimed"} · ${doctor.verificationLevel.replace(/_/g, " ")}`
            : `${doctor.isClaimed ? "claimed" : "unclaimed"} · ${doctor.verificationLevel.replace(/_/g, " ")}`
        }
        breadcrumb={[
          { label: "Doctors", href: "/admin/doctors" },
          { label: doctor.name.displayName },
        ]}
        toolbar={
          <Link
            href={`/${doctor.slug}`}
            target="_blank"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            View public profile <ExternalLink className="size-3.5" aria-hidden="true" />
          </Link>
        }
      />

      {created === "1" ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Doctor created. Fill in the remaining details (photo, specialties, chambers), then publish.
        </div>
      ) : null}

      <AdminPublishSection
        initialStatus={doctor.status}
        doctorId={doctorId}
        missing={missingPublishRequirements(doctor).map((s) => ({ key: s.key, label: s.label }))}
      />

      <Card>
        <CardHeader>
          <CardTitle>Basic information</CardTitle>
          <CardDescription>Name, gender, languages, bio.</CardDescription>
        </CardHeader>
        <CardContent>
          <AdminBasicSection doctor={doctor} doctorId={doctorId} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Verification</CardTitle>
          <CardDescription>
            Set BMDC and account/identity verification directly — no request needed.
            The blue &ldquo;Verified&rdquo; tick needs both.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AdminVerificationSection
            doctorId={doctorId}
            initial={{
              bmdcNumber: doctor.bmdcNumber ?? "",
              bmdcVerified: doctor.bmdcVerified,
              nidVerified: doctor.nidVerified,
              displayName: doctor.name.displayName,
              first: doctor.name.first,
              last: doctor.name.last,
              idDocumentType: doctor.idDocumentType ?? null,
              identityDocumentUrl,
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contact</CardTitle>
          <CardDescription>Public phone, WhatsApp, email, website, privacy toggles.</CardDescription>
        </CardHeader>
        <CardContent>
          <AdminContactSection doctor={doctor} doctorId={doctorId} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
          <CardDescription>
            Designation, affiliated institute, and years of experience —
            shown on the public profile header.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AdminStatusSection
            initial={{
              designation: doctor.designation,
              institute: doctor.institute,
              yearsOfExperience: doctor.yearsOfExperience,
            }}
            doctorId={doctorId}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Specialties</CardTitle>
          <CardDescription>
            The first specialty is the primary one shown on the profile header.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AdminSpecialtiesSection
            initial={doctor.specialties}
            doctorId={doctorId}
            catalog={specialtyCatalog}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Areas of focus</CardTitle>
          <CardDescription>Free-form concentration tags shown on the public profile.</CardDescription>
        </CardHeader>
        <CardContent>
          <AdminConcentrationsSection initial={doctor.concentrations ?? []} doctorId={doctorId} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Qualifications</CardTitle>
          <CardDescription>Degrees and certifications.</CardDescription>
        </CardHeader>
        <CardContent>
          <AdminQualificationsSection initial={doctor.qualifications} doctorId={doctorId} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Experience</CardTitle>
          <CardDescription>Past and current positions.</CardDescription>
        </CardHeader>
        <CardContent>
          <AdminExperienceSection initial={doctor.experience} doctorId={doctorId} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Credentials</CardTitle>
          <CardDescription>
            Awards, professional memberships, and publications. Each replaces
            the whole list wholesale on save.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AdminCredentialsSection
            initial={{
              awards: doctor.awards,
              memberships: doctor.memberships,
              publications: doctor.publications,
            }}
            doctorId={doctorId}
          />
        </CardContent>
      </Card>

      <div id="chambers" className="scroll-mt-20">
        <Card>
          <CardHeader>
            <CardTitle>Chambers</CardTitle>
            <CardDescription>Locations, schedule, map pin, fee.</CardDescription>
          </CardHeader>
          <CardContent>
            <AdminChambersSection initialChambers={chambersInitial} doctorId={doctorId} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Photos</CardTitle>
          <CardDescription>JPG/PNG/WebP up to 5 MB.</CardDescription>
        </CardHeader>
        <CardContent>
          <AdminPhotosSection
            doctorId={doctorId}
            profileUrl={doctor.photo?.url ?? null}
            coverUrl={doctor.coverPhoto?.url ?? null}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Edit history</CardTitle>
          <CardDescription>Last {auditEntries.length} admin actions on this profile.</CardDescription>
        </CardHeader>
        <CardContent>
          <AuditHistoryPanel entries={auditEntries} />
        </CardContent>
      </Card>
    </div>
  );
}
