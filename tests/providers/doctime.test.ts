import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  normalizeDoctimeDoctor,
  doctimeSourceUrl,
  buildSpecialtyLookup,
  type DoctimeEntry,
} from "@/../scripts/lib/providers/doctime";
import { SPECIALTY_CATALOG } from "@/../scripts/lib/specialty-catalog";

const LOOKUP = buildSpecialtyLookup(
  SPECIALTY_CATALOG.map((s) => ({ name: s.name, fhirCode: s.fhirCode })),
);
const SCRAPED = "2026-05-31T01:59:55.466Z";

// Wrap a `data` payload as a data/doctime/doctors.json row.
function entry(data: unknown, id = 100047): DoctimeEntry {
  return { id, data: data as DoctimeEntry["data"], localPhotoPath: `data/doctime/photos/${id}.jpg` };
}

describe("normalizeDoctimeDoctor", () => {
  it("maps the real 100047 fixture end-to-end", () => {
    const detail = JSON.parse(
      readFileSync(join(process.cwd(), "data/doctime/details/100047.json"), "utf8"),
    );
    const c = normalizeDoctimeDoctor(entry(detail.data), LOOKUP, SCRAPED);
    expect(c).not.toBeNull();
    if (!c) return;

    expect(c.fields.name.displayName).toBe("Dr. Tamim Islam");
    expect(c.fields.gender).toBe("male");
    expect(c.dedupKeys.nameKey).toBe("tamim islam");
    // reg_no → BMDC (both the dedupe key and the storable field).
    expect(c.dedupKeys.bmdc).toBe("81299");
    expect(c.fields.bmdcNumber).toBe("81299");
    // bio "None" is treated as empty.
    expect(c.fields.bio).toBeUndefined();
    // telemedicine-only: never any chamber.
    expect(c.fields.chambers).toBeUndefined();
    expect(c.fields.qualifications?.[0]).toMatchObject({
      degree: "MBBS",
      institution: "Rajshahi Medical College",
      year: 2016,
      country: "Bangladesh",
    });
    expect(c.fields.specialties?.some((s) => s.name === "General Medicine")).toBe(true);
    expect(c.sourceMeta.source).toBe("doctime");
    expect(c.sourceMeta.sourceId).toBe("100047");
    expect(c.sourceMeta.sourceUrl).toBe("https://api.doctime.net/api/doctors/100047");
  });

  it("resolves 'Dentistry' to Dental Surgery, NOT ENT (regression guard)", () => {
    const c = normalizeDoctimeDoctor(
      entry({
        user: { id: 9, name: "Dr. Test Dentist", gender: "Male" },
        specialities: [{ name: "Dentistry" }],
        reg_no: "3629",
      }),
      LOOKUP,
      SCRAPED,
    );
    expect(c?.fields.specialties?.[0].name).toBe("Dental Surgery");
  });

  it("reduces reg_no to a digits-only BMDC and drops junk/implausible values", () => {
    const mk = (reg_no: unknown) =>
      normalizeDoctimeDoctor(
        entry({ user: { id: 2, name: "Dr. Ayesha Khatun", gender: "Female" }, reg_no }),
        LOOKUP,
        SCRAPED,
      );
    // Prefixed / spaced / joined / suffixed forms all collapse to digits only.
    expect(mk("A-7676")?.dedupKeys.bmdc).toBe("7676");
    expect(mk("A 7383")?.dedupKeys.bmdc).toBe("7383");
    expect(mk("A7676")?.fields.bmdcNumber).toBe("7676");
    expect(mk("9908BDS")?.dedupKeys.bmdc).toBe("9908");
    expect(mk("87786")?.dedupKeys.bmdc).toBe("87786");
    expect(mk("A-7676")?.fields.gender).toBe("female");
    // Junk / implausible (not 4–7 digits) → no BMDC + a warning.
    for (const junk of [null, "N/A", "NOT APPLICABLE", "0", "88", "121"]) {
      const c = mk(junk);
      expect(c?.dedupKeys.bmdc).toBeUndefined();
      expect(c?.warnings).toContain("no valid reg_no (BMDC) on source record");
    }
  });

  it("derives designation + institute from the current experience", () => {
    const c = normalizeDoctimeDoctor(
      entry({
        user: { id: 3, name: "Dr. Karim Rahman", gender: "Male" },
        experiences: [
          { organization_name: "Old Clinic", designation: "MO", is_current: false },
          { organization_name: "BSMMU", designation: "Medical Officer", is_current: true },
        ],
      }),
      LOOKUP,
      SCRAPED,
    );
    expect(c?.fields.designation).toBe("Medical Officer");
    expect(c?.fields.institute).toBe("BSMMU");
  });

  it("returns null when the name is unparseable", () => {
    expect(normalizeDoctimeDoctor(entry({ user: { id: 1, gender: "Male" } }), LOOKUP, SCRAPED)).toBeNull();
    expect(normalizeDoctimeDoctor(entry({}), LOOKUP, SCRAPED)).toBeNull();
  });

  it("builds the API provenance URL", () => {
    expect(doctimeSourceUrl(123)).toBe("https://api.doctime.net/api/doctors/123");
  });
});
