import type { ReactNode } from "react";
import Link from "next/link";
import { DoctorCard } from "./doctor-card";
import { Pagination } from "./pagination";
import { HubFaqSection } from "./hub-faq-section";
import type { DoctorDocLike } from "@/types/doctor";

/**
 * Reusable listing layout for /[specialty] and /[specialty]/[district].
 *
 * SEO-critical surface — the H1 + intro paragraph are the strongest signals
 * for "[Specialty] in [District]" search queries. The `intro`, `faq` and
 * `whyNote` slots carry the unique, per-URL hub copy (built in hub-text.ts) that
 * keeps these programmatic pages from reading as thin / duplicate content; the
 * page also emits matching ItemList + FAQPage JSON-LD alongside this markup.
 */
export function SpecialtyListing({
  specialtyName,
  specialtySlug,
  district,
  doctors,
  total,
  page,
  totalPages,
  districts,
  searchParams,
  intro,
  faq,
  whyNote,
  pathPrefix = "",
  heading,
  localeAlternate,
}: {
  specialtyName: string;
  /** Canonical catalog slug — drives the district pivot + "all" cross-links. */
  specialtySlug: string;
  district?: string;
  doctors: DoctorDocLike[];
  total: number;
  page: number;
  totalPages: number;
  districts: string[];
  searchParams: Record<string, string | string[] | undefined>;
  /** Unique, per-URL hub intro paragraph (hub-text.ts). Falls back to a generic line. */
  intro?: ReactNode;
  /** Visible hub FAQ — must mirror the FAQPage JSON-LD emitted by the page. */
  faq?: { question: string; answer: string }[];
  /** One-line verification trust note rendered at the foot of the content. */
  whyNote?: string;
  /** Locale path prefix for internal hub links (e.g. "/bn"); "" for English. */
  pathPrefix?: string;
  /** Override the H1 (e.g. the Bangla heading on /bn pages). */
  heading?: string;
  /** Link to the same page in the other language (en↔bn toggle). */
  localeAlternate?: { href: string; label: string };
}) {
  const districtLabel = district ? ` in ${district}` : " in Bangladesh";

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
        {district ? (
          <Link
            href={`${pathPrefix}/${specialtySlug}`}
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            ← All {specialtyName} doctors in Bangladesh
          </Link>
        ) : (
          <p className="text-sm font-medium uppercase tracking-wider text-primary">{specialtyName}</p>
        )}
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          {heading ?? `${specialtyName} doctors${districtLabel}`}
        </h1>
        {intro ? (
          <div className="mt-3 max-w-3xl text-muted-foreground">{intro}</div>
        ) : (
          <p className="mt-3 max-w-3xl text-muted-foreground">
            Browse {Intl.NumberFormat("en-IN").format(total)} {specialtyName.toLowerCase()}{" "}
            doctors{districtLabel}. Filter by district, verification, or language. Every profile is
            matched to public BMDC records.
          </p>
        )}
      </header>

      {/* District pivot bar — links to /<specialty>/<district> */}
      {!district && districts.length > 0 ? (
        <nav className="mb-8 flex flex-wrap gap-2" aria-label={`${specialtyName} doctors by district`}>
          {districts.map((d) => (
            <Link
              key={d}
              href={`${pathPrefix}/${specialtySlug}/${encodeURIComponent(d.toLowerCase())}`}
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

      <HubFaqSection faq={faq} whyNote={whyNote} />
    </section>
  );
}
