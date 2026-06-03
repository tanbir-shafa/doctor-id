import { describe, it, expect } from "vitest";
import { buildSpecialtyLookup, resolveSpecialty } from "../../scripts/lib/normalize/specialty";

// Representative slice of the real catalog (canonical spellings) + the fallback bucket.
const CATALOG = [
  "Cardiology", "Pediatrics", "Dermatology", "General Medicine", "Neurology", "Orthopedics",
  "Ophthalmology", "ENT", "Obstetrics & Gynaecology", "Endocrinology", "Gastroenterology",
  "Nephrology", "Pulmonology", "Rheumatology", "Oncology", "Pediatric Surgery", "Hepatology",
  "Nutrition & Dietetics", "Pathology", "Neonatology", "Physical Medicine & Rehabilitation",
  "Radiology", "Other / Unspecified",
].map((name) => ({ name, fhirCode: null }));
const lookup = buildSpecialtyLookup(CATALOG);
const r = (s: string) => resolveSpecialty(s, lookup);

describe("resolveSpecialty — layered matching (Phase 0a)", () => {
  it("exact canonical (high)", () => {
    expect(r("Cardiology")).toMatchObject({ name: "Cardiology", confidence: "high" });
  });

  it("normalizes punctuation: 'E.N.T' → ENT", () => {
    expect(r("E.N.T")).toMatchObject({ name: "ENT", confidence: "high" });
  });

  it("order-independent token-set: 'Gynaecology & Obstetrics' / 'Gynae & Obs.' → 'Obstetrics & Gynaecology'", () => {
    expect(r("Gynaecology & Obstetrics")?.name).toBe("Obstetrics & Gynaecology");
    expect(r("Gynae & Obs.")?.name).toBe("Obstetrics & Gynaecology");
  });

  it("British spelling: Orthopaedics → Orthopedics; Paediatric Surgery → Pediatric Surgery", () => {
    expect(r("Orthopaedics")?.name).toBe("Orthopedics");
    expect(r("Paediatric Surgery")?.name).toBe("Pediatric Surgery");
  });

  it("typo recovery (Levenshtein ≤2, medium)", () => {
    expect(r("Onclogy")).toMatchObject({ name: "Oncology", confidence: "medium" });
    expect(r("Endocrionology")?.name).toBe("Endocrinology");
    expect(r("Heapatology")?.name).toBe("Hepatology");
  });

  it("keyword → canonical for descriptive strings (medium)", () => {
    expect(r("Chest & Respiratory Medicine")?.name).toBe("Pulmonology");
    expect(r("Diet and Nutrition")?.name).toBe("Nutrition & Dietetics");
    expect(r("Skin & STD")?.name).toBe("Dermatology");
    expect(r("Newborn & Child Specialist")?.name).toBe("Neonatology");
    expect(r("Physiotherapy")?.name).toBe("Physical Medicine & Rehabilitation");
    expect(r("ortho & spine")?.name).toBe("Orthopedics");
  });

  it("off-catalog policy: Biochemistry / Microbiology / Forensic Medicine → Pathology", () => {
    expect(r("Biochemistry")?.name).toBe("Pathology");
    expect(r("Microbiology")?.name).toBe("Pathology");
    expect(r("Forensic Medicine")?.name).toBe("Pathology");
  });

  it("genuinely non-allopathic → 'Other / Unspecified' with confidence 'fallback' (gate-excluded)", () => {
    expect(r("Natural Medicine")).toMatchObject({
      name: "Other / Unspecified",
      confidence: "fallback",
    });
  });

  it("fallback only fires when the catalog carries the bucket (else null)", () => {
    const noFallback = buildSpecialtyLookup(CATALOG.filter((c) => c.name !== "Other / Unspecified"));
    expect(resolveSpecialty("Natural Medicine", noFallback)).toBeNull();
  });

  it("routes non-clinical strings to the fallback bucket, not a real specialty", () => {
    // token-set requires ALL of a canonical's tokens, so unrelated admin text can't
    // latch onto a specialty — it lands in the gate-excluded fallback instead.
    expect(r("Hospital Administration")).toMatchObject({
      name: "Other / Unspecified",
      confidence: "fallback",
    });
  });
});
