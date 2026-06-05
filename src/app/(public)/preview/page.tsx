import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Eye } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { dbConnect } from "@/lib/db/mongoose";
import { Doctor } from "@/lib/db/models";
import { DoctorProfileView } from "@/components/profile/doctor-profile-view";
import type { DoctorDocLike } from "@/types/doctor";

// Owner-only preview of the doctor's own profile — renders the public layout
// regardless of draft/published status so a doctor can see how it will look
// before (and after) it goes live. Never indexed; auth-gated in the page since
// it lives in the public route group. `/preview` is a static segment, so it
// resolves before the polymorphic `/[slug]`.
export const metadata: Metadata = { title: "Profile preview", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ProfilePreviewPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/login?next=/preview");
  if (session.user.role === "admin") redirect("/admin");

  await dbConnect();
  const doctorDoc = await Doctor.findOne({ ownerId: session.user.id }).lean();
  if (!doctorDoc) redirect("/dashboard");
  const doctor = JSON.parse(JSON.stringify(doctorDoc)) as DoctorDocLike;

  return (
    <>
      <div className="border-b border-amber-300 bg-amber-50 text-amber-900">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-2.5 text-sm sm:px-6">
          <span className="inline-flex items-center gap-2">
            <Eye className="size-4 shrink-0" aria-hidden="true" />
            <span>
              <strong>Preview</strong> — only you can see this.{" "}
              {doctor.status === "published"
                ? "Your profile is live."
                : "It won't be public or shareable until you publish (after admin approval)."}
            </span>
          </span>
          <Link href="/dashboard/profile" className="shrink-0 font-medium underline">
            Back to editor
          </Link>
        </div>
      </div>
      <DoctorProfileView doctor={doctor} preview />
    </>
  );
}
