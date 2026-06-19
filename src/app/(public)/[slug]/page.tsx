import type { Loose } from "@/lib/db/models/loose";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { dbConnect } from "@/lib/db/mongoose";
import { Doctor, Specialty } from "@/lib/db/models";
import { buildProfileMetadata } from "@/lib/seo/meta";
import {
  buildPhysicianJsonLd,
  buildChamberJsonLd,
  buildBreadcrumbJsonLd,
  buildFaqJsonLd,
  pruneJsonLd,
} from "@/lib/seo/jsonld";
import { buildProfileFaq, buildSpecialtyNavLinks } from "@/lib/seo/profile-text";
import { recordProfileViewAction } from "@/server/actions/doctor";
import { DoctorProfileView } from "@/components/profile/doctor-profile-view";
import { SpecialtyListing } from "@/components/search/specialty-listing";
import {
  searchDoctors,
  listDistricts,
  findSpecialtySlugByName,
  listDistrictsForSpecialty,
} from "@/lib/db/queries/doctors";
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
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const { slug } = await params;
  // Specialty pages take precedence so that `cardiology` etc. never get
  // mistaken for a doctor whose slug happens to collide.
  const specialty = await findSpecialtyBySlug(slug);
  if (specialty) {
    // Only the specialty branch reads searchParams (for the page-aware
    // canonical). The doctor branch below never touches it, so doctor profiles
    // stay statically rendered (revalidate=60) — only listings are dynamic.
    const sp = await searchParams;
    const page = sp.page ? Number(sp.page) : 1;
    const title = `${specialty.name} doctors in Bangladesh`;
    const base = `${publicEnv.NEXT_PUBLIC_APP_URL}/${slug}`;
    return {
      title,
      description: `Browse verified ${specialty.name.toLowerCase()} doctors across Bangladesh. Chambers, schedules, qualifications.`,
      alternates: { canonical: page > 1 ? `${base}?page=${page}` : base },
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
    const base = publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
    const breadcrumbLd = pruneJsonLd(
      buildBreadcrumbJsonLd([
        { name: "Home", url: `${base}/` },
        { name: `${specialty.name} doctors`, url: `${base}/${specialty.slug}` },
      ]),
    );
    return (
      <>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
        />
        <SpecialtyListing
          specialtyName={specialty.name}
          specialtySlug={specialty.slug}
          doctors={doctors}
          total={total}
          page={page}
          totalPages={totalPages}
          districts={districts}
          searchParams={sp}
        />
      </>
    );
  }

  // (2) Otherwise treat as a doctor slug. Only published profiles are public —
  // a draft (e.g. an unapproved doctor's profile) 404s here; the owner can see
  // it via the auth-gated /preview route instead.
  const doctor = await getDoctor(slug);
  if (!doctor) notFound();

  // Fire-and-forget — view recording must never block the page render.
  recordProfileViewAction(doctor.slug).catch(() => {});

  const primarySpecialty = doctor.specialties.find((s) => s.isPrimary) ?? doctor.specialties[0];
  const [specialtyDistricts, primarySpecialtySlug] = await Promise.all([
    primarySpecialty ? listDistrictsForSpecialty(primarySpecialty.name) : Promise.resolve([]),
    primarySpecialty ? findSpecialtySlugByName(primarySpecialty.name) : Promise.resolve(null),
  ]);
  // Neutral category links (specialty/district hubs) — never named peers, so a
  // doctor's shared profile doesn't advertise competitors. See seo-progress task 23.
  const primaryChamberDistrict =
    (doctor.chambers.find((c) => c.isPrimary) ?? doctor.chambers[0])?.district ?? null;
  const categoryLinks =
    primarySpecialty && primarySpecialtySlug
      ? buildSpecialtyNavLinks({
          specialtyName: primarySpecialty.name,
          specialtySlug: primarySpecialtySlug,
          primaryDistrict: primaryChamberDistrict,
          districts: specialtyDistricts.map((d) => d.district),
        })
      : [];

  const base = publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const crumbs = [{ name: "Home", url: `${base}/` }];
  if (primarySpecialty && primarySpecialtySlug) {
    crumbs.push({ name: `${primarySpecialty.name} doctors`, url: `${base}/${primarySpecialtySlug}` });
  }
  crumbs.push({ name: doctor.name.displayName, url: `${base}/${doctor.slug}` });

  const physicianLd = pruneJsonLd(buildPhysicianJsonLd(doctor));
  const chamberLds = buildChamberJsonLd(doctor).map(pruneJsonLd);
  const breadcrumbLd = pruneJsonLd(buildBreadcrumbJsonLd(crumbs));
  const faqLd = pruneJsonLd(buildFaqJsonLd(buildProfileFaq(doctor)));

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(physicianLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
      />
      {chamberLds.map((ld, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
        />
      ))}
      <DoctorProfileView doctor={doctor} categoryLinks={categoryLinks} />
    </>
  );
}
