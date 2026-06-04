import {ImageResponse} from "next/og";
import {dbConnect} from "@/lib/db/mongoose";
import {Doctor} from "@/lib/db/models";
import {renderQrPngDataUrl} from "@/lib/qr/server";
import {publicEnv} from "@/lib/env";
import type {DoctorDocLike} from "@/types/doctor";

/**
 * Loop D — print-ready QR business card.
 *
 * Renders a 1050×600 PNG sized for standard BD visiting-card stock
 * (3.5"×2" at ~300dpi → 1050×600). Doctors download once and either:
 *   - paste it onto the back of their visiting card, or
 *   - include it on their prescription-pad header.
 *
 * The QR code resolves to `/<slug>` so a patient scan lands on the public
 * profile (where they can tap Book Appointment / WhatsApp).
 *
 * Satori constraints (same as the other OG routes):
 *   - every parent div with >1 child must declare `display: flex`
 *   - no emoji glyphs
 *   - inline styles only
 */
export const runtime = "nodejs";
export const dynamic = "force-static";
export const revalidate = 86400;

const WIDTH = 1050;
const HEIGHT = 600;

export async function GET(
    _req: Request,
    ctx: {params: Promise<{slug: string}>},
) {
    const {slug} = await ctx.params;
    await dbConnect();
    const raw = await Doctor.findOne({slug: slug.toLowerCase(), status: "published"})
        .select("name specialties chambers verificationLevel designation institute")
        .lean();
    if (!raw) {
        return new ImageResponse(
            (
                <div
                    style={{
                        width: "100%",
                        height: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "#f8fafc",
                        color: "#0f172a",
                        fontSize: 36,
                        fontFamily: "system-ui",
                    }}
                >
                    Profile not found
                </div>
            ),
            {width: WIDTH, height: HEIGHT},
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

    const profileUrl = `${publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/${doc.slug}`;
    const qrDataUrl = await renderQrPngDataUrl(profileUrl, {size: 480, margin: 1});

    return new ImageResponse(
        (
            <div
                style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    background: "white",
                    color: "#0f172a",
                    fontFamily: "system-ui",
                }}
            >
                {/* Left half — info */}
                <div
                    style={{
                        flex: 1,
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                        padding: "40px 48px",
                    }}
                >
                    <div style={{display: "flex", flexDirection: "column", gap: 6}}>
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                fontSize: 20,
                                color: "#0e9ba0",
                                fontWeight: 600,
                            }}
                        >
                            <div
                                style={{
                                    width: 14,
                                    height: 14,
                                    borderRadius: 999,
                                    background: "#0e9ba0",
                                    display: "flex",
                                }}
                            />
                            <div style={{display: "flex"}}>doctor.id.bd</div>
                        </div>
                        <div
                            style={{
                                fontSize: 44,
                                fontWeight: 800,
                                lineHeight: 1.05,
                                marginTop: 18,
                                display: "flex",
                            }}
                        >
                            {fullName}
                        </div>
                        <div
                            style={{
                                fontSize: 26,
                                color: "#475569",
                                marginTop: 4,
                                display: "flex",
                            }}
                        >
                            {primary?.name ?? "Doctor"}
                        </div>
                        {doc.designation ? (
                            <div style={{fontSize: 20, color: "#334155", marginTop: 12, display: "flex"}}>
                                {doc.designation}
                            </div>
                        ) : null}
                        {doc.institute ? (
                            <div style={{fontSize: 18, color: "#64748b", display: "flex"}}>
                                {doc.institute}
                            </div>
                        ) : null}
                    </div>

                    <div style={{display: "flex", flexDirection: "column", gap: 4}}>
                        {chamber ? (
                            <div style={{fontSize: 20, color: "#0f172a", display: "flex"}}>
                                {chamber.name}
                            </div>
                        ) : null}
                        {chamber ? (
                            <div style={{fontSize: 18, color: "#64748b", display: "flex"}}>
                                {chamber.area}, {chamber.district}
                            </div>
                        ) : null}
                        {isVerified ? (
                            <div
                                style={{
                                    display: "flex",
                                    alignSelf: "flex-start",
                                    marginTop: 12,
                                    fontSize: 16,
                                    fontWeight: 600,
                                    padding: "6px 14px",
                                    borderRadius: 999,
                                    background: "#e0f6f7",
                                    color: "#0c7a85",
                                    border: "1px solid #b9e8eb",
                                }}
                            >
                                BMDC verified
                            </div>
                        ) : null}
                    </div>
                </div>

                {/* Right half — QR */}
                <div
                    style={{
                        width: 460,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "#f8fafc",
                        borderLeft: "1px dashed #cbd5e1",
                        gap: 14,
                        padding: 32,
                    }}
                >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={qrDataUrl}
                        alt=""
                        width={380}
                        height={380}
                        style={{borderRadius: 12}}
                    />
                    <div style={{fontSize: 18, color: "#475569", display: "flex"}}>Scan to view profile</div>
                    <div style={{fontSize: 14, color: "#94a3b8", display: "flex"}}>
                        doctor.id.bd / {doc.slug}
                    </div>
                </div>
            </div>
        ),
        {width: WIDTH, height: HEIGHT},
    );
}
