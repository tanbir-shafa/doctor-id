import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PhotoUploader } from "./photo-uploader";
import { auth } from "@/lib/auth/config";
import { dbConnect } from "@/lib/db/mongoose";
import { Doctor } from "@/lib/db/models";
import type { DoctorDocLike } from "@/types/doctor";

export const metadata: Metadata = { title: "Photos" };
export const dynamic = "force-dynamic";

export default async function PhotosPage() {
  const session = await auth();
  await dbConnect();
  const doctorDoc = await Doctor.findOne({ ownerId: session!.user.id }).select("photo coverPhoto").lean();
  const doctor = doctorDoc ? (JSON.parse(JSON.stringify(doctorDoc)) as Pick<DoctorDocLike, "photo" | "coverPhoto">) : null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Photos</h1>
        <p className="text-sm text-muted-foreground">Profile photo and optional cover image. JPG/PNG/WebP up to 5 MB.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Profile photo</CardTitle>
          <CardDescription>Square preferred. This is the image used on your profile and OG share card.</CardDescription>
        </CardHeader>
        <CardContent>
          <PhotoUploader kind="profile" currentUrl={doctor?.photo?.url ?? null} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cover photo</CardTitle>
          <CardDescription>Wide banner image displayed at the top of your profile (optional).</CardDescription>
        </CardHeader>
        <CardContent>
          <PhotoUploader kind="cover" currentUrl={doctor?.coverPhoto?.url ?? null} />
        </CardContent>
      </Card>
    </div>
  );
}
