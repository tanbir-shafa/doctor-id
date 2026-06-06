import { dbConnect } from "@/lib/db/mongoose";
import { Doctor } from "@/lib/db/models";
import { withApiHandler, ApiNotFoundError } from "@/lib/api/response";
import { toFhirPractitioner } from "@/lib/fhir/practitioner";
import type { DoctorDocLike } from "@/types/doctor";

/**
 * GET /api/v1/doctors/[slug]
 *
 * Returns a single FHIR Practitioner with embedded PractitionerRole entries
 * (one per chamber). Cached at the CDN for 1 minute — long enough to absorb
 * most read traffic but short enough that profile edits show up quickly.
 */
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  // The DB lookup runs INSIDE withApiHandler so the first-party + rate-limit
  // gates fire before we touch Mongo.
  return withApiHandler(
    async () => {
      await dbConnect();
      const doc = await Doctor.findOne({ slug: slug.toLowerCase(), status: "published" }).lean();
      if (!doc) throw new ApiNotFoundError("Doctor not found.");
      const doctor = JSON.parse(JSON.stringify(doc)) as DoctorDocLike;
      return toFhirPractitioner(doctor);
    },
    { cacheSeconds: 60 },
  );
}
