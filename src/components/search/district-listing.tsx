import type { ReactNode } from "react";
import Link from "next/link";
import { DoctorCard } from "./doctor-card";
import { Pagination } from "./pagination";
import { HubFaqSection } from "./hub-faq-section";
import type { DoctorDocLike } from "@/types/doctor";

/**
 * District-only hub layout for /doctors-in-[district] — all specialties in one
 * district. Targets "doctor in [district]" head terms. Differs from
 * SpecialtyListing in two ways: the pivot lists specialties (→ /<specialty>/<district>)
 * rather than districts, and the nearby module links sibling district hubs.
 * Shares DoctorCard / Pagination / HubFaqSection with the specialty hub.
 */
export function DistrictListing({
  district,
  doctors,
  page,
  totalPages,
  specialties,
  nearby,
  searchParams,
  intro,
  faq,
  whyNote,
  pathPrefix = "",
  heading,
  localeAlternate,
}: {
  district: string;
  doctors: DoctorDocLike[];
  page: number;
  totalPages: number;
  /** Specialties with supply in this district — the M2b pivot. */
  specialties: { specialtyName: string; specialtySlug: string }[];
  /** Sibling district names with supply — the M3 nearby module. */
  nearby: string[];
  searchParams: Record<string, string | string[] | undefined>;
  intro?: ReactNode;
  faq?: { question: string; answer: string }[];
  whyNote?: string;
  /** Locale path prefix for internal hub links (e.g. "/bn"); "" for English. */
  pathPrefix?: string;
  /** Override the H1 (e.g. the Bangla heading on /bn pages). */
  heading?: string;
  /** Link to the same page in the other language (en↔bn toggle). */
  localeAlternate?: { href: string; label: string };
}) {
  const districtLower = district.toLowerCase();

  return (
    <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <header className="mb-8">
        {localeAlternate ? (
          <div className="mb-3">
            <Link
              href={localeAlternate.href}
              className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground hover:border-primary hover:text-primary"
            >
              {localeAlternate.label}
            </Link>
          </div>
        ) : null}
        <p className="text-sm font-medium uppercase tracking-wider text-primary">Doctors by district</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          {heading ?? `Doctors in ${district}`}
        </h1>
        {intro ? <div className="mt-3 max-w-3xl text-muted-foreground">{intro}</div> : null}
      </header>

      {/* Specialty pivot — links to /<specialty>/<district> */}
      {specialties.length > 0 ? (
        <nav className="mb-8 flex flex-wrap gap-2" aria-label={`Specialties in ${district}`}>
          {specialties.map((s) => (
            <Link
              key={s.specialtySlug}
              href={`${pathPrefix}/${s.specialtySlug}/${encodeURIComponent(districtLower)}`}
              className="rounded-full border border-border bg-card px-3 py-1 text-sm text-foreground hover:border-primary/40 hover:bg-accent"
            >
              {s.specialtyName}
            </Link>
          ))}
        </nav>
      ) : null}

      {doctors.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
          No doctors found in {district}. Try a nearby district below.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3">
          {doctors.map((d) => (
            <li key={d.slug}>
              <DoctorCard doctor={d} />
            </li>
          ))}
        </ul>
      )}

      <Pagination page={page} totalPages={totalPages} searchParams={searchParams} />

      {/* Nearby district hubs (M3) */}
      {nearby.length > 0 ? (
        <nav className="mt-10 border-t border-border pt-6" aria-label="Nearby districts">
          <p className="mb-2 text-sm font-medium text-foreground">Nearby districts</p>
          <div className="flex flex-wrap gap-2">
            {nearby.map((n) => (
              <Link
                key={n}
                href={`${pathPrefix}/doctors-in-${encodeURIComponent(n.toLowerCase())}`}
                className="rounded-full border border-border bg-card px-3 py-1 text-sm text-foreground hover:border-primary/40 hover:bg-accent"
              >
                Doctors in {n}
              </Link>
            ))}
          </div>
        </nav>
      ) : null}

      <HubFaqSection faq={faq} whyNote={whyNote} />
    </section>
  );
}
