import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Calendar, GraduationCap, Briefcase, Languages, Phone, Mail, MessageCircle } from "lucide-react";
import { dbConnect } from "@/lib/db/mongoose";
import { Doctor, Specialty } from "@/lib/db/models";
import { renderBioMarkdown } from "@/lib/utils/sanitize";
import { buildProfileMetadata } from "@/lib/seo/meta";
import { buildPhysicianJsonLd, buildChamberJsonLd, pruneJsonLd, profileUrl } from "@/lib/seo/jsonld";
import { recordProfileViewAction } from "@/server/actions/doctor";
import { ProfileHeader } from "@/components/profile/profile-header";
import { ProfileCredentials } from "@/components/profile/profile-credentials";
import { ChamberCard } from "@/components/profile/chamber-card";
import { ShareButton } from "@/components/profile/share-button";
import { WhatsappButton } from "@/components/profile/whatsapp-button";
import { ShareToWhatsappButton } from "@/components/profile/share-to-whatsapp-button";
import { AppointmentRequestDialog } from "@/components/profile/appointment-request-dialog";
import { ReportButton } from "@/components/profile/report-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SpecialtyListing } from "@/components/search/specialty-listing";
import { searchDoctors, listCities } from "@/lib/db/queries/doctors";
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
  const sp = await (Specialty as unknown as { findOne: Function })
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
    const [{ doctors, total, totalPages }, cities] = await Promise.all([
      searchDoctors({ specialty: specialty.name, page }),
      listCities(),
    ]);
    return (
      <SpecialtyListing
        specialtyName={specialty.name}
        doctors={doctors}
        total={total}
        page={page}
        totalPages={totalPages}
        cities={cities}
        searchParams={sp}
      />
    );
  }

  // (2) Otherwise treat as a doctor slug.
  const doctor = await getDoctor(slug);
  if (!doctor) notFound();

  // Fire-and-forget — view recording must never block the page render.
  recordProfileViewAction(doctor.slug).catch(() => {});

  const physicianLd = pruneJsonLd(buildPhysicianJsonLd(doctor));
  const chamberLds = buildChamberJsonLd(doctor).map(pruneJsonLd);
  const url = profileUrl(doctor.slug);
  const bioHtml = renderBioMarkdown(doctor.bio);
  const primaryChamber = doctor.chambers.find((c) => c.isPrimary) ?? doctor.chambers[0];

  return (
    <article className="pb-16">
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

      <ProfileHeader doctor={doctor} />

      {!doctor.isClaimed ? (
        <aside className="mx-auto mt-6 max-w-4xl rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:px-6">
          <p>
            Are you <strong>{doctor.name.displayName}</strong>?
          </p>
          <p className="mt-2">
            <Link
              href={`/auth/register?slug=${encodeURIComponent(doctor.slug)}`}
              className="inline-flex items-center gap-1 rounded-md bg-amber-900 px-3 py-1.5 font-medium text-amber-50 hover:bg-amber-800"
            >
              Claim this profile
            </Link>{" "}
            <span className="text-xs text-amber-900/80">Free · phone + SMS verification</span>
          </p>
        </aside>
      ) : null}

      <div className="mx-auto mt-6 grid max-w-4xl gap-6 px-4 sm:px-6 lg:mt-10 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {bioHtml ? (
            <Card>
              <CardHeader>
                <CardTitle>About</CardTitle>
              </CardHeader>
              <CardContent>
                <div
                  className="prose prose-sm max-w-none text-foreground [&_a]:text-primary"
                  dangerouslySetInnerHTML={{ __html: bioHtml }}
                />
              </CardContent>
            </Card>
          ) : null}

          {doctor.qualifications.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GraduationCap className="size-5 text-primary" aria-hidden="true" />
                  Qualifications
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {doctor.qualifications.map((q, i) => (
                    <li key={i}>
                      <span className="font-medium text-foreground">{q.degree}</span>
                      <span className="text-muted-foreground"> — {q.institution} ({q.year})</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          <ProfileCredentials doctor={doctor} />

          {doctor.experience.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Briefcase className="size-5 text-primary" aria-hidden="true" />
                  Experience
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 text-sm">
                  {doctor.experience.map((e, i) => (
                    <li key={i}>
                      <div className="font-medium text-foreground">{e.role}</div>
                      <div className="text-muted-foreground">
                        {e.organization} ·{" "}
                        {new Date(e.from).getFullYear()}–{e.current ? "present" : e.to ? new Date(e.to).getFullYear() : ""}
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          {doctor.chambers.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="size-5 text-primary" aria-hidden="true" />
                  Chambers & schedule
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {doctor.chambers.map((c, i) => (
                  <ChamberCard key={i} chamber={c} />
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Contact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {doctor.isClaimed && doctor.chambers.length > 0 ? (
                <AppointmentRequestDialog
                  slug={doctor.slug}
                  doctorName={doctor.name.displayName}
                  chambers={doctor.chambers.map((c, i) => ({
                    // Mongoose-leaned subdoc carries _id; fall back to index when
                    // the field is missing for any reason.
                    _id: String((c as unknown as { _id?: unknown })._id ?? i),
                    name: c.name,
                    area: c.area,
                    city: c.city,
                    schedule: (c.schedule ?? []).map((s) => ({
                      day: s.day,
                      startTime: s.startTime,
                      endTime: s.endTime,
                      available: s.available,
                    })),
                  }))}
                />
              ) : null}
              <WhatsappButton
                whatsapp={doctor.contact.whatsapp ?? doctor.contact.publicPhone ?? null}
                doctorName={doctor.name.displayName}
                variant={doctor.isClaimed && doctor.chambers.length > 0 ? "outline" : "default"}
              />
              {doctor.contact.publicPhone && !doctor.privacyHidePhone ? (
                <a href={`tel:${doctor.contact.publicPhone}`} className="flex items-center gap-2 hover:underline">
                  <Phone className="size-4" aria-hidden="true" /> {doctor.contact.publicPhone}
                </a>
              ) : null}
              {doctor.contact.publicEmail && !doctor.privacyHideEmail ? (
                <a href={`mailto:${doctor.contact.publicEmail}`} className="flex items-center gap-2 hover:underline">
                  <Mail className="size-4" aria-hidden="true" /> {doctor.contact.publicEmail}
                </a>
              ) : null}
              {doctor.contact.whatsapp && !doctor.privacyHidePhone ? (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <MessageCircle className="size-4" aria-hidden="true" /> WhatsApp: {doctor.contact.whatsapp}
                </p>
              ) : null}
              {primaryChamber?.address ? (
                <p className="text-muted-foreground">{primaryChamber.address}</p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Share this profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground break-all">{url}</p>
              <ShareToWhatsappButton doctor={doctor} />
              <ShareButton url={url} name={doctor.name.displayName} />
            </CardContent>
          </Card>

          {(doctor.concentrations?.length ?? 0) > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Areas of focus</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-wrap gap-2 text-sm">
                  {doctor.concentrations!.slice(0, 12).map((c) => (
                    <li key={c} className="rounded-full bg-muted px-3 py-1 text-foreground">
                      {c}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          {doctor.languages.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Languages className="size-5 text-primary" aria-hidden="true" />
                  Languages
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-wrap gap-2 text-sm">
                  {doctor.languages.map((l) => (
                    <li key={l} className="rounded-full bg-muted px-3 py-1 text-foreground">
                      {l}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          <ReportButton slug={doctor.slug} />
        </aside>
      </div>
    </article>
  );
}
