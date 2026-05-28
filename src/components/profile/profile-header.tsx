import Image from "next/image";
import Link from "next/link";
import { Eye, MapPin } from "lucide-react";
import { VerifiedBadge } from "./verified-badge";
import type { DoctorDocLike } from "@/types/doctor";

export function ProfileHeader({ doctor }: { doctor: DoctorDocLike }) {
  const primarySpecialty = doctor.specialties.find((s) => s.isPrimary) ?? doctor.specialties[0];
  const primaryChamber = doctor.chambers.find((c) => c.isPrimary) ?? doctor.chambers[0];
  const fullName = `${doctor.name.prefix} ${doctor.name.displayName}`;

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
            <VerifiedBadge level={doctor.verificationLevel} />
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
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {primaryChamber ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-4" aria-hidden="true" />
                <Link
                  href={`/${encodeURIComponent(primarySpecialty?.name.toLowerCase() ?? "doctors")}/${encodeURIComponent(primaryChamber.city.toLowerCase())}`}
                  className="hover:underline"
                >
                  {primaryChamber.area}, {primaryChamber.city}
                </Link>
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1">
              <Eye className="size-4" aria-hidden="true" />
              {Intl.NumberFormat("en-IN").format(doctor.profileViews)} profile views
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
