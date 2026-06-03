import type { Loose } from "@/lib/db/models/loose";
import { dbConnect } from "@/lib/db/mongoose";
import { Specialty } from "@/lib/db/models";
import { withApiHandler } from "@/lib/api/response";

/**
 * GET /api/v1/specialties
 *
 * Lightweight catalog endpoint — only active specialties, sorted by display
 * order. Cached for 1 hour.
 */
export const runtime = "nodejs";

export async function GET() {
  return withApiHandler(
    async () => {
      await dbConnect();
      const rows = await (Specialty as unknown as Loose)
        .find({ active: true })
        .sort({ sortOrder: 1, name: 1 })
        .lean();
      return {
        data: (rows as unknown[]).map((r) => {
          const s = r as { name: string; nameBangla?: string; slug: string; snomedCode?: string; fhirCode?: string };
          return {
            name: s.name,
            nameBangla: s.nameBangla,
            slug: s.slug,
            snomedCode: s.snomedCode,
            fhirCode: s.fhirCode,
          };
        }),
      };
    },
    { cacheSeconds: 3600 },
  );
}
