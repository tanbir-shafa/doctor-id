import type { Loose } from "@/lib/db/models/loose";
import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { dbConnect } from "@/lib/db/mongoose";
import { Doctor, Specialty } from "@/lib/db/models";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { SpecialtiesEditor } from "@/components/dashboard/specialties-editor";
import { ConcentrationsEditor } from "@/components/dashboard/concentrations-editor";
import { updateProfileSpecialtiesAction } from "@/server/actions/doctor";
import { BasicSectionForm } from "./basic-form";
import { ContactSectionForm } from "./contact-form";
import { QualificationsEditor } from "./qualifications-editor";
import { ExperienceEditor } from "./experience-editor";
import { StatusEditor } from "./status-editor";
import { CredentialsEditor } from "./credentials-editor";
import { PublishToggle } from "./publish-toggle";
import type { DoctorDocLike } from "@/types/doctor";

export const metadata: Metadata = { title: "Edit profile" };
export const dynamic = "force-dynamic";

export default async function EditProfilePage() {
  const session = await auth();
  await dbConnect();
  const doctorDoc = await Doctor.findOne({ ownerId: session!.user.id }).lean();
  if (!doctorDoc) return <p>No profile found.</p>;
  const doctor = JSON.parse(JSON.stringify(doctorDoc)) as DoctorDocLike;

  // Specialty catalog — feeds the quick-pick chip palette in
  // <SpecialtiesEditor>. Active rows only, sorted by curated sortOrder.
  const specialtyDocs = await (Specialty as unknown as Loose)
    .find({ active: true })
    .sort({ sortOrder: 1, name: 1 })
    .select("name")
    .lean();
  const specialtyCatalog = (specialtyDocs as unknown as { name: string }[]).map((s) => s.name);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Edit your profile</h1>
          <p className="text-sm text-muted-foreground">
            Changes save per section. Public profile updates within a minute.
          </p>
        </div>
        <Link
          href={`/${doctor.slug}`}
          target="_blank"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          Preview <ExternalLink className="size-3.5" aria-hidden="true" />
        </Link>
      </header>

      <PublishToggle initialStatus={doctor.status} />

      <Card>
        <CardHeader>
          <CardTitle>Basic information</CardTitle>
          <CardDescription>Name, gender, languages, bio.</CardDescription>
        </CardHeader>
        <CardContent>
          <BasicSectionForm doctor={doctor} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contact</CardTitle>
          <CardDescription>Public phone, WhatsApp, email, website. Toggle privacy individually.</CardDescription>
        </CardHeader>
        <CardContent>
          <ContactSectionForm doctor={doctor} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
          <CardDescription>
            Designation, affiliated institute, and years of experience — the
            credentials patients see right next to your name.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StatusEditor
            initial={{
              designation: doctor.designation,
              institute: doctor.institute,
              yearsOfExperience: doctor.yearsOfExperience,
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Specialties</CardTitle>
          <CardDescription>
            The first specialty is the primary one shown on your profile header.
            Tap a chip to add, or type to enter a custom specialty.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SpecialtiesEditor
            initial={doctor.specialties}
            catalog={specialtyCatalog}
            submitAction={updateProfileSpecialtiesAction}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Areas of focus</CardTitle>
          <CardDescription>
            Free-form tags (e.g. &ldquo;Interventional Cardiology&rdquo;) shown
            in the &ldquo;Areas of focus&rdquo; section of your public profile.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ConcentrationsEditor initial={doctor.concentrations ?? []} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Qualifications</CardTitle>
          <CardDescription>Degrees and certifications.</CardDescription>
        </CardHeader>
        <CardContent>
          <QualificationsEditor initial={doctor.qualifications} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Credentials</CardTitle>
          <CardDescription>
            Awards, professional memberships, and publications. These make
            your profile stand out on Google and patient search.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CredentialsEditor
            initial={{
              awards: doctor.awards,
              memberships: doctor.memberships,
              publications: doctor.publications,
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Experience</CardTitle>
          <CardDescription>Past and current positions.</CardDescription>
        </CardHeader>
        <CardContent>
          <ExperienceEditor initial={doctor.experience} />
        </CardContent>
      </Card>
    </div>
  );
}
