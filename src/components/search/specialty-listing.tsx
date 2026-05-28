import Link from "next/link";
import { DoctorCard } from "./doctor-card";
import { Pagination } from "./pagination";
import type { DoctorDocLike } from "@/types/doctor";

/**
 * Reusable listing layout for /[specialty] and /[specialty]/[city].
 *
 * SEO-critical surface — the H1 + intro paragraph are the strongest signals
 * for "[Specialty] in [City]" search queries.
 */
export function SpecialtyListing({
  specialtyName,
  city,
  doctors,
  total,
  page,
  totalPages,
  cities,
  searchParams,
}: {
  specialtyName: string;
  city?: string;
  doctors: DoctorDocLike[];
  total: number;
  page: number;
  totalPages: number;
  cities: string[];
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const cityLabel = city ? ` in ${city}` : " in Bangladesh";

  return (
    <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <header className="mb-8">
        <p className="text-sm font-medium uppercase tracking-wider text-primary">
          {specialtyName}
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          {specialtyName} doctors{cityLabel}
        </h1>
        <p className="mt-3 max-w-3xl text-muted-foreground">
          Browse {Intl.NumberFormat("en-IN").format(total)} verified {specialtyName.toLowerCase()}{" "}
          doctors{cityLabel}. Filter by city, verification, or language. Every profile is BMDC-aligned.
        </p>
      </header>

      {/* City pivot bar — links to /<specialty>/<city> */}
      {!city && cities.length > 0 ? (
        <nav className="mb-8 flex flex-wrap gap-2" aria-label={`${specialtyName} doctors by city`}>
          {cities.map((c) => (
            <Link
              key={c}
              href={`/${encodeURIComponent(specialtyName.toLowerCase())}/${encodeURIComponent(c.toLowerCase())}`}
              className="rounded-full border border-border bg-card px-3 py-1 text-sm text-foreground hover:border-primary/40 hover:bg-accent"
            >
              {c}
            </Link>
          ))}
        </nav>
      ) : null}

      {doctors.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
          No {specialtyName.toLowerCase()} doctors found{cityLabel}. Try widening your filters.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
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
