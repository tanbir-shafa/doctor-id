import Image from "next/image";
import Link from "next/link";
import { MapPin, Clock, Briefcase, Languages, ChevronRight } from "lucide-react";
import { VerifiedBadge } from "@/components/profile/verified-badge";
import { cn } from "@/lib/utils";
import type { DoctorDocLike, ChamberScheduleSlot } from "@/types/doctor";

// Bangladesh week starts Saturday — mirrors the ordering used by the Rx-pad
// schedule formatter (lib/rx-pad/dto.ts).
const DAY_ORDER = ["sat", "sun", "mon", "tue", "wed", "thu", "fri"] as const;
const DAY_LABEL: Record<(typeof DAY_ORDER)[number], string> = {
  sat: "Sat",
  sun: "Sun",
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
};

/**
 * Compact "consulting days" label from a chamber's schedule. Collapses a
 * contiguous run to a range ("Sat–Thu"), 6+ days to "Most days", else lists
 * them ("Sat · Mon · Wed"). Returns null when there's no schedule.
 *
 * We surface *days*, not a real-time "available now" badge: the schema has no
 * leave/holiday data, so anything stronger would overclaim.
 */
function formatConsultingDays(schedule: ChamberScheduleSlot[] | undefined): string | null {
  if (!schedule?.length) return null;
  const present = DAY_ORDER.filter((d) =>
    schedule.some((s) => s.day === d && s.available !== false),
  );
  if (present.length === 0) return null;
  if (present.length >= 6) return "Most days";
  const idx = present.map((d) => DAY_ORDER.indexOf(d));
  const contiguous = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
  if (contiguous && present.length >= 3) {
    return `${DAY_LABEL[present[0]]}–${DAY_LABEL[present[present.length - 1]]}`;
  }
  return present.map((d) => DAY_LABEL[d]).join(" · ");
}

export type DoctorCardView = "list" | "grid";

/**
 * Search-result card (Option A — "clinical résumé row"), with two layouts
 * driven by one DOM via CSS-grid placement (no duplicate markup):
 *
 *   • Tile (default everywhere; the only mobile layout, and the desktop "grid"
 *     view): picture + name/specialty on the top row, then education and the
 *     rest **full-width under the picture** for maximum credential visibility.
 *
 *   • Row (desktop "list" view only — `view="list"` adds `sm:` overrides):
 *     picture far left, name + credentials in the middle, a right rail of
 *     decision signals (consulting days, location). This is the prior desktop
 *     card.
 *
 * The grid areas:
 *   mobile / grid →  [avatar][ident]        list desktop →  [avatar][ident][rail]
 *                    [ detail full  ]                        [avatar][detail][rail]
 *                    [ rail   full  ]
 *
 * Every field degrades gracefully when absent, so it works for rich claimed
 * profiles and sparse ingested ones alike.
 */
export function DoctorCard({
  doctor,
  view = "list",
}: {
  doctor: DoctorDocLike;
  view?: DoctorCardView;
}) {
  const isList = view === "list";

  const primarySpecialty = doctor.specialties.find((s) => s.isPrimary) ?? doctor.specialties[0];
  const primaryChamber = doctor.chambers.find((c) => c.isPrimary) ?? doctor.chambers[0];
  const fullName = doctor.name.displayName;

  const degrees = (doctor.qualifications ?? []).map((q) => q.degree).filter(Boolean);
  const degreeLine = degrees.slice(0, 4).join(", ") + (degrees.length > 4 ? "…" : "");
  const affiliation = [doctor.designation, doctor.institute].filter(Boolean).join(" · ");
  const experience =
    typeof doctor.yearsOfExperience === "number" && doctor.yearsOfExperience > 0
      ? `${doctor.yearsOfExperience} yrs experience`
      : null;
  const languages = doctor.languages?.length ? doctor.languages.join(", ") : null;
  const consultingDays = formatConsultingDays(primaryChamber?.schedule);
  const location = primaryChamber ? `${primaryChamber.area}, ${primaryChamber.city}` : null;

  return (
    <Link
      href={`/${doctor.slug}`}
      className={cn(
        // h-full + an expanding detail row (auto/1fr/auto) lets tiles fill an
        // equal-height grid cell and pins the rail to the bottom, so cards stay
        // uniform whether a doctor has lots of detail or very little.
        "group grid h-full grid-cols-[auto_1fr] grid-rows-[auto_1fr_auto] gap-x-3 gap-y-2 rounded-xl border border-border bg-card p-4 transition hover:border-primary hover:shadow-sm",
        isList && "sm:grid-cols-[auto_1fr_auto] sm:grid-rows-[auto_auto] sm:gap-x-4 sm:gap-y-1.5",
      )}
    >
      {/* avatar — top-left on the tile; spans both rows on the list row */}
      <div
        className={cn(
          "col-start-1 row-start-1 size-14 shrink-0 self-start overflow-hidden rounded-xl",
          isList && "sm:row-span-2",
        )}
      >
        {doctor.photo?.url ? (
          <Image
            src={doctor.photo.url}
            alt={fullName}
            width={56}
            height={56}
            className="size-full object-cover"
          />
        ) : (
          <div className="grid size-full place-items-center bg-accent text-base font-semibold text-primary ring-1 ring-inset ring-primary/15">
            {doctor.name.first[0]}
            {doctor.name.last[0]}
          </div>
        )}
      </div>

      {/* ident — name + verification + specialty, beside the picture */}
      <div className="col-start-2 row-start-1 min-w-0 self-center">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="truncate text-[15px] font-semibold text-foreground group-hover:text-primary">
            {fullName}
          </h3>
          <VerifiedBadge level={doctor.verificationLevel} />
        </div>
        <p className="mt-0.5 text-sm font-medium text-primary">
          {primarySpecialty?.name ?? "Doctor"}
        </p>
      </div>

      {/* detail — education + affiliation + meta, full-width under the picture */}
      <div
        className={cn(
          "col-start-1 col-span-2 row-start-2 min-w-0",
          isList && "sm:col-start-2 sm:col-span-1",
        )}
      >
        {degreeLine ? <p className="truncate text-sm text-foreground/80">{degreeLine}</p> : null}
        {affiliation ? (
          <p className="truncate text-xs text-muted-foreground">{affiliation}</p>
        ) : null}
        {experience || languages ? (
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {experience ? (
              <span className="inline-flex items-center gap-1.5">
                <Briefcase className="size-3.5 shrink-0" aria-hidden="true" />
                {experience}
              </span>
            ) : null}
            {languages ? (
              <span className="inline-flex items-center gap-1.5">
                <Languages className="size-3.5 shrink-0" aria-hidden="true" />
                {languages}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* decision rail — full-width strip under the card (tile) / right column (list row) */}
      <div
        className={cn(
          "col-start-1 col-span-2 row-start-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border pt-3 text-xs",
          isList &&
            "sm:col-start-3 sm:col-span-1 sm:row-start-1 sm:row-span-2 sm:flex-col sm:items-end sm:gap-1.5 sm:border-t-0 sm:pt-0 sm:text-right",
        )}
      >
        {consultingDays ? (
          <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
            <Clock className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
            {consultingDays}
          </span>
        ) : null}
        {location ? (
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
            {location}
          </span>
        ) : null}
        <span
          className={cn(
            "ml-auto inline-flex items-center gap-0.5 font-medium text-primary",
            isList &&
              "sm:ml-0 sm:mt-auto sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100",
          )}
        >
          View profile
          <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
        </span>
      </div>
    </Link>
  );
}
