import type { NextRequest } from "next/server";
import { searchDoctors } from "@/lib/db/queries/doctors";
import { withApiHandler } from "@/lib/api/response";
import { toFhirPractitioner } from "@/lib/fhir/practitioner";

/**
 * GET /api/v1/doctors
 *
 * Query params: q, specialty, city, page, pageSize, verificationLevel, sort.
 * Responds with `{ data: FhirPractitioner[], pagination: { ... } }` so EMR
 * consumers see canonical FHIR while keeping pagination outside the bundle.
 */
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const params = {
    q: url.searchParams.get("q") ?? undefined,
    specialty: url.searchParams.get("specialty") ?? undefined,
    city: url.searchParams.get("city") ?? undefined,
    verificationLevel: (url.searchParams.get("verificationLevel") as never) ?? undefined,
    language: url.searchParams.get("language") ?? undefined,
    gender: (url.searchParams.get("gender") as never) ?? undefined,
    sort: (url.searchParams.get("sort") as never) ?? undefined,
    page: url.searchParams.get("page") ? Number(url.searchParams.get("page")) : 1,
    pageSize: url.searchParams.get("pageSize") ? Number(url.searchParams.get("pageSize")) : 20,
  };

  return withApiHandler(
    async () => {
      const { doctors, total, page, pageSize, totalPages } = await searchDoctors(params);
      return {
        data: doctors.map(toFhirPractitioner),
        pagination: { page, pageSize, total, totalPages },
      };
    },
    { cacheSeconds: 60 },
  );
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}
