import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { dbConnect } from "@/lib/db/mongoose";
import { Doctor } from "@/lib/db/models";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BasicSectionForm } from "./basic-form";
import { ContactSectionForm } from "./contact-form";
import { QualificationsEditor } from "./qualifications-editor";
import { ExperienceEditor } from "./experience-editor";
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
          <CardTitle>Qualifications</CardTitle>
          <CardDescription>Degrees and certifications.</CardDescription>
        </CardHeader>
        <CardContent>
          <QualificationsEditor initial={doctor.qualifications} />
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
