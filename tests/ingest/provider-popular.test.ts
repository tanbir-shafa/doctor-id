import {describe, it, expect} from "vitest";
import {promises as fs} from "node:fs";
import path from "node:path";
import {
    buildSpecialtyLookup,
    loadPopular,
    normalizePopularDoctor,
    toCanonicalCandidate,
    type PopularDetail,
} from "../../scripts/lib/providers/popular";

const FIXTURE_PATH = path.join(process.cwd(), "data", "popular-diagnostic", "details", "2094.json");

const LOOKUP = buildSpecialtyLookup([
    {name: "Cardiology", fhirCode: "394579002"},
    {name: "Endocrinology", fhirCode: "394583002"},
    {name: "General Medicine", fhirCode: "419192003"},
    {name: "Pediatrics", fhirCode: "394537008"},
]);

describe("toCanonicalCandidate", () => {
    it("produces a fully-populated CanonicalCandidate from the 2094 fixture", async () => {
        const detail: PopularDetail = JSON.parse(await fs.readFile(FIXTURE_PATH, "utf8"));
        const norm = normalizePopularDoctor(detail, 2094, LOOKUP);
        const c = toCanonicalCandidate(norm, "2026-05-28T19:37:42.796Z");

        expect(c).not.toBeNull();
        expect(c!.sourceMeta).toEqual({
            source: "popular-diagnostic",
            sourceId: "2094",
            sourceUrl: "https://populardiagnostic.com/doctor/2094",
            scrapedAt: "2026-05-28T19:37:42.796Z",
            confidence: "high",
        });

        // Dedup keys
        expect(c!.dedupKeys.phone).toBe("+8801711563450");
        expect(c!.dedupKeys.nameKey).toMatch(/nazrul/i);
        expect(c!.dedupKeys.specialtyDistrictKey).toBe("cardiology|dhaka");
        expect(c!.dedupKeys.chamberAddressKeys?.[0]).toBe("dhanmondi|dhaka");

        // Fields
        expect(c!.fields.name.last).toBe("Islam");
        expect(c!.fields.gender).toBe("male");
        expect(c!.fields.specialties?.[0]?.name).toBe("Cardiology");
        expect(c!.fields.chambers?.[0]?.name).toBe("Popular Diagnostic — Dhanmondi");
    });

    it("returns null when name is unparseable", () => {
        const norm = normalizePopularDoctor(
            {
                name: "",
                mobile: null,
                email: null,
                image: null,
                degree: null,
                gender: null,
                specialists: [],
                branches: [],
                schedule: [],
            } as PopularDetail,
            0,
            LOOKUP,
        );
        const c = toCanonicalCandidate(norm, "2026-01-01T00:00:00.000Z");
        expect(c).toBeNull();
    });
});

describe("loadPopular (async iterator)", () => {
    it("yields CanonicalCandidates honoring --limit", async () => {
        const collected = [];
        for await (const c of loadPopular({specialtyLookup: LOOKUP, limit: 3})) {
            collected.push(c);
        }
        expect(collected).toHaveLength(3);
        for (const c of collected) {
            expect(c.sourceMeta.source).toBe("popular-diagnostic");
            // Confidence is always "high" for structured sources.
            expect(c.sourceMeta.confidence).toBe("high");
            // Every emitted candidate must have a parseable name.
            expect(c.fields.name.displayName.length).toBeGreaterThan(0);
        }
    });
});
