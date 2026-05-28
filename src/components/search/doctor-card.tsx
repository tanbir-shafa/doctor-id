import Image from "next/image";
import Link from "next/link";
import { MapPin, Eye } from "lucide-react";
import { VerifiedBadge } from "@/components/profile/verified-badge";
import type { DoctorDocLike } from "@/types/doctor";

export function DoctorCard({ doctor }: { doctor: DoctorDocLike }) {
  const primarySpecialty = doctor.specialties.find((s) => s.isPrimary) ?? doctor.specialties[0];
  const primaryChamber = doctor.chambers.find((c) => c.isPrimary) ?? doctor.chambers[0];
  const fullName = `${doctor.name.prefix} ${doctor.name.displayName}`;

  return (
    <Link
      href={`/${doctor.slug}`}
      className="group flex gap-4 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/40"
    >
      <div className="size-16 shrink-0 overflow-hidden rounded-md bg-muted">
        {doctor.photo?.url ? (
          <Image
            src={doctor.photo.url}
            alt={fullName}
            width={64}
            height={64}
            className="size-full object-cover"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-sm font-semibold text-muted-foreground">
            {doctor.name.first[0]}
            {doctor.name.last[0]}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate font-semibold text-foreground group-hover:text-primary">{fullName}</h3>
          <VerifiedBadge level={doctor.verificationLevel} className="hidden sm:inline-flex" />
        </div>
        <p className="text-sm text-muted-foreground">{primarySpecialty?.name ?? "Doctor"}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {primaryChamber ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" aria-hidden="true" />
              {primaryChamber.area}, {primaryChamber.city}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1">
            <Eye className="size-3.5" aria-hidden="true" />
            {Intl.NumberFormat("en-IN").format(doctor.profileViews)} views
          </span>
        </div>
      </div>
    </Link>
  );
}
