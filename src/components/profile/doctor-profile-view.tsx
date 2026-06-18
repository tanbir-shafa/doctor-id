import Link from "next/link";
import { Calendar, GraduationCap, Briefcase, Languages, Phone, Mail, MessageCircle, Users, ArrowRight } from "lucide-react";
import { renderBioMarkdown } from "@/lib/utils/sanitize";
import { profileUrl } from "@/lib/seo/jsonld";
import { buildAutoProfileSummary } from "@/lib/seo/profile-text";
import { DoctorCard } from "@/components/search/doctor-card";
import { ProfileHeader } from "@/components/profile/profile-header";
import { ProfileCredentials } from "@/components/profile/profile-credentials";
import { ChamberCard } from "@/components/profile/chamber-card";
import { ShareButton } from "@/components/profile/share-button";
import { WhatsappButton } from "@/components/profile/whatsapp-button";
import { ShareToWhatsappButton } from "@/components/profile/share-to-whatsapp-button";
import { AppointmentRequestDialog } from "@/components/profile/appointment-request-dialog";
import { ReportButton } from "@/components/profile/report-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DoctorDocLike } from "@/types/doctor";

/**
 * The visual body of a doctor's public profile — shared by the public
 * `/[slug]` page and the owner-only `/preview` route. Page-level concerns
 * (JSON-LD, metadata, view-counter) stay in the public page.
 *
 * `preview` mode hides the public-visitor-only affordances (the "claim this
 * profile" banner, the appointment-request dialog, and the report button) so a
 * doctor sees a clean rendering of how their profile will look.
 */
export function DoctorProfileView({
  doctor,
  preview = false,
  relatedDoctors = [],
  primarySpecialtySlug = null,
}: {
  doctor: DoctorDocLike;
  preview?: boolean;
  relatedDoctors?: DoctorDocLike[];
  primarySpecialtySlug?: string | null;
}) {
  const bioHtml = renderBioMarkdown(doctor.bio);
  const primaryChamber = doctor.chambers.find((c) => c.isPrimary) ?? doctor.chambers[0];
  const primarySpecialtyName =
    (doctor.specialties.find((s) => s.isPrimary) ?? doctor.specialties[0])?.name ?? null;
  const url = profileUrl(doctor.slug);

  return (
    <article className="pb-16">
      <ProfileHeader doctor={doctor} />

      {!preview && !doctor.isClaimed ? (
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
          ) : (
            // No hand-written bio: render a unique, structured-data-derived
            // summary so the profile is never thin content (#21).
            <Card>
              <CardHeader>
                <CardTitle>About</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {buildAutoProfileSummary(doctor)}
                </p>
              </CardContent>
            </Card>
          )}

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
              {!preview && doctor.isClaimed && doctor.chambers.length > 0 ? (
                <AppointmentRequestDialog
                  slug={doctor.slug}
                  doctorName={doctor.name.displayName}
                  chambers={doctor.chambers.map((c, i) => ({
                    _id: String((c as unknown as { _id?: unknown })._id ?? i),
                    name: c.name,
                    area: c.area,
                    district: c.district,
                    schedule: (c.schedule ?? []).map((s) => ({
                      day: s.day,
                      startTime: s.startTime,
                      endTime: s.endTime,
                      available: s.available,
                    })),
                  }))}
                />
              ) : null}
              {doctor.whatsappAppointmentEnabled ? (
                <WhatsappButton
                  whatsapp={
                    doctor.contact.whatsapp ??
                    (doctor.privacyHidePhone ? null : doctor.contact.publicPhone) ??
                    null
                  }
                  doctorName={doctor.name.displayName}
                  variant={doctor.isClaimed && doctor.chambers.length > 0 ? "outline" : "default"}
                />
              ) : null}
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

          {!preview ? <ReportButton slug={doctor.slug} /> : null}
        </aside>
      </div>

      {!preview && relatedDoctors.length > 0 ? (
        <section className="mx-auto mt-10 max-w-4xl px-4 sm:px-6" aria-label="Related doctors">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground">
              <Users className="size-5 text-primary" aria-hidden="true" />
              {primarySpecialtyName ? `More ${primarySpecialtyName} doctors` : "Related doctors"}
            </h2>
            {primarySpecialtySlug ? (
              <Link
                href={`/${primarySpecialtySlug}`}
                className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                View all <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            ) : null}
          </div>
          <ul className="grid grid-cols-1 gap-3">
            {relatedDoctors.map((d) => (
              <li key={d.slug}>
                <DoctorCard doctor={d} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
