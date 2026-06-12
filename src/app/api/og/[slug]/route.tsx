import { ImageResponse } from "next/og";
import { dbConnect } from "@/lib/db/mongoose";
import { Doctor } from "@/lib/db/models";
import type { DoctorDocLike } from "@/types/doctor";

/**
 * Dynamic OG image for /[slug] profile pages.
 *
 * Rendered with Satori (via next/og). 1200×630 — the OG/Twitter standard.
 * Cached for a day at the CDN; doctors editing their profile see the old
 * image until cache expires. Acceptable tradeoff vs. the cold-render cost per
 * crawl.
 *
 * Satori requirements (lessons from earlier bugs):
 *   - every parent div with >1 child must declare `display: flex`
 *   - no emoji glyphs (Satori downloads a dynamic font per glyph; flaky)
 *   - inline styles only (no Tailwind)
 */
export const runtime = "nodejs";
export const dynamic = "force-static";
export const revalidate = 86400;

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  await dbConnect();
  const raw = await Doctor.findOne({ slug: slug.toLowerCase(), status: "published" })
    .select("name specialties chambers verificationLevel photo")
    .lean();
  if (!raw) {
    return new ImageResponse(
      (
        <div style={{ ...fallbackStyle, display: "flex" }}>
          <div style={{ fontSize: 48, fontWeight: 700, display: "flex" }}>Daktar.Link</div>
          <div style={{ fontSize: 24, color: "#64748b", display: "flex" }}>Profile not found</div>
        </div>
      ),
      { width: 1200, height: 630 },
    );
  }
  const doc = JSON.parse(JSON.stringify(raw)) as DoctorDocLike;
  const fullName = doc.name.displayName;
  const primary = doc.specialties.find((s) => s.isPrimary) ?? doc.specialties[0];
  const chamber = doc.chambers.find((c) => c.isPrimary) ?? doc.chambers[0];
  const isVerified =
    doc.verificationLevel === "fully_verified" || doc.verificationLevel === "bmdc_verified";
  const verifyLabel =
    doc.verificationLevel === "fully_verified"
      ? "Fully verified"
      : doc.verificationLevel === "bmdc_verified"
        ? "BMDC verified"
        : "Profile on Daktar.Link";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: 64,
          background: "linear-gradient(135deg, #0e9ba0 0%, #0c7a85 100%)",
          color: "white",
          fontFamily: "system-ui",
        }}
      >
        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 24, opacity: 0.85 }}>
          <div style={{ width: 14, height: 14, borderRadius: 999, background: "white", display: "flex" }} />
          <div style={{ display: "flex" }}>Daktar.Link</div>
        </div>

        {/* Main row */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 40 }}>
          {doc.photo?.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={doc.photo.url}
              alt=""
              width={220}
              height={220}
              style={{ borderRadius: 32, objectFit: "cover", border: "6px solid rgba(255,255,255,0.6)" }}
            />
          ) : (
            <div
              style={{
                width: 220,
                height: 220,
                borderRadius: 32,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(255,255,255,0.15)",
                fontSize: 96,
                fontWeight: 800,
              }}
            >
              {doc.name.first[0]}
              {doc.name.last[0]}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1.1, display: "flex" }}>{fullName}</div>
            <div style={{ fontSize: 36, marginTop: 12, opacity: 0.95, display: "flex" }}>{primary?.name ?? "Doctor"}</div>
            {chamber ? (
              <div style={{ fontSize: 26, marginTop: 16, opacity: 0.85, display: "flex" }}>
                {chamber.area}, {chamber.district}
              </div>
            ) : null}
            {isVerified ? (
              <div
                style={{
                  display: "flex",
                  marginTop: 20,
                  fontSize: 24,
                  fontWeight: 600,
                  padding: "8px 18px",
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.18)",
                  border: "2px solid rgba(255,255,255,0.45)",
                  alignSelf: "flex-start",
                }}
              >
                {verifyLabel}
              </div>
            ) : null}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 22, opacity: 0.85 }}>
          <div style={{ display: "flex" }}>{isVerified ? verifyLabel : "Profile on Daktar.Link"}</div>
          <div style={{ display: "flex" }}>daktar.link / {doc.slug}</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}

const fallbackStyle = {
  width: "100%",
  height: "100%",
  flexDirection: "column" as const,
  alignItems: "center" as const,
  justifyContent: "center" as const,
  gap: 16,
  background: "#f8fafc",
  color: "#0f172a",
};
