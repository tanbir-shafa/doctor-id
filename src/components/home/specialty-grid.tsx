import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * Specialty + district grid. Three jobs in one: patient navigation, SEO internal
 * links to the specialty / specialty+district landing pages where doctors rank on
 * Google, and competitive FOMO for doctors ("am I listed in mine?").
 */
export function SpecialtyGrid({
  specialties,
  districts,
}: {
  specialties: { name: string; slug: string }[];
  districts: string[];
}) {
  const topSpecialties = specialties.slice(0, 18);
  const topDistricts = districts.slice(0, 12);

  return (
    <section className="border-b border-border bg-muted/30">
      <div className="mx-auto max-w-5xl px-4 py-14">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Browse by specialty</h2>
            <p className="mt-2 text-muted-foreground">
              Find a verified specialist — or see who&apos;s listed in yours.
            </p>
          </div>
          <Link
            href="/search"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            All doctors <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>

        {topSpecialties.length > 0 ? (
          <ul className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {topSpecialties.map((s) => (
              <li key={s.slug}>
                <Link
                  href={`/${s.slug}`}
                  className="group flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium transition hover:border-primary hover:text-primary"
                >
                  {s.name}
                  <ArrowRight
                    className="size-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            ))}
          </ul>
        ) : null}

        {topDistricts.length > 0 ? (
          <div className="mt-8">
            <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Popular districts
            </p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {topDistricts.map((d) => (
                <li key={d}>
                  <Link
                    href={`/doctors-in-${encodeURIComponent(d.toLowerCase())}`}
                    className="inline-flex rounded-full border border-border bg-card px-4 py-1.5 text-sm text-foreground transition hover:border-primary hover:text-primary"
                  >
                    {d}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
