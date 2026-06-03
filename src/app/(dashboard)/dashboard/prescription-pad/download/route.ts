import { headers } from "next/headers";
import { renderToBuffer } from "@react-pdf/renderer";
import { auth } from "@/lib/auth/config";
import { dbConnect } from "@/lib/db/mongoose";
import { Doctor } from "@/lib/db/models";
import { buildRxPadDto } from "@/lib/rx-pad/dto";
import { renderQrPngDataUrl } from "@/lib/qr/server";
import { RxPad } from "@/components/pdf/rx-pad";
import { publicEnv } from "@/lib/env";
import type { DoctorDocLike } from "@/types/doctor";

/**
 * A5 prescription pad — PDF download.
 *
 *   GET /dashboard/prescription-pad/download           → attachment (default)
 *   GET /dashboard/prescription-pad/download?inline=1  → inline (used by the iframe preview)
 *
 * Auth: doctor only — the action looks up the caller's own Doctor doc via
 * `ownerId`. There's no path parameter so a doctor can't accidentally
 * generate someone else's pad.
 *
 * Counter: every successful render increments `Doctor.flags.rxPadGenerations`
 * and stamps `rxPadGeneratedAt`. Sprint A's KPI billboard reads from this.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (session.user.role === "admin") {
    return new Response("Admins don't have a prescription pad.", { status: 403 });
  }

  await dbConnect();
  const doctorDoc = await Doctor.findOne({ ownerId: session.user.id }).lean();
  if (!doctorDoc) {
    return new Response("No profile found for your account.", { status: 404 });
  }
  const doctor = JSON.parse(JSON.stringify(doctorDoc)) as DoctorDocLike & { slug: string };

  // Build the DTO. If required fields are missing, bounce the caller back to
  // the preview page — the empty state there lists what to fix.
  const origin = await resolveOrigin();
  const result = buildRxPadDto(doctor, origin);
  if (!result.ok) {
    const url = new URL("/dashboard/prescription-pad", origin);
    url.searchParams.set("missing", result.missing.join(","));
    return Response.redirect(url, 303);
  }

  // Generate the QR (data URL) — points at the public profile.
  const qrDataUrl = await renderQrPngDataUrl(result.profileUrl, { size: 256 });

  // Render the PDF to a Buffer. `renderToBuffer` resolves once react-pdf has
  // fetched any remote images (the photo URL).
  let buffer: Buffer;
  try {
    buffer = await renderToBuffer(RxPad({ dto: { ...result, qrDataUrl } as never }));
  } catch (err) {
    console.error("Rx pad render failed", err);
    return new Response("Could not generate the prescription pad.", { status: 500 });
  }

  // Increment the counter — fire-and-forget; a failure here shouldn't
  // prevent the doctor from getting their pad.
  Doctor.updateOne(
    { _id: doctorDoc._id },
    {
      $set: { "flags.rxPadGeneratedAt": new Date() },
      $inc: { "flags.rxPadGenerations": 1 },
    },
  ).catch((err) => {
    console.error("Rx pad counter update failed", err);
  });

  const inline = new URL(req.url).searchParams.get("inline") === "1";
  const filename = `rx-pad-${doctor.slug}.pdf`;
  const disposition = inline ? "inline" : "attachment";

  // Convert Node Buffer → ArrayBuffer slice so Response accepts it as a
  // BodyInit without TS friction.
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );

  return new Response(arrayBuffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

async function resolveOrigin(): Promise<string> {
  // Prefer the request's own host so previews work behind ALB / ngrok / etc.
  const h = await headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  if (host) return `${proto}://${host}`;
  return publicEnv.NEXT_PUBLIC_APP_URL;
}
