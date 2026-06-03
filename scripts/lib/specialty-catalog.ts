/**
 * Canonical specialty catalog — the single source of truth shared by the seed
 * (DB upsert) and the DB-less ingest/normalize pipeline. Keep edits here only.
 */
export const SPECIALTY_CATALOG: Array<{
  name: string;
  nameBangla: string;
  slug: string;
  fhirCode: string;
  snomedCode: string | null;
  sortOrder: number;
}> = [
  // ─────────────────────────────────────────────────────────────────────
  // SNOMED codes verified against TWO international sources:
  //   - SIL Thailand FHIR IG (https://fhir-ig.sil-th.org/build/core/ValueSet-vs-sct-clinical-specialty.html, 237 entries)
  //   - HL7 FHIR R4 c80-practice-codes (https://hl7.org/fhir/R4/valueset-c80-practice-codes.html, 137 entries — the FHIR Practitioner.specialty binding)
  // Both draw from SNOMED CT International. 5 entries are in SIL/SNOMED but
  // NOT in HL7 c80 (Cardiothoracic Surgery 394603008, Neonatology 408445005,
  // Sports Medicine 1251536003, Dentistry 722163006, Dietetics & Nutrition
  // 722164000, plus Adolescent Medicine, Emergency Medicine) — deliberate
  // choice; all are valid SNOMED CT International codes.
  // Slugs are URL-stable so SEO doesn't break. The renamed `obstetrics`
  // → `obstetrics-gynecology` and dropped `forensic-medicine` get 301
  // redirects in next.config.ts.
  // For the ≤5% residual that resolves to nothing, seed-unified.ts injects
  // inline {name: "Other / Not Listed", fhirCode: "394733009"} on the Doctor;
  // we deliberately do NOT seed that as a Specialty row (would clutter SEO/UX).
  // ─────────────────────────────────────────────────────────────────────
  { name: "Cardiology", nameBangla: "হৃদরোগ", slug: "cardiology", fhirCode: "394579002", snomedCode: "394579002", sortOrder: 1 },
  { name: "Gynecology", nameBangla: "স্ত্রীরোগ", slug: "gynecology", fhirCode: "394586005", snomedCode: "394586005", sortOrder: 2 },
  { name: "Pediatrics", nameBangla: "শিশুরোগ", slug: "pediatrics", fhirCode: "394537008", snomedCode: "394537008", sortOrder: 3 },
  { name: "Dermatology", nameBangla: "চর্মরোগ", slug: "dermatology", fhirCode: "394582007", snomedCode: "394582007", sortOrder: 4 },
  { name: "General Medicine", nameBangla: "সাধারণ চিকিৎসা", slug: "general-medicine", fhirCode: "419192003", snomedCode: "419192003", sortOrder: 5 },
  { name: "Neurology", nameBangla: "স্নায়ুরোগ", slug: "neurology", fhirCode: "394591006", snomedCode: "394591006", sortOrder: 6 },
  { name: "Orthopedics", nameBangla: "অর্থোপেডিক", slug: "orthopedics", fhirCode: "394801008", snomedCode: "394801008", sortOrder: 7 },
  { name: "Ophthalmology", nameBangla: "চক্ষুরোগ", slug: "ophthalmology", fhirCode: "394594003", snomedCode: "394594003", sortOrder: 8 },
  { name: "Psychiatry", nameBangla: "মানসিক রোগ", slug: "psychiatry", fhirCode: "394587001", snomedCode: "394587001", sortOrder: 9 },
  { name: "Surgery", nameBangla: "শল্যচিকিৎসা", slug: "surgery", fhirCode: "394609007", snomedCode: "394609007", sortOrder: 10 },
  { name: "Urology", nameBangla: "মূত্র-প্রস্রাব", slug: "urology", fhirCode: "394612005", snomedCode: "394612005", sortOrder: 11 },
  { name: "Oncology", nameBangla: "ক্যান্সার", slug: "oncology", fhirCode: "394593009", snomedCode: "394593009", sortOrder: 12 },
  { name: "Endocrinology", nameBangla: "এন্ডোক্রাইন (ডায়াবেটিস)", slug: "endocrinology", fhirCode: "394583002", snomedCode: "394583002", sortOrder: 13 },
  { name: "Gastroenterology", nameBangla: "পরিপাকতন্ত্র", slug: "gastroenterology", fhirCode: "394584008", snomedCode: "394584008", sortOrder: 14 },
  { name: "Nephrology", nameBangla: "কিডনি রোগ", slug: "nephrology", fhirCode: "394589003", snomedCode: "394589003", sortOrder: 15 },
  { name: "Pulmonology", nameBangla: "শ্বাসতন্ত্র", slug: "pulmonology", fhirCode: "418112009", snomedCode: "418112009", sortOrder: 16 },
  { name: "Rheumatology", nameBangla: "বাত-ব্যথা", slug: "rheumatology", fhirCode: "394810000", snomedCode: "394810000", sortOrder: 17 },
  { name: "Hematology", nameBangla: "রক্তরোগ", slug: "hematology", fhirCode: "394803006", snomedCode: "394803006", sortOrder: 18 },
  // CODE FIX: was 394605004 ("Oral surgery"). Correct: 418960008 (Otolaryngology).
  { name: "ENT", nameBangla: "নাক-কান-গলা", slug: "ent", fhirCode: "418960008", snomedCode: "418960008", sortOrder: 19 },
  // RENAMED from "Obstetrics" — the code 394585009 was always the COMBINED entry
  // "Obstetrics and gynaecology". Slug changes; redirect from /obstetrics added in
  // next.config.ts.
  { name: "Obstetrics & Gynaecology", nameBangla: "প্রসূতি ও স্ত্রীরোগ", slug: "obstetrics-gynecology", fhirCode: "394585009", snomedCode: "394585009", sortOrder: 20 },
  { name: "Neurosurgery", nameBangla: "নিউরোসার্জারি", slug: "neurosurgery", fhirCode: "394610002", snomedCode: "394610002", sortOrder: 21 },
  // CODE FIX: was 408463005 (which is "Vascular surgery" — confused with our Vascular Surgery row).
  // Correct: 394603008 (Cardiothoracic surgery in SIL; in SNOMED CT International but not in HL7 c80 which only has the more-specific 408466002 "Cardiac surgery").
  { name: "Cardiothoracic Surgery", nameBangla: "কার্ডিওথোরাসিক সার্জারি", slug: "cardiothoracic-surgery", fhirCode: "394603008", snomedCode: "394603008", sortOrder: 22 },
  { name: "Plastic Surgery", nameBangla: "প্লাস্টিক সার্জারি", slug: "plastic-surgery", fhirCode: "394611003", snomedCode: "394611003", sortOrder: 23 },
  { name: "Pediatric Surgery", nameBangla: "শিশু সার্জারি", slug: "pediatric-surgery", fhirCode: "394539006", snomedCode: "394539006", sortOrder: 24 },
  // CODE FIX: was 408464004 (which is "Colorectal surgery"). Correct: 408463005 (Vascular surgery).
  { name: "Vascular Surgery", nameBangla: "ভাস্কুলার সার্জারি", slug: "vascular-surgery", fhirCode: "408463005", snomedCode: "408463005", sortOrder: 25 },
  // CODE FIX: was 408471003 (not in SIL). Correct: 408464004 (Colorectal surgery).
  { name: "Colorectal Surgery", nameBangla: "কোলোরেক্টাল সার্জারি", slug: "colorectal-surgery", fhirCode: "408464004", snomedCode: "408464004", sortOrder: 26 },
  { name: "Physical Medicine & Rehabilitation", nameBangla: "ফিজিক্যাল মেডিসিন", slug: "physical-medicine", fhirCode: "394602003", snomedCode: "394602003", sortOrder: 27 },
  { name: "Nuclear Medicine", nameBangla: "নিউক্লিয়ার মেডিসিন", slug: "nuclear-medicine", fhirCode: "394649004", snomedCode: "394649004", sortOrder: 28 },
  { name: "Critical Care Medicine", nameBangla: "ক্রিটিক্যাল কেয়ার", slug: "critical-care", fhirCode: "408478003", snomedCode: "408478003", sortOrder: 29 },
  // CODE FIX: was 394913002 (Psychotherapy). Correct: 394882004 (Pain management).
  { name: "Pain Medicine", nameBangla: "ব্যথা ব্যবস্থাপনা", slug: "pain-medicine", fhirCode: "394882004", snomedCode: "394882004", sortOrder: 30 },
  // CODE FIX: was 394811001 (Geriatric medicine). Correct: 408446006 (Gynaecological oncology).
  { name: "Gynaecological Oncology", nameBangla: "স্ত্রীরোগ অনকোলজি", slug: "gynae-oncology", fhirCode: "408446006", snomedCode: "408446006", sortOrder: 31 },
  // CODE FIX: was 394821009 (Occupational medicine). Correct: 1251536003 (Sport medicine). In SNOMED CT International but not in HL7 c80.
  { name: "Sports Medicine", nameBangla: "স্পোর্টস মেডিসিন", slug: "sports-medicine", fhirCode: "1251536003", snomedCode: "1251536003", sortOrder: 32 },
  // DROPPED: Forensic Medicine — original code 394814009 was actually "General practice"; no clean SIL match exists (closest are 394817002 Forensic psychiatry or 26011000087105 Forensic pathology, neither a fit). No source data backing.
  // CODE FIX: was 394592004 (Clinical oncology). Correct: 722163006 (Dentistry). In SNOMED CT International but not in HL7 c80.
  { name: "Dental Surgery", nameBangla: "দন্তচিকিৎসা", slug: "dental-surgery", fhirCode: "722163006", snomedCode: "722163006", sortOrder: 33 },
  { name: "Radiology", nameBangla: "রেডিওলজি", slug: "radiology", fhirCode: "394914008", snomedCode: "394914008", sortOrder: 34 },
  // CODE FIX: was 408477008 (Transplantation surgery). Correct: 722164000 (Dietetics and nutrition). In SNOMED CT International but not in HL7 c80.
  { name: "Nutrition & Dietetics", nameBangla: "পুষ্টি ও ডায়েট", slug: "nutrition", fhirCode: "722164000", snomedCode: "722164000", sortOrder: 35 },
  // ───────────── NEW CANONICALS (13 entries) ─────────────
  { name: "Anesthesiology", nameBangla: "অ্যানেস্থেসিয়া", slug: "anesthesiology", fhirCode: "394577000", snomedCode: "394577000", sortOrder: 36 },
  { name: "Pathology", nameBangla: "প্যাথলজি", slug: "pathology", fhirCode: "394595002", snomedCode: "394595002", sortOrder: 37 },
  { name: "Family Medicine", nameBangla: "ফ্যামিলি মেডিসিন", slug: "family-medicine", fhirCode: "419772000", snomedCode: "419772000", sortOrder: 38 },
  // Neonatology: in SIL, not in HL7 c80.
  { name: "Neonatology", nameBangla: "নবজাতকবিদ্যা", slug: "neonatology", fhirCode: "408445005", snomedCode: "408445005", sortOrder: 39 },
  { name: "Hepatobiliary Surgery", nameBangla: "যকৃৎ-পিত্তথলি সার্জারি", slug: "hepatobiliary-surgery", fhirCode: "408474001", snomedCode: "408474001", sortOrder: 40 },
  { name: "Maxillofacial Surgery", nameBangla: "ম্যাক্সিলোফেসিয়াল সার্জারি", slug: "maxillofacial-surgery", fhirCode: "408465003", snomedCode: "408465003", sortOrder: 41 },
  { name: "Allergy & Immunology", nameBangla: "অ্যালার্জি ও ইমিউনোলজি", slug: "allergy-immunology", fhirCode: "394805004", snomedCode: "394805004", sortOrder: 42 },
  { name: "Public Health Medicine", nameBangla: "জনস্বাস্থ্য", slug: "public-health", fhirCode: "408440000", snomedCode: "408440000", sortOrder: 43 },
  // Splits "Hepatologist" / "Liver Specialist" out of Gastroenterology — distinct discipline in SNOMED.
  { name: "Hepatology", nameBangla: "যকৃৎ রোগ", slug: "hepatology", fhirCode: "408472002", snomedCode: "408472002", sortOrder: 44 },
  // Splits "Diabetes Specialist" out of Endocrinology — distinct discipline in SNOMED.
  { name: "Diabetic Medicine", nameBangla: "ডায়াবেটিস", slug: "diabetic-medicine", fhirCode: "408475000", snomedCode: "408475000", sortOrder: 45 },
  // Future-proofing for medical-student signups; 0 source occurrences today.
  // In SIL, not in HL7 c80.
  { name: "Adolescent Medicine", nameBangla: "কিশোর-কিশোরী চিকিৎসা", slug: "adolescent-medicine", fhirCode: "25931000087108", snomedCode: "25931000087108", sortOrder: 46 },
  // Future-proofing for medical-student signups; 0 source occurrences today.
  // In SIL, not in HL7 c80 (HL7 has only the more-specific 394576009 "Surgical-Accident & emergency").
  { name: "Emergency Medicine", nameBangla: "জরুরি চিকিৎসা", slug: "emergency-medicine", fhirCode: "773568002", snomedCode: "773568002", sortOrder: 47 },
  // Catch-all for the ~15-20 genuinely off-catalog source strings (e.g. "Natural
  // Medicine"). Guarantees the "≥1 canonical specialty" invariant. Resolver returns
  // it with confidence "fallback" → EXCLUDED from the unified-merge gate (§3.2), so a
  // pile of look-alike "Other" doctors can never auto-merge on it. Sorts last.
  { name: "Other / Unspecified", nameBangla: "অন্যান্য", slug: "other", fhirCode: "did:other", snomedCode: null, sortOrder: 999 },
];
