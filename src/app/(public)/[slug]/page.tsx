import type { Loose } from "@/lib/db/models/loose";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { dbConnect } from "@/lib/db/mongoose";
import { Doctor, Specialty } from "@/lib/db/models";
import { buildProfileMetadata } from "@/lib/seo/meta";
import { buildPhysicianJsonLd, buildChamberJsonLd, pruneJsonLd } from "@/lib/seo/jsonld";
import { recordProfileViewAction } from "@/server/actions/doctor";
import { DoctorProfileView } from "@/components/profile/doctor-profile-view";
import { SpecialtyListing } from "@/components/search/specialty-listing";
import { searchDoctors, listDistricts } from "@/lib/db/queries/doctors";
import type { DoctorDocLike } from "@/types/doctor";
import { publicEnv } from "@/lib/env";

// SSR with revalidation — profile changes propagate within a minute without
// re-rendering on every request.
export const revalidate = 60;
export const dynamicParams = true;

async function getDoctor(slug: string): Promise<DoctorDocLike | null> {
  await dbConnect();
  const doc = await Doctor.findOne({ slug: slug.toLowerCase(), status: "published" }).lean();
  if (!doc) return null;
  // Serialize Mongoose ObjectIds + Dates into strings for client/RSC boundaries.
  return JSON.parse(JSON.stringify(doc)) as DoctorDocLike;
}

async function findSpecialtyBySlug(slug: string): Promise<{ name: string; slug: string } | null> {
  await dbConnect();
  const sp = await (Specialty as unknown as Loose)
    .findOne({ slug: slug.toLowerCase(), active: true })
    .select("name slug")
    .lean();
  return (sp as { name: string; slug: string } | null) ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  // Specialty pages take precedence so that `cardiology` etc. never get
  // mistaken for a doctor whose slug happens to collide.
  const specialty = await findSpecialtyBySlug(slug);
  if (specialty) {
    const title = `${specialty.name} doctors in Bangladesh`;
    return {
      title,
      description: `Browse verified ${specialty.name.toLowerCase()} doctors across Bangladesh. Chambers, schedules, qualifications.`,
      alternates: { canonical: `${publicEnv.NEXT_PUBLIC_APP_URL}/${slug}` },
    };
  }
  const doctor = await getDoctor(slug);
  if (!doctor) return { title: "Not found" };
  return buildProfileMetadata(doctor);
}

export default async function SlugPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;

  // (1) Specialty landing page takes precedence.
  const specialty = await findSpecialtyBySlug(slug);
  if (specialty) {
    const sp = await searchParams;
    const page = sp.page ? Number(sp.page) : 1;
    const [{ doctors, total, totalPages }, districts] = await Promise.all([
      searchDoctors({ specialty: specialty.name, page }),
      listDistricts(),
    ]);
    return (
      <SpecialtyListing
        specialtyName={specialty.name}
        doctors={doctors}
        total={total}
        page={page}
        totalPages={totalPages}
        districts={districts}
        searchParams={sp}
      />
    );
  }

  // (2) Otherwise treat as a doctor slug. Only published profiles are public —
  // a draft (e.g. an unapproved doctor's profile) 404s here; the owner can see
  // it via the auth-gated /preview route instead.
  const doctor = await getDoctor(slug);
  if (!doctor) notFound();

  // Fire-and-forget — view recording must never block the page render.
  recordProfileViewAction(doctor.slug).catch(() => {});

  const physicianLd = pruneJsonLd(buildPhysicianJsonLd(doctor));
  const chamberLds = buildChamberJsonLd(doctor).map(pruneJsonLd);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(physicianLd) }}
      />
      {chamberLds.map((ld, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
        />
      ))}
      <DoctorProfileView doctor={doctor} />
    </>
  );
}
