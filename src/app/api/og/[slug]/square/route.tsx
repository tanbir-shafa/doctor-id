import {ImageResponse} from "next/og";
import {dbConnect} from "@/lib/db/mongoose";
import {Doctor} from "@/lib/db/models";
import type {DoctorDocLike} from "@/types/doctor";

/**
 * Loop D — 1080×1080 OG variant.
 *
 * Square aspect is what WhatsApp Status / Facebook posts / Instagram /
 * "save and share" stories all use. The 1200×630 sibling route at
 * `/api/og/[slug]` is for `og:image` link previews; this one is for the
 * download-and-paste flow.
 *
 * Satori constraints (same as the 1200×630 sibling):
 *   - every parent div with >1 child must declare `display: flex`
 *   - no emoji glyphs (Satori downloads a dynamic font per glyph; flaky)
 *   - inline styles only (no Tailwind)
 */
export const runtime = "nodejs";
export const dynamic = "force-static";
export const revalidate = 86400;

const SIZE = 1080;

export async function GET(
    _req: Request,
    ctx: {params: Promise<{slug: string}>},
) {
    const {slug} = await ctx.params;
    await dbConnect();
    const raw = await Doctor.findOne({slug: slug.toLowerCase(), status: "published"})
        .select("name specialties chambers verificationLevel photo designation institute")
        .lean();
    if (!raw) {
        return new ImageResponse(
            (
                <div style={{...fallbackStyle, display: "flex"}}>
                    <div style={{fontSize: 56, fontWeight: 700, display: "flex"}}>doctor.id.bd</div>
                    <div style={{fontSize: 28, color: "#64748b", display: "flex"}}>Profile not found</div>
                </div>
            ),
            {width: SIZE, height: SIZE},
        );
    }
    const doc = JSON.parse(JSON.stringify(raw)) as DoctorDocLike & {
        designation?: string | null;
        institute?: string | null;
    };
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
              : "Profile on doctor.id.bd";

    return new ImageResponse(
        (
            <div
                style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    padding: 72,
                    background: "linear-gradient(160deg, #0e9ba0 0%, #0c7a85 100%)",
                    color: "white",
                    fontFamily: "system-ui",
                }}
            >
                {/* Top bar */}
                <div style={{display: "flex", alignItems: "center", gap: 14, fontSize: 28, opacity: 0.9}}>
                    <div
                        style={{
                            width: 18,
                            height: 18,
                            borderRadius: 999,
                            background: "white",
                            display: "flex",
                        }}
                    />
                    <div style={{display: "flex"}}>doctor.id.bd</div>
                </div>

                {/* Main column */}
                <div
                    style={{
                        flex: 1,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 28,
                    }}
                >
                    {doc.photo?.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={doc.photo.url}
                            alt=""
                            width={280}
                            height={280}
                            style={{
                                borderRadius: 999,
                                objectFit: "cover",
                                border: "8px solid rgba(255,255,255,0.6)",
                            }}
                        />
                    ) : (
                        <div
                            style={{
                                width: 280,
                                height: 280,
                                borderRadius: 999,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                background: "rgba(255,255,255,0.15)",
                                fontSize: 120,
                                fontWeight: 800,
                            }}
                        >
                            {doc.name.first[0]}
                            {doc.name.last[0]}
                        </div>
                    )}

                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            textAlign: "center",
                            gap: 12,
                        }}
                    >
                        <div
                            style={{
                                fontSize: 64,
                                fontWeight: 800,
                                lineHeight: 1.1,
                                display: "flex",
                                textAlign: "center",
                            }}
                        >
                            {fullName}
                        </div>
                        <div
                            style={{
                                fontSize: 38,
                                opacity: 0.95,
                                display: "flex",
                            }}
                        >
                            {primary?.name ?? "Doctor"}
                        </div>
                        {doc.designation || doc.institute ? (
                            <div style={{fontSize: 26, opacity: 0.85, display: "flex"}}>
                                {[doc.designation, doc.institute].filter(Boolean).join(" · ")}
                            </div>
                        ) : null}
                        {chamber ? (
                            <div style={{fontSize: 26, marginTop: 6, opacity: 0.8, display: "flex"}}>
                                {chamber.area}, {chamber.district}
                            </div>
                        ) : null}
                    </div>

                    {isVerified ? (
                        <div
                            style={{
                                display: "flex",
                                fontSize: 26,
                                fontWeight: 600,
                                padding: "10px 22px",
                                borderRadius: 999,
                                background: "rgba(255,255,255,0.18)",
                                border: "2px solid rgba(255,255,255,0.45)",
                            }}
                        >
                            {verifyLabel}
                        </div>
                    ) : null}
                </div>

                {/* Footer */}
                <div
                    style={{
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        fontSize: 26,
                        opacity: 0.9,
                    }}
                >
                    <div style={{display: "flex"}}>doctor.id.bd / {doc.slug}</div>
                </div>
            </div>
        ),
        {width: SIZE, height: SIZE},
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
