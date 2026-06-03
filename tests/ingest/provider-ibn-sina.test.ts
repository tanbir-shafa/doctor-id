import {describe, it, expect} from "vitest";
import {promises as fs} from "node:fs";
import path from "node:path";
import {
    buildSpecialtyLookup,
    loadIbnSina,
    normalizeIbnSinaDoctor,
    type IbnSinaDoctor,
} from "../../scripts/lib/providers/ibn-sina";

const LOOKUP = buildSpecialtyLookup([
    {name: "Endocrinology", fhirCode: "394583002"},
    {name: "Neurology", fhirCode: "394591006"},
    {name: "Cardiology", fhirCode: "394579002"},
    {name: "General Medicine", fhirCode: "419192003"},
]);

const DOCS_PATH = path.join(process.cwd(), "data", "ibn-sina", "doctors.json");

describe("normalizeIbnSinaDoctor with the first ibn-sina row", () => {
    it("populates designation, institute, languages from the structured fields", async () => {
        const all: IbnSinaDoctor[] = JSON.parse(await fs.readFile(DOCS_PATH, "utf8"));
        const c = normalizeIbnSinaDoctor(all[0]!, LOOKUP, "2026-05-28T21:20:31.923Z");
        expect(c).not.toBeNull();
        expect(c!.fields.name.last).toBe("Jahan");
        expect(c!.fields.designation).toBe("Professor");
        expect(c!.fields.institute).toMatch(/Bangladesh Medical University/);
        expect(c!.fields.languages).toEqual(["English", "Bangla"]);
        expect(c!.fields.specialties?.[0]?.name).toBe("Endocrinology");
        expect(c!.sourceMeta.source).toBe("ibn-sina");
        expect(c!.sourceMeta.confidence).toBe("high");
    });

    it("uses the per-branch schedule[] array when present", async () => {
        const all: IbnSinaDoctor[] = JSON.parse(await fs.readFile(DOCS_PATH, "utf8"));
        const c = normalizeIbnSinaDoctor(all[0]!, LOOKUP, "2026-05-28T21:20:31.923Z");
        const chamber = c!.fields.chambers?.[0];
        expect(chamber).toBeDefined();
        // First doctor's schedule has Sun/Mon/Wed/Sat 5:30 PM - 9:00 PM
        const days = chamber!.schedule.map((s) => s.day).sort();
        expect(days).toEqual(["mon", "sat", "sun", "wed"]);
        expect(chamber!.schedule[0]!.startTime).toBe("17:30");
        expect(chamber!.schedule[0]!.endTime).toBe("21:00");
    });

    it("falls back to expandChamberTime when schedule[] is empty", () => {
        const stub: IbnSinaDoctor = {
            id: 9999,
            name: "Dr. Stub",
            mobile: null,
            email: null,
            image: null,
            degree: "MBBS",
            gender: null,
            branches: [
                {
                    branch_id: 1,
                    name: "Test Branch",
                    map: "Some Street, Gandaria, Dhaka",
                    phone: "01711000000",
                    chamber_time: "(10:00 AM-01:00 PM)",
                    off_day: "TUE,FRI",
                    schedule: [],
                },
            ],
            specialty: "Cardiology",
            specialists: [],
        };
        const c = normalizeIbnSinaDoctor(stub, LOOKUP, "2026-01-01T00:00:00.000Z");
        const chamber = c!.fields.chambers?.[0];
        const days = chamber!.schedule.map((s) => s.day).sort();
        // Days present: Sun, Mon, Wed, Thu, Sat (Tue and Fri are off)
        expect(days).toEqual(["mon", "sat", "sun", "thu", "wed"]);
        for (const s of chamber!.schedule) {
            expect(s.startTime).toBe("10:00");
            expect(s.endTime).toBe("13:00");
        }
    });

    it("resolves chamber address to Gandaria/Dhaka", () => {
        const stub: IbnSinaDoctor = {
            id: 1,
            name: "Dr. X",
            mobile: null,
            email: null,
            image: null,
            degree: null,
            gender: null,
            branches: [
                {
                    branch_id: 6,
                    name: "Ibn Sina Doyagonj",
                    map: "28, Doyagonj (Hut lane), Gandaria, Dhaka-1204",
                    phone: "09610009615",
                },
            ],
            specialists: [],
        };
        const c = normalizeIbnSinaDoctor(stub, LOOKUP, "2026-01-01T00:00:00.000Z");
        expect(c!.fields.chambers?.[0]?.area).toBe("Gandaria");
        expect(c!.fields.chambers?.[0]?.city).toBe("Dhaka");
    });

    it("returns null when name is unparseable", () => {
        const c = normalizeIbnSinaDoctor(
            {id: 0, name: "", mobile: null, email: null, image: null, degree: null, gender: null} as IbnSinaDoctor,
            LOOKUP,
            "x",
        );
        expect(c).toBeNull();
    });
});

describe("loadIbnSina async iterator", () => {
    it("yields CanonicalCandidates with source=ibn-sina honoring --limit", async () => {
        const collected = [];
        for await (const c of loadIbnSina({specialtyLookup: LOOKUP, limit: 4})) {
            collected.push(c);
        }
        expect(collected.length).toBeLessThanOrEqual(4);
        expect(collected.length).toBeGreaterThan(0);
        for (const c of collected) {
            expect(c.sourceMeta.source).toBe("ibn-sina");
        }
    });
});
