import Link from "next/link";
import { DoctorCard } from "./doctor-card";
import { Pagination } from "./pagination";
import type { DoctorDocLike } from "@/types/doctor";

/**
 * Reusable listing layout for /[specialty] and /[specialty]/[district].
 *
 * SEO-critical surface — the H1 + intro paragraph are the strongest signals
 * for "[Specialty] in [District]" search queries.
 */
export function SpecialtyListing({
  specialtyName,
  district,
  doctors,
  total,
  page,
  totalPages,
  districts,
  searchParams,
}: {
  specialtyName: string;
  district?: string;
  doctors: DoctorDocLike[];
  total: number;
  page: number;
  totalPages: number;
  districts: string[];
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const districtLabel = district ? ` in ${district}` : " in Bangladesh";

  return (
    <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <header className="mb-8">
        <p className="text-sm font-medium uppercase tracking-wider text-primary">
          {specialtyName}
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          {specialtyName} doctors{districtLabel}
        </h1>
        <p className="mt-3 max-w-3xl text-muted-foreground">
          Browse {Intl.NumberFormat("en-IN").format(total)} verified {specialtyName.toLowerCase()}{" "}
          doctors{districtLabel}. Filter by district, verification, or language. Every profile is BMDC-aligned.
        </p>
      </header>

      {/* District pivot bar — links to /<specialty>/<district> */}
      {!district && districts.length > 0 ? (
        <nav className="mb-8 flex flex-wrap gap-2" aria-label={`${specialtyName} doctors by district`}>
          {districts.map((d) => (
            <Link
              key={d}
              href={`/${encodeURIComponent(specialtyName.toLowerCase())}/${encodeURIComponent(d.toLowerCase())}`}
              className="rounded-full border border-border bg-card px-3 py-1 text-sm text-foreground hover:border-primary/40 hover:bg-accent"
            >
              {d}
            </Link>
          ))}
        </nav>
      ) : null}

      {doctors.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
          No {specialtyName.toLowerCase()} doctors found{districtLabel}. Try widening your filters.
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
    </section>
  );
}
