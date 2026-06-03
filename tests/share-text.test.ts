// @vitest-environment node
import {describe, it, expect, beforeAll} from "vitest";
import type {DoctorDocLike} from "@/types/doctor";

let buildShareText: typeof import("@/lib/share/text").buildShareText;
let buildShareTextForDoctor: typeof import("@/lib/share/text").buildShareTextForDoctor;
let buildWhatsappShareUrl: typeof import("@/lib/share/text").buildWhatsappShareUrl;

beforeAll(async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://doctor.id.bd";
    const mod = await import("@/lib/share/text");
    buildShareText = mod.buildShareText;
    buildShareTextForDoctor = mod.buildShareTextForDoctor;
    buildWhatsappShareUrl = mod.buildWhatsappShareUrl;
});

function doc(over: Partial<DoctorDocLike> = {}): DoctorDocLike {
    return {
        ownerType: "doctor",
        ownerId: "u1",
        slug: "dr-karim-rahman-cardiologist",
        bmdcVerified: true,
        nidVerified: false,
        verificationLevel: "bmdc_verified",
        name: {prefix: "Dr.", first: "Karim", last: "Rahman", displayName: "Dr. Karim Rahman"},
        languages: [],
        specialties: [{name: "Cardiology", isPrimary: true}],
        qualifications: [],
        experience: [],
        chambers: [
            {
                name: "Apollo",
                address: "100 Road",
                area: "Dhanmondi",
                city: "Dhaka",
                division: "Dhaka",
                schedule: [],
                isPrimary: true,
            },
        ],
        registrations: [],
        contact: {},
        profileCompletenessScore: 100,
        profileViews: 0,
        isClaimed: false,
        status: "published",
        createdAt: new Date(),
        updatedAt: new Date(),
        ...over,
    };
}

describe("buildShareText", () => {
    it("emits three lines: name, specialty · chamber, URL", () => {
        const t = buildShareTextForDoctor(doc());
        expect(t.split("\n")).toEqual([
            "Dr. Karim Rahman",
            "Cardiology · Dhanmondi, Dhaka",
            "https://doctor.id.bd/dr-karim-rahman-cardiologist",
        ]);
    });

    it("falls back to name + URL when no specialty / chamber", () => {
        const t = buildShareTextForDoctor(doc({specialties: [], chambers: []}));
        expect(t.split("\n")).toEqual([
            "Dr. Karim Rahman",
            "https://doctor.id.bd/dr-karim-rahman-cardiologist",
        ]);
    });

    it("doesn't duplicate Dr. when displayName already includes it", () => {
        const t = buildShareText({
            displayName: "Prof. Dr. Karim Rahman",
            prefix: "Prof. Dr.",
            slug: "x",
        });
        expect(t.split("\n")[0]).toBe("Prof. Dr. Karim Rahman");
    });

    it("trims trailing slash on app URL", async () => {
        process.env.NEXT_PUBLIC_APP_URL = "https://doctor.id.bd/";
        // re-import to refresh the cached env
        const fresh = await import("@/lib/share/text");
        const t = fresh.buildShareText({displayName: "Dr. X", slug: "y"});
        expect(t.endsWith("https://doctor.id.bd/y")).toBe(true);
        expect(t).not.toContain("//y");
        process.env.NEXT_PUBLIC_APP_URL = "https://doctor.id.bd";
    });
});

describe("buildWhatsappShareUrl", () => {
    it("URL-encodes the text", () => {
        const url = buildWhatsappShareUrl("Hello, Dr. X");
        expect(url).toBe("https://wa.me/?text=Hello%2C%20Dr.%20X");
    });

    it("does not include a recipient phone (opens contact-picker sheet)", () => {
        const url = buildWhatsappShareUrl("hi");
        expect(url).toBe("https://wa.me/?text=hi");
        expect(url).not.toMatch(/wa\.me\/8801/);
    });
});
