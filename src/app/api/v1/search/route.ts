import type { NextRequest } from "next/server";
import { searchDoctors } from "@/lib/db/queries/doctors";
import { withApiHandler } from "@/lib/api/response";

/**
 * GET /api/v1/search?q=...
 *
 * Identical query semantics to /api/v1/doctors but returns a leaner payload
 * shaped for typeahead / search-bar consumers (no FHIR envelope).
 */
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const page = url.searchParams.get("page") ? Number(url.searchParams.get("page")) : 1;
  const pageSize = Math.min(20, url.searchParams.get("pageSize") ? Number(url.searchParams.get("pageSize")) : 10);

  return withApiHandler(
    async () => {
      const { doctors, total } = await searchDoctors({ q, page, pageSize, sort: "relevance" });
      return {
        query: q,
        total,
        results: doctors.map((d) => ({
          slug: d.slug,
          name: `${d.name.prefix} ${d.name.displayName}`,
          specialty: d.specialties.find((s) => s.isPrimary)?.name ?? d.specialties[0]?.name ?? null,
          city: d.chambers.find((c) => c.isPrimary)?.city ?? d.chambers[0]?.city ?? null,
          verificationLevel: d.verificationLevel,
          photo: d.photo?.url ?? null,
          url: `/${d.slug}`,
        })),
      };
    },
    { cacheSeconds: 30 },
  );
}
