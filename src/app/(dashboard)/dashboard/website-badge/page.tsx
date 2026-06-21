import type { Metadata } from "next";
import { auth } from "@/lib/auth/config";
import { dbConnect } from "@/lib/db/mongoose";
import { Doctor } from "@/lib/db/models";
import { buildBadgeSnippets } from "@/lib/seo/embed-badge";
import { WebsiteBadgeEmbed } from "@/components/dashboard/website-badge-embed";
import { publicEnv } from "@/lib/env";
import type { DoctorDocLike } from "@/types/doctor";

export const metadata: Metadata = { title: "Website badge" };
export const dynamic = "force-dynamic";

export default async function WebsiteBadgePage() {
  const session = await auth();
  await dbConnect();
  const doctorDoc = await Doctor.findOne({ ownerId: session!.user.id }).lean();
  if (!doctorDoc) return <p className="text-sm text-muted-foreground">No profile found.</p>;
  const doctor = JSON.parse(JSON.stringify(doctorDoc)) as DoctorDocLike & { slug: string };

  const profileUrl = `${publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/${doctor.slug}`;
  const snippets = buildBadgeSnippets({
    profileUrl,
    displayName: doctor.name.displayName,
    verified: doctor.verificationLevel === "fully_verified",
  });
  const published = doctor.status === "published";

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Add to your website</h1>
        <p className="text-sm text-muted-foreground">
          Paste one of these badges on your clinic or personal website. Each links to your public
          Daktar.Link profile — it helps patients find you and, because it&apos;s a real link back to
          your profile, it strengthens how you rank in search over time.
        </p>
      </header>

      {!published ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          Your profile isn&apos;t published yet, so the badge link won&apos;t work publicly until you
          publish it.
        </p>
      ) : null}

      <WebsiteBadgeEmbed snippets={snippets} />

      <p className="text-xs text-muted-foreground">
        Tip: add it to your website footer, &ldquo;About&rdquo; page, or email signature for the most
        reach.
      </p>
    </div>
  );
}
