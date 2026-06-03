import type { Loose } from "@/lib/db/models/loose";
import type { Metadata } from "next";
import Link from "next/link";
import { searchDoctors, listCities } from "@/lib/db/queries/doctors";
import { Specialty } from "@/lib/db/models";
import { dbConnect } from "@/lib/db/mongoose";
import { DoctorCard, type DoctorCardView } from "@/components/search/doctor-card";
import { ViewToggle } from "@/components/search/view-toggle";
import { SearchFilters } from "@/components/search/search-filters";
import { ActiveFilters, countActiveFilters } from "@/components/search/active-filters";
import { Pagination } from "@/components/search/pagination";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Find a doctor",
  description:
    "Search verified doctors in Bangladesh by specialty, city, language, and more. Updated daily.",
};

// Plain server-rendered search; no client JS needed for results.
export const dynamic = "force-dynamic";

interface SearchParamsRaw {
  q?: string;
  specialty?: string;
  city?: string;
  page?: string;
  verificationLevel?: string;
  language?: string;
  gender?: string;
  sort?: string;
  view?: string;
}

async function getSpecialties() {
  await dbConnect();
  const rows = await (Specialty as unknown as Loose)
    .find({ active: true })
    .select("name slug")
    .sort({ sortOrder: 1 })
    .lean();
  return rows as unknown as { name: string; slug: string }[];
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsRaw>;
}) {
  const sp = await searchParams;
  const view: DoctorCardView = sp.view === "grid" ? "grid" : "list";
  const [{ doctors, total, page, totalPages }, specialties, cities] = await Promise.all([
    searchDoctors({
      q: sp.q,
      specialty: sp.specialty,
      city: sp.city,
      page: sp.page ? Number(sp.page) : 1,
      verificationLevel: sp.verificationLevel as never,
      language: sp.language,
      gender: sp.gender as never,
      sort: (sp.sort as never) ?? (sp.q ? "relevance" : "verified"),
    }),
    getSpecialties(),
    listCities(),
  ]);

  return (
    <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Find a doctor</h1>
        <p className="mt-2 text-muted-foreground">
          {Intl.NumberFormat("en-IN").format(total)} verified profiles · sorted by{" "}
          <span className="font-medium text-foreground">{sp.sort ?? (sp.q ? "relevance" : "verified")}</span>
        </p>
      </header>

      <form method="get" className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-4">
        {/* preserve the chosen layout when filters are applied */}
        {view === "grid" ? <input type="hidden" name="view" value="grid" /> : null}
        <SearchFilters
          activeCount={countActiveFilters(sp as Record<string, string | string[] | undefined>, {
            excludeQuery: true,
          })}
          searchInput={
            <input
              type="search"
              name="q"
              defaultValue={sp.q ?? ""}
              placeholder="Name, condition, hospital…"
              className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:col-span-2"
            />
          }
        >
        <select
          name="specialty"
          defaultValue={sp.specialty ?? ""}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">Any specialty</option>
          {specialties.map((s) => (
            <option key={s.slug} value={s.name}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          name="city"
          defaultValue={sp.city ?? ""}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">Any city</option>
          {cities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          name="verificationLevel"
          defaultValue={sp.verificationLevel ?? ""}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">Any verification</option>
          <option value="fully_verified">Fully verified</option>
          <option value="bmdc_verified">BMDC verified</option>
          <option value="unverified">Unverified</option>
        </select>
        <select
          name="gender"
          defaultValue={sp.gender ?? ""}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">Any gender</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
        </select>
        <select
          name="sort"
          defaultValue={sp.sort ?? (sp.q ? "relevance" : "verified")}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="relevance">Relevance</option>
          <option value="verified">Verified first</option>
          <option value="completeness">Most complete</option>
          <option value="name">Name (A–Z)</option>
        </select>
        <button
          type="submit"
          className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Search
        </button>
        </SearchFilters>
      </form>

      <div className="mt-6 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <ActiveFilters sp={sp as Record<string, string | string[] | undefined>} />
        </div>
        <ViewToggle current={view} params={sp as Record<string, string | string[] | undefined>} />
      </div>

      {doctors.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
          No doctors match those filters yet.{" "}
          <Link href="/search" className="text-primary hover:underline">
            Reset filters
          </Link>
        </p>
      ) : (
        <ul
          className={cn(
            "mt-4 grid gap-3",
            view === "grid"
              ? "grid-cols-1 sm:auto-rows-fr sm:grid-cols-2 lg:grid-cols-3"
              : "grid-cols-1",
          )}
        >
          {doctors.map((d) => (
            <li key={d.slug} className="h-full">
              <DoctorCard doctor={d} view={view} />
            </li>
          ))}
        </ul>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        searchParams={sp as Record<string, string | string[] | undefined>}
      />
    </section>
  );
}
