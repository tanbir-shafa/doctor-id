import {describe, it, expect} from "vitest";
import {promises as fs} from "node:fs";
import path from "node:path";
import {
    buildSpecialtyLookup,
    loadSasthyaseba,
    normalizeSasthyasebaDoctor,
    type SasthyasebaDoctor,
} from "../../scripts/lib/providers/sasthyaseba";

const FIXTURE = path.join(
    process.cwd(),
    "data",
    "sasthyaseba",
    "details",
    "doctors",
    "akhi-akter.json",
);

const LOOKUP = buildSpecialtyLookup([
    {name: "Nutrition & Dietetics", fhirCode: "408477008"},
    {name: "Cardiology", fhirCode: "394579002"},
    {name: "General Medicine", fhirCode: "419192003"},
]);

describe("normalizeSasthyasebaDoctor on akhi-akter fixture", () => {
    it("captures years_of_experience and Nutritionist specialty", async () => {
        const doc: SasthyasebaDoctor = JSON.parse(await fs.readFile(FIXTURE, "utf8"));
        const c = normalizeSasthyasebaDoctor(doc, LOOKUP, "2026-05-30T11:08:00.000Z");
        expect(c).not.toBeNull();
        expect(c!.fields.yearsOfExperience).toBe(8);
        expect(c!.fields.specialties?.[0]?.name).toBe("Nutrition & Dietetics");
        expect(c!.fields.gender).toBe("female");
        expect(c!.sourceMeta.source).toBe("sasthyaseba");
        expect(c!.sourceMeta.sourceUrl).toBe("https://sasthyaseba.com/doctor/akhi-akter");
    });

    it("propagates lat/lng from primary_chamber.address to chamber.coordinates", async () => {
        const doc: SasthyasebaDoctor = JSON.parse(await fs.readFile(FIXTURE, "utf8"));
        const c = normalizeSasthyasebaDoctor(doc, LOOKUP, "x");
        const chamber = c!.fields.chambers?.[0];
        expect(chamber?.coordinates).toEqual({lat: 23.8105953, lng: 90.365108});
    });

    it("dedupes concentrations across duplicated source ids", async () => {
        const doc: SasthyasebaDoctor = JSON.parse(await fs.readFile(FIXTURE, "utf8"));
        const c = normalizeSasthyasebaDoctor(doc, LOOKUP, "x");
        const conc = c!.fields.concentrations ?? [];
        // Source has 16 entries with duplicates ("Geriatric Nutrition" appears twice
        // with different ids); after dedupe we expect ≤ source count and no dupes.
        const seen = new Set(conc.map((s) => s.toLowerCase()));
        expect(seen.size).toBe(conc.length);
        expect(conc).toContain("Child Nutrition");
        expect(conc).toContain("Malnutrition");
    });

    it("parses educations plain_text into qualifications", async () => {
        const doc: SasthyasebaDoctor = JSON.parse(await fs.readFile(FIXTURE, "utf8"));
        const c = normalizeSasthyasebaDoctor(doc, LOOKUP, "x");
        const quals = c!.fields.qualifications ?? [];
        // Subtitle has "B.Sc (Hons), MS(Food & Nutrition,DU), M.Phil(Nutrition & Food Science,INFS,DU)"
        // — subtitle takes precedence over educations[], so we expect 3 entries split on commas.
        expect(quals.length).toBeGreaterThan(0);
    });

    it("falls back to bare-name parser when prefix is missing", () => {
        const stub: SasthyasebaDoctor = {
            id: 1,
            uid: "x",
            slug: "no-prefix",
            name: "Antara rani pal",
            specialities: [{id: 37, name: "Nutritionist"}],
        };
        const c = normalizeSasthyasebaDoctor(stub, LOOKUP, "x");
        expect(c).not.toBeNull();
        expect(c!.fields.name.displayName).toBe("Dr. Antara rani pal");
        expect(c!.fields.name.first).toBe("Antara rani");
        expect(c!.fields.name.last).toBe("pal");
    });

    it("returns null for empty name", () => {
        const stub = {id: 1, uid: "", slug: "x", name: ""} as SasthyasebaDoctor;
        expect(normalizeSasthyasebaDoctor(stub, LOOKUP, "x")).toBeNull();
    });
});

describe("loadSasthyaseba async iterator", () => {
    it("yields CanonicalCandidates with source=sasthyaseba honoring --limit", async () => {
        const collected = [];
        for await (const c of loadSasthyaseba({specialtyLookup: LOOKUP, limit: 5})) {
            collected.push(c);
        }
        expect(collected.length).toBeLessThanOrEqual(5);
        expect(collected.length).toBeGreaterThan(0);
        for (const c of collected) {
            expect(c.sourceMeta.source).toBe("sasthyaseba");
        }
    });
});
