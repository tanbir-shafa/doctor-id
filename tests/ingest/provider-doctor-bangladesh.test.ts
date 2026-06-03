import {describe, it, expect} from "vitest";
import {promises as fs} from "node:fs";
import path from "node:path";
import {
    buildSpecialtyLookup,
    extractFromProse,
    loadDoctorBangladesh,
    normalizeDoctorBangladeshPost,
    parseYoast,
    type DoctorBangladeshPost,
} from "../../scripts/lib/providers/doctor-bangladesh";

const LOOKUP = buildSpecialtyLookup([
    {name: "Cardiology", fhirCode: "394579002"},
    {name: "Dermatology", fhirCode: "394582007"},
    {name: "Colorectal Surgery", fhirCode: "408471003"},
    {name: "Surgery", fhirCode: "394609007"},
]);

describe("parseYoast", () => {
    it("extracts name/specialty/district from the canonical og_title shape", () => {
        const y = parseYoast({
            og_title: "Dr. M. S. Newaz - Skin Specialist in Pabna",
            og_description: "Dr. M. S. Newaz - Skin Specialist in Pabna now at Mid Town Diagnostic Center, Pabna. Find …",
        });
        expect(y.name).toBe("Dr. M. S. Newaz");
        expect(y.specialty).toBe("Skin Specialist");
        expect(y.district).toBe("Pabna");
        expect(y.chamber).toBe("Mid Town Diagnostic Center, Pabna");
    });

    it("handles Prof. Dr. prefix", () => {
        const y = parseYoast({
            og_title: "Prof. Dr. Riaz Uddin Ahmad - Dermatologist in Dhaka",
        });
        expect(y.name).toBe("Prof. Dr. Riaz Uddin Ahmad");
        expect(y.specialty).toBe("Dermatologist");
        expect(y.district).toBe("Dhaka");
    });

    it("returns empty fields when nothing parses", () => {
        expect(parseYoast({})).toEqual({});
        expect(parseYoast({og_title: "Random title without dash"})).toEqual({});
    });
});

describe("extractFromProse", () => {
    const content = `<h2>About Dr. M. S. Newaz</h2>
<p>Dr. M. S. Newaz is a Skin Specialist in Pabna. His qualification is MBBS, DD (Thailand, Japan). He is a Former Consultant, Dermatology &amp; Venereology at 250 Bedded General Hospital, Pabna. He regularly provides treatment to his patients at Mid Town Diagnostic Center, Pabna. Practicing hour of Dr. M. S. Newaz at Mid Town Diagnostic Center, Pabna is 10am to 8pm (Closed: Friday).</p>`;

    it("pulls specialty, district, qualification, designation, institute, chamber, hours", () => {
        const p = extractFromProse(content);
        expect(p.specialty).toBe("Skin Specialist");
        expect(p.district).toBe("Pabna");
        expect(p.qualification).toContain("MBBS");
        expect(p.qualification).toContain("DD (Thailand, Japan)");
        expect(p.designation).toMatch(/Former Consultant/i);
        expect(p.institute).toMatch(/250 Bedded General Hospital/);
        expect(p.primaryChamber).toBe("Mid Town Diagnostic Center, Pabna");
        expect(p.practicingHourText).toBe("10am to 8pm (Closed: Friday)");
    });

    it("decodes &amp; and other HTML entities", () => {
        const html =
            "<p>Dr. X is a Specialist in Dhaka. He is a Skin, Sex, Allergy &amp; Leprosy Specialist at Hospital Y.</p>";
        const p = extractFromProse(html);
        expect(p.designation ?? "").not.toContain("&amp;");
    });
});

describe("normalizeDoctorBangladeshPost confidence ladder", () => {
    it("marks 'high' confidence when Yoast + chamber both resolve", () => {
        const post: DoctorBangladeshPost = {
            id: 31,
            slug: "dr-m-s-newaz",
            title: {rendered: "Dr. M. S. Newaz"},
            content: {
                rendered:
                    "<h2>About Dr. M. S. Newaz</h2><p>Dr. M. S. Newaz is a Skin Specialist in Pabna. His qualification is MBBS, DD. He is a Former Consultant at 250 Bedded General Hospital, Pabna. He regularly provides treatment to his patients at Mid Town Diagnostic Center, Pabna. Practicing hour of Dr. M. S. Newaz at Mid Town Diagnostic Center, Pabna is 10am to 8pm (Closed: Friday).</p>",
            },
            yoast_head_json: {
                og_title: "Dr. M. S. Newaz - Skin Specialist in Pabna",
                og_description:
                    "Dr. M. S. Newaz - Skin Specialist in Pabna now at Mid Town Diagnostic Center, Pabna. Find …",
            },
        };
        const c = normalizeDoctorBangladeshPost(post, LOOKUP, "2026-05-30T06:17:20.414Z");
        expect(c).not.toBeNull();
        expect(c!.sourceMeta.confidence).toBe("high");
        expect(c!.fields.specialties?.[0]?.name).toBe("Dermatology");
        expect(c!.fields.chambers?.[0]?.city).toBe("Pabna");
        expect(c!.fields.chambers?.[0]?.schedule.length).toBe(6); // Friday closed
    });

    it("marks 'medium' when Yoast is missing but prose extracts specialty + chamber", () => {
        const post: DoctorBangladeshPost = {
            id: 50,
            slug: "dr-x",
            title: {rendered: "Dr. X Y"},
            content: {
                rendered:
                    "<p>Dr. X Y is a Cardiologist in Dhaka. He regularly provides treatment to his patients at Apollo Hospital.</p>",
            },
            yoast_head_json: {},
        };
        const c = normalizeDoctorBangladeshPost(post, LOOKUP, "x");
        expect(c!.sourceMeta.confidence).toBe("medium");
        expect(c!.fields.specialties?.[0]?.name).toBe("Cardiology");
    });

    it("marks 'low' when only the name parses", () => {
        const post: DoctorBangladeshPost = {
            id: 99,
            slug: "ghost",
            title: {rendered: "Dr. Ghost"},
            content: {rendered: "<p>Nothing useful here.</p>"},
            yoast_head_json: {},
        };
        const c = normalizeDoctorBangladeshPost(post, LOOKUP, "x");
        expect(c!.sourceMeta.confidence).toBe("low");
        expect(c!.fields.chambers).toBeUndefined();
        expect(c!.fields.specialties).toBeUndefined();
    });

    it("returns null for posts with no parseable name", () => {
        const post: DoctorBangladeshPost = {
            id: 99,
            slug: "x",
            title: {rendered: ""},
            content: {rendered: ""},
        };
        expect(normalizeDoctorBangladeshPost(post, LOOKUP, "x")).toBeNull();
    });
});

describe("real-fixture smoke test", () => {
    it("normalizes id 31 from disk and lands at 'high' confidence", async () => {
        const post: DoctorBangladeshPost = JSON.parse(
            await fs.readFile(
                path.join(process.cwd(), "data", "doctor-bangladesh", "details", "31.json"),
                "utf8",
            ),
        );
        const c = normalizeDoctorBangladeshPost(post, LOOKUP, "x");
        expect(c).not.toBeNull();
        expect(c!.sourceMeta.confidence).toBe("high");
        expect(c!.fields.name.last).toBe("Newaz");
        expect(c!.fields.specialties?.[0]?.name).toBe("Dermatology");
        expect(c!.fields.chambers?.[0]?.city).toBe("Pabna");
    });
});

describe("loadDoctorBangladesh async iterator", () => {
    it("yields CanonicalCandidates with source=doctor-bangladesh", async () => {
        const collected = [];
        for await (const c of loadDoctorBangladesh({specialtyLookup: LOOKUP, limit: 3})) {
            collected.push(c);
        }
        expect(collected.length).toBeLessThanOrEqual(3);
        expect(collected.length).toBeGreaterThan(0);
        for (const c of collected) {
            expect(c.sourceMeta.source).toBe("doctor-bangladesh");
        }
    });
});
