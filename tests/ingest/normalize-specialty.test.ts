import {describe, it, expect} from "vitest";
import {
    buildSpecialtyLookup,
    resolveSpecialty,
    resolveSpecialties,
} from "../../scripts/lib/normalize/specialty";

// Test catalog mirrors the 47-entry catalog seeded in scripts/seed.ts (with
// SNOMED codes verified against the SIL Thailand FHIR IG + HL7 c80-practice-codes
// value set — see .claude/plans/act-like-a-data-sparkling-orbit.md).
// The few canonicals not listed here are absent from these tests only; full
// per-canonical seed validation is in scripts/seed.ts.
const CANON = buildSpecialtyLookup([
    {name: "Cardiology", fhirCode: "394579002"},
    {name: "Gynecology", fhirCode: "394586005"},
    {name: "Pediatrics", fhirCode: "394537008"},
    {name: "Dermatology", fhirCode: "394582007"},
    {name: "General Medicine", fhirCode: "419192003"},
    {name: "Neurology", fhirCode: "394591006"},
    {name: "Orthopedics", fhirCode: "394801008"},
    {name: "Ophthalmology", fhirCode: "394594003"},
    {name: "Psychiatry", fhirCode: "394587001"},
    {name: "Surgery", fhirCode: "394609007"},
    {name: "Urology", fhirCode: "394612005"},
    {name: "Oncology", fhirCode: "394593009"},
    {name: "Endocrinology", fhirCode: "394583002"},
    {name: "Gastroenterology", fhirCode: "394584008"},
    {name: "Nephrology", fhirCode: "394589003"},
    {name: "Pulmonology", fhirCode: "418112009"},
    {name: "Hematology", fhirCode: "394803006"},
    {name: "ENT", fhirCode: "418960008"},                       // FIXED — was 394605004
    {name: "Obstetrics & Gynaecology", fhirCode: "394585009"},  // RENAMED from "Obstetrics"
    {name: "Neurosurgery", fhirCode: "394610002"},
    {name: "Cardiothoracic Surgery", fhirCode: "394603008"},    // FIXED — was 408463005
    {name: "Vascular Surgery", fhirCode: "408463005"},          // FIXED — was 408464004
    {name: "Colorectal Surgery", fhirCode: "408464004"},        // FIXED — was 408471003
    {name: "Pediatric Surgery", fhirCode: "394539006"},
    {name: "Physical Medicine & Rehabilitation", fhirCode: "394602003"},
    {name: "Pain Medicine", fhirCode: "394882004"},             // FIXED — was 394913002
    {name: "Gynaecological Oncology", fhirCode: "408446006"},   // FIXED — was 394811001
    {name: "Sports Medicine", fhirCode: "1251536003"},          // FIXED — was 394821009
    {name: "Dental Surgery", fhirCode: "722163006"},            // FIXED — was 394592004
    {name: "Radiology", fhirCode: "394914008"},
    {name: "Nutrition & Dietetics", fhirCode: "722164000"},     // FIXED — was 408477008
    // NEW canonicals
    {name: "Anesthesiology", fhirCode: "394577000"},
    {name: "Pathology", fhirCode: "394595002"},
    {name: "Family Medicine", fhirCode: "419772000"},
    {name: "Neonatology", fhirCode: "408445005"},
    {name: "Hepatobiliary Surgery", fhirCode: "408474001"},
    {name: "Maxillofacial Surgery", fhirCode: "408465003"},
    {name: "Allergy & Immunology", fhirCode: "394805004"},
    {name: "Public Health Medicine", fhirCode: "408440000"},
    {name: "Hepatology", fhirCode: "408472002"},
    {name: "Diabetic Medicine", fhirCode: "408475000"},
    {name: "Critical Care Medicine", fhirCode: "408478003"},
]);

describe("resolveSpecialty (singular)", () => {
    it("hits canonical exactly with high confidence", () => {
        const r = resolveSpecialty("Cardiology", CANON);
        expect(r).toEqual({name: "Cardiology", fhirCode: "394579002", confidence: "high"});
    });

    it("is case-insensitive on canonical match", () => {
        expect(resolveSpecialty("DERMATOLOGY", CANON)?.name).toBe("Dermatology");
        expect(resolveSpecialty("pediatrics", CANON)?.name).toBe("Pediatrics");
    });

    it("resolves popular-diagnostic British spellings via alias map", () => {
        expect(resolveSpecialty("Gynaecology", CANON)?.name).toBe("Gynecology");
        expect(resolveSpecialty("Orthopaedics", CANON)?.name).toBe("Orthopedics");
        expect(resolveSpecialty("Paediatrics", CANON)?.name).toBe("Pediatrics");
    });

    it("resolves ibn-sina merged-label format via parenthesized hint", () => {
        const r = resolveSpecialty("Endocrinology (Medicine,Diabetes,Thyroid & Hormone)", CANON);
        expect(r?.name).toBe("Endocrinology");
        expect(r?.confidence).toBe("medium");
    });

    it("falls back to substring scan as last resort with medium confidence", () => {
        const r = resolveSpecialty("Junior Cardiology Fellow", CANON);
        expect(r?.name).toBe("Cardiology");
        expect(r?.confidence).toBe("medium");
    });

    it("returns null for completely unmatched input", () => {
        expect(resolveSpecialty("Quantum Healing", CANON)).toBeNull();
        expect(resolveSpecialty("", CANON)).toBeNull();
        expect(resolveSpecialty(null, CANON)).toBeNull();
        expect(resolveSpecialty(undefined, CANON)).toBeNull();
    });

    it("handles whitespace-noisy source strings", () => {
        expect(resolveSpecialty("  Gynaecology  ", CANON)?.name).toBe("Gynecology");
    });

    // ---- post-audit expanded alias coverage ----

    it("maps 'Medicine Specialist' (top unmatched, ~1,300 occurrences) to General Medicine", () => {
        expect(resolveSpecialty("Medicine Specialist", CANON)?.name).toBe("General Medicine");
    });

    it("maps Orthopedic variants to Orthopedics", () => {
        expect(resolveSpecialty("Orthopedic Surgeon", CANON)?.name).toBe("Orthopedics");
        expect(resolveSpecialty("Orthopedist", CANON)?.name).toBe("Orthopedics");
        expect(resolveSpecialty("Orthopedic Doctor", CANON)?.name).toBe("Orthopedics");
    });

    it("maps Child/Pediatric variants to Pediatrics", () => {
        expect(resolveSpecialty("Child Specialist", CANON)?.name).toBe("Pediatrics");
        expect(resolveSpecialty("Paediatric", CANON)?.name).toBe("Pediatrics");
    });

    it("splits Hepatologist out of Gastroenterology → Hepatology", () => {
        expect(resolveSpecialty("Hepatologist", CANON)?.name).toBe("Hepatology");
        expect(resolveSpecialty("Liver Specialist", CANON)?.name).toBe("Hepatology");
    });

    it("splits Diabetologist/Diabetes out of Endocrinology → Diabetic Medicine", () => {
        expect(resolveSpecialty("Diabetologist", CANON)?.name).toBe("Diabetic Medicine");
        expect(resolveSpecialty("Diabetes Specialist", CANON)?.name).toBe("Diabetic Medicine");
        // Thyroid alone stays Endocrinology.
        expect(resolveSpecialty("Thyroid", CANON)?.name).toBe("Endocrinology");
    });

    it("maps Neonatologist to the dedicated Neonatology canonical", () => {
        expect(resolveSpecialty("Neonatologist", CANON)?.name).toBe("Neonatology");
        expect(resolveSpecialty("Neonatology", CANON)?.name).toBe("Neonatology");
    });

    it("maps Anesthesiologist + Pathologist to the new canonicals", () => {
        expect(resolveSpecialty("Anesthesiologist", CANON)?.name).toBe("Anesthesiology");
        expect(resolveSpecialty("Pathologist", CANON)?.name).toBe("Pathology");
    });

    it("maps Sonologist to Radiology (sonographer = ultrasound radiologist)", () => {
        expect(resolveSpecialty("Sonologist", CANON)?.name).toBe("Radiology");
    });

    it("maps Psychology to Psychiatry", () => {
        expect(resolveSpecialty("Psychology", CANON)?.name).toBe("Psychiatry");
    });

    it("maps allergy-flavored skin strings to Allergy & Immunology", () => {
        expect(resolveSpecialty("Allergy Skin-VD", CANON)?.name).toBe("Allergy & Immunology");
        expect(resolveSpecialty("Skin, Allergy & VD", CANON)?.name).toBe("Allergy & Immunology");
    });
});

describe("resolveSpecialties (plural) — multi-target", () => {
    it("returns one canonical for an unambiguous single-canonical string", () => {
        const r = resolveSpecialties("Cardiology", CANON);
        expect(r.map((x) => x.name)).toEqual(["Cardiology"]);
    });

    it("maps OB/GYN combined strings to the combined canonical only", () => {
        expect(resolveSpecialties("Gynecologist & Obstetrician", CANON).map((x) => x.name))
            .toEqual(["Obstetrics & Gynaecology"]);
        expect(resolveSpecialties("Gynae & Obs", CANON).map((x) => x.name))
            .toEqual(["Obstetrics & Gynaecology"]);
        expect(resolveSpecialties("Infertility Specialist", CANON).map((x) => x.name))
            .toEqual(["Obstetrics & Gynaecology"]);
    });

    it("returns BOTH parents for pediatric sub-specialties (no dedicated canonical)", () => {
        expect(resolveSpecialties("Pediatric Neurologist", CANON).map((x) => x.name))
            .toEqual(["Pediatrics", "Neurology"]);
        expect(resolveSpecialties("Pediatric Cardiologist", CANON).map((x) => x.name))
            .toEqual(["Pediatrics", "Cardiology"]);
        expect(resolveSpecialties("Child Neurologist", CANON).map((x) => x.name))
            .toEqual(["Pediatrics", "Neurology"]);
    });

    it("returns multiple canonicals for dual-domain strings", () => {
        expect(resolveSpecialties("Neurologist & Medicine Specialist", CANON).map((x) => x.name))
            .toEqual(["Neurology", "General Medicine"]);
        expect(resolveSpecialties("Cardiothoracic and Vascular Surgeon", CANON).map((x) => x.name))
            .toEqual(["Cardiothoracic Surgery", "Vascular Surgery"]);
        expect(resolveSpecialties("Surgical Oncologist", CANON).map((x) => x.name))
            .toEqual(["Surgery", "Oncology"]);
        expect(resolveSpecialties("Maxillofacial and Dental Surgeon", CANON).map((x) => x.name))
            .toEqual(["Maxillofacial Surgery", "Dental Surgery"]);
    });

    it("returns three canonicals for triple-domain strings", () => {
        expect(resolveSpecialties("Medicine, Diabetes & Kidney Disease Specialist", CANON).map((x) => x.name))
            .toEqual(["General Medicine", "Diabetic Medicine", "Nephrology"]);
        expect(resolveSpecialties("Pediatric Hematologist & Oncologist", CANON).map((x) => x.name))
            .toEqual(["Pediatrics", "Hematology", "Oncology"]);
    });

    it("falls back to singular resolver for non-multi keys", () => {
        // "Medicine Specialist" is in ALIASES only; should resolve via singular path.
        expect(resolveSpecialties("Medicine Specialist", CANON).map((x) => x.name))
            .toEqual(["General Medicine"]);
    });

    it("returns empty array when nothing matches (caller falls back to 394733009)", () => {
        expect(resolveSpecialties("Homeopathic Doctor", CANON)).toEqual([]);
        expect(resolveSpecialties("Speech Therapy", CANON)).toEqual([]);
        expect(resolveSpecialties("Quantum Healing", CANON)).toEqual([]);
        expect(resolveSpecialties("", CANON)).toEqual([]);
        expect(resolveSpecialties(null, CANON)).toEqual([]);
    });
});

describe("SNOMED-code correctness — guards against the previously-wrong codes", () => {
    // Each of these codes was on the WRONG canonical in scripts/seed.ts before
    // the SIL Thailand + HL7 c80 cross-check. Make sure none of our test catalog
    // entries (which mirror the real seed) still carry a wrong code.
    const WRONG_PAIRINGS: Array<[string, string]> = [
        ["ENT", "394605004"],                        // was Oral surgery
        ["Cardiothoracic Surgery", "408463005"],     // was Vascular surgery
        ["Vascular Surgery", "408464004"],           // was Colorectal surgery
        ["Colorectal Surgery", "408471003"],         // not a real SNOMED specialty
        ["Pain Medicine", "394913002"],              // was Psychotherapy
        ["Gynaecological Oncology", "394811001"],    // was Geriatric medicine
        ["Sports Medicine", "394821009"],            // was Occupational medicine
        ["Dental Surgery", "394592004"],             // was Clinical oncology
        ["Nutrition & Dietetics", "408477008"],      // was Transplantation surgery
    ];
    for (const [name, wrongCode] of WRONG_PAIRINGS) {
        it(`${name} no longer uses the wrong code ${wrongCode}`, () => {
            const entry = CANON.byNameLower.get(name.toLowerCase());
            expect(entry, `canonical "${name}" should exist in catalog`).toBeDefined();
            expect(entry?.fhirCode).not.toBe(wrongCode);
        });
    }

    it("ENT uses the correct SNOMED code 418960008 (Otolaryngology)", () => {
        expect(CANON.byNameLower.get("ent")?.fhirCode).toBe("418960008");
    });

    it("Obstetrics & Gynaecology uses the combined-entry code 394585009", () => {
        expect(CANON.byNameLower.get("obstetrics & gynaecology")?.fhirCode).toBe("394585009");
    });

    it("the dropped Forensic Medicine entry is not in the catalog", () => {
        expect(CANON.byNameLower.get("forensic medicine")).toBeUndefined();
    });
});
