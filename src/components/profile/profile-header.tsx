import Image from "next/image";
import Link from "next/link";
import { Award, BadgeCheck, Building2, Eye, IdCard, MapPin } from "lucide-react";
import { VerifiedBadgeExplainer } from "./verified-badge-explainer";
import { FoundingDoctorBadge } from "./founding-doctor-badge";
import type { DoctorDocLike } from "@/types/doctor";

// 30-day view chip is hidden below this threshold — tiny numbers look bad.
const VIEW_CHIP_MIN = 100;

export function ProfileHeader({ doctor }: { doctor: DoctorDocLike }) {
  const primarySpecialty = doctor.specialties.find((s) => s.isPrimary) ?? doctor.specialties[0];
  const primaryChamber = doctor.chambers.find((c) => c.isPrimary) ?? doctor.chambers[0];
  const fullName = doctor.name.displayName;
  const views30d = doctor.metrics?.profileViews30d ?? 0;

  return (
    <header className="mx-auto max-w-4xl px-4 pt-8 sm:px-6 lg:pt-12">
      <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-end">
        <div className="size-28 shrink-0 overflow-hidden rounded-xl border border-border bg-muted sm:size-36">
          {doctor.photo?.url ? (
            <Image
              src={doctor.photo.url}
              alt={fullName}
              width={288}
              height={288}
              className="size-full object-cover"
              priority
              placeholder={doctor.photo.blurDataUrl ? "blur" : "empty"}
              blurDataURL={doctor.photo.blurDataUrl ?? undefined}
            />
          ) : (
            <div className="flex size-full items-center justify-center text-3xl font-semibold text-muted-foreground">
              {doctor.name.first[0]}
              {doctor.name.last[0]}
            </div>
          )}
        </div>

        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <VerifiedBadgeExplainer level={doctor.verificationLevel} />
            <FoundingDoctorBadge isFounding={doctor.foundingDoctor?.isFounding} />
            {!doctor.isClaimed ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                Unclaimed profile
              </span>
            ) : null}
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{fullName}</h1>
          <p className="mt-1 text-lg text-muted-foreground">
            {primarySpecialty?.name ?? "Doctor"}
            {doctor.specialties.length > 1 ? (
              <span className="text-muted-foreground/70">
                {" "}· {doctor.specialties.slice(1).map((s) => s.name).join(", ")}
              </span>
            ) : null}
          </p>
          {doctor.designation || doctor.institute ? (
            <p className="mt-1 text-sm text-foreground/90">
              {doctor.designation ? <span className="font-medium">{doctor.designation}</span> : null}
              {doctor.designation && doctor.institute ? (
                <span className="text-muted-foreground"> · </span>
              ) : null}
              {doctor.institute ? <span>{doctor.institute}</span> : null}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {primaryChamber ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-4" aria-hidden="true" />
                <Link
                  href={`/${encodeURIComponent(primarySpecialty?.name.toLowerCase() ?? "doctors")}/${encodeURIComponent(primaryChamber.district.toLowerCase())}`}
                  className="hover:underline"
                >
                  {primaryChamber.area}, {primaryChamber.district}
                </Link>
              </span>
            ) : null}
            {typeof doctor.yearsOfExperience === "number" ? (
              <span className="inline-flex items-center gap-1">
                <Award className="size-4" aria-hidden="true" />
                {doctor.yearsOfExperience}+ years experience
              </span>
            ) : null}
            {doctor.bmdcNumber ? (
              <span className="inline-flex items-center gap-1">
                <IdCard className="size-4" aria-hidden="true" />
                BMDC Reg. {doctor.bmdcNumber}
                {doctor.bmdcVerified ? (
                  <BadgeCheck
                    className="size-3.5 text-sky-600"
                    aria-label="BMDC registration verified"
                  />
                ) : null}
              </span>
            ) : null}
            {doctor.institute ? (
              <span className="inline-flex items-center gap-1 lg:hidden">
                <Building2 className="size-4" aria-hidden="true" />
                {doctor.institute}
              </span>
            ) : null}
            {views30d >= VIEW_CHIP_MIN ? (
              <span className="inline-flex items-center gap-1">
                <Eye className="size-4" aria-hidden="true" />
                {Intl.NumberFormat("en-IN").format(views30d)} views this month
              </span>
            ) : doctor.profileViews >= VIEW_CHIP_MIN ? (
              <span className="inline-flex items-center gap-1">
                <Eye className="size-4" aria-hidden="true" />
                {Intl.NumberFormat("en-IN").format(doctor.profileViews)} profile views
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
