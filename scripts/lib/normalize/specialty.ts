/**
 * Specialty normalization for the ingest pipeline.
 *
 * Maps any source-specific specialty string to one of the 36 seeded canonical
 * specialties. Four resolution strategies, tried in order:
 *
 *   1. Exact canonical match (case-insensitive)        → confidence: "high"
 *   2. Alias hit (curated synonym table)               → confidence: "high"
 *   3. Substring on parenthesized hint                 → confidence: "medium"
 *      e.g. "Endocrinology (Medicine,Diabetes,...)" → "Endocrinology"
 *   4. Substring of any canonical name inside source   → confidence: "medium"
 *
 * Nothing matched → returns null. Callers decide whether to fall back to
 * "General Medicine" or push to `subSpecialties[]` for manual review.
 *
 * The alias table is the union of provider-specific maps and grows freely
 * here — keep individual provider files alias-free so the ingest pipeline
 * has one source of truth.
 */

export interface CanonicalSpecialty {
    name: string;
    fhirCode?: string | null;
}

export interface SpecialtyLookup {
    byNameLower: Map<string, CanonicalSpecialty>;
}

export interface ResolvedSpecialty {
    name: string;
    fhirCode: string | null;
    /**
     * How the match was made. The unified-merge gate (§3.2) only treats
     * `high`/`medium` as a real specialty signal; `fallback` ("Other /
     * Unspecified") satisfies the "≥1 canonical specialty" invariant but never
     * triggers a cross-source auto-merge.
     */
    confidence: "high" | "medium" | "low" | "fallback";
}

export function buildSpecialtyLookup(canonical: CanonicalSpecialty[]): SpecialtyLookup {
    const byNameLower = new Map<string, CanonicalSpecialty>();
    for (const s of canonical) {
        byNameLower.set(s.name.toLowerCase(), {name: s.name, fhirCode: s.fhirCode ?? null});
    }
    return {byNameLower};
}

/**
 * Source → canonical alias table. Merges aliases observed across all four
 * providers (popular, ibn-sina, sasthyaseba, doctor-bangladesh). Keys are
 * lowercase, whitespace-collapsed.
 */
const ALIASES: Record<string, string> = {
    // --- -ist / -ic / -on suffix variants (doctor-bangladesh prose uses
    //     these heavily: "is a Cardiologist", "is a Colorectal Surgeon"). ---
    "cardiologist": "Cardiology",
    "dermatologist": "Dermatology",
    "gynecologist": "Gynecology",
    "gynaecologist": "Gynecology",
    // The "Obstetrics" canonical was renamed to "Obstetrics & Gynaecology" since
    // its SNOMED code (394585009) is the combined entry. "Obstetrician" alone is
    // rare; map it to the combined canonical for consistency.
    "obstetrician": "Obstetrics & Gynaecology",
    "pediatrician": "Pediatrics",
    "paediatrician": "Pediatrics",
    "neurologist": "Neurology",
    "neurosurgeon": "Neurosurgery",
    "orthopedist": "Orthopedics",
    "orthopaedic": "Orthopedics",
    "ophthalmologist": "Ophthalmology",
    "psychiatrist": "Psychiatry",
    "urologist": "Urology",
    "oncologist": "Oncology",
    "endocrinologist": "Endocrinology",
    "gastroenterologist": "Gastroenterology",
    "nephrologist": "Nephrology",
    "pulmonologist": "Pulmonology",
    "rheumatologist": "Rheumatology",
    "hematologist": "Hematology",
    "haematologist": "Hematology",
    "general physician": "General Medicine",
    // "internal medicine specialist": below (deduped); same target
    "surgeon": "Surgery",
    "colorectal surgeon": "Colorectal Surgery",
    "plastic surgeon": "Plastic Surgery",
    "vascular surgeon": "Vascular Surgery",
    "cardiac surgeon": "Cardiothoracic Surgery",
    "thoracic surgeon": "Cardiothoracic Surgery",
    "pediatric surgeon": "Pediatric Surgery",
    "paediatric surgeon": "Pediatric Surgery",

    // General / medicine
    "medicine": "General Medicine",
    "internal medicine": "General Medicine",
    "general practitioner": "General Medicine",
    "gp": "General Medicine",
    // "family medicine" now routes to the dedicated Family Medicine canonical (SNOMED
    // 419772000) — see below.

    // Gynecology / Obstetrics & Gynaecology
    // Note: Combined OB/GYN strings now route to the renamed canonical
    // "Obstetrics & Gynaecology" (was "Obstetrics"; same SNOMED 394585009 which
    // is the COMBINED entry). Solo "gynaecology"/"gynecology" still routes to
    // standalone Gynecology canonical (394586005). Many more OB/GYN combinations
    // (e.g. "Gynecologist & Obstetrician") live in MULTI_ALIASES — see below.
    "gynaecology": "Gynecology",
    "gynaecology & obs": "Obstetrics & Gynaecology",
    "gynaecology and obs": "Obstetrics & Gynaecology",
    "obs & gynae": "Obstetrics & Gynaecology",
    "obstetrics & gynaecology": "Obstetrics & Gynaecology",
    "obstetrics and gynaecology": "Obstetrics & Gynaecology",
    "infertility & gynae": "Obstetrics & Gynaecology",

    // Orthopedics
    "orthopaedic surgery": "Orthopedics",
    "orthopaedics": "Orthopedics",
    "pediatric orthopedic": "Orthopedics",
    "ortho": "Orthopedics",

    // Pediatrics
    "child/paediatrics": "Pediatrics",
    "paediatrics": "Pediatrics",
    "paediatric medicine": "Pediatrics",
    // Note: "neonatal"/"neonatology" now route to the dedicated Neonatology
    // canonical (SNOMED 408445005). Combined "Pediatrician & Neonatologist"
    // multi-targets [Pediatrics, Neonatology] — see MULTI_ALIASES.
    "neonatal": "Neonatology",
    "neonatology": "Neonatology",
    "medicine & cardiology": "Cardiology",
    // Pediatric subspecialties — these stay as single-target ALIASES (folding to the
    // disease parent) for backwards-compatibility with callers using the singular
    // resolveSpecialty(). New seed-unified.ts uses resolveSpecialties() which checks
    // MULTI_ALIASES first → returns BOTH [Pediatrics, X] per the dual-practice policy.
    "child neurology": "Neurology",
    "child cardiology": "Cardiology",
    "pediatric cardiology": "Cardiology",
    "child neuro surgery": "Neurosurgery",
    "pediatric neurosurgery": "Neurosurgery",
    "child/paediatric nephrology": "Nephrology",
    "paediatric gastroenterology & nutrition": "Gastroenterology",
    "child/paediatrics chest medicine": "Pulmonology",
    "child haematology & oncology": "Oncology",
    "paediatric haematology & oncology": "Oncology",
    "paediatric surgery": "Pediatric Surgery",
    "pediatric surgery": "Pediatric Surgery",
    "paediatric surgery & urology": "Pediatric Surgery",

    // ENT
    "ent, head & neck surgery": "ENT",
    "ent": "ENT",
    "otolaryngology": "ENT",

    // Dermatology
    "skin/dermatology": "Dermatology",
    "skin & vd": "Dermatology",
    "skin specialist": "Dermatology",
    "dermatology & venereology": "Dermatology",

    // Ophthalmology
    "eye / ophthalmology": "Ophthalmology",
    "eye": "Ophthalmology",
    "eye specialist": "Ophthalmology",

    // Urology
    "urology surgery": "Urology",

    // Pulmonology
    "chest medicine": "Pulmonology",
    "respiratory medicine": "Pulmonology",
    "chest & respiratory": "Pulmonology",

    // Neurology / neurosurgery
    "neuro surgery": "Neurosurgery",

    // Surgery
    "general surgery": "Surgery",
    "breast, colorectal & laparoscopy surgery": "Surgery",
    "laparoscopic surgery": "Surgery",
    "liver, biliary and pancreatic surgery": "Surgery",

    // Surgical subs promoted to canonical
    "colorectal surgery": "Colorectal Surgery",
    "laparoscopic, colorectal": "Colorectal Surgery",
    "plastic surgery": "Plastic Surgery",
    "cosmetic surgery": "Plastic Surgery",
    "vascular surgery": "Vascular Surgery",
    "cardiac surgery": "Cardiothoracic Surgery",
    "cardiovascular & thoracic surgery": "Cardiothoracic Surgery",
    "thoracic surgery": "Cardiothoracic Surgery",

    // Nephrology
    "nephrology/kidney medicine": "Nephrology",
    "kidney medicine": "Nephrology",

    // Oncology
    "oncology/cancer": "Oncology",
    "oncology surgery": "Oncology",
    "general & oncology surgery": "Oncology",
    "general & surgical oncology": "Oncology",
    "breast cancer specialist": "Oncology",
    "radiation oncology": "Oncology",
    "medical oncology": "Oncology",
    "gynae oncology": "Gynaecological Oncology",
    "gyane oncology": "Gynaecological Oncology",

    // Endocrinology (covers the sasthyaseba/ibn-sina merged-label cases)
    // Note: "diabetes"/"diabetologist" now route to the dedicated Diabetic Medicine
    // canonical (SNOMED 408475000) — see further down. Thyroid/hormone stays Endocrinology.
    "endocrine medicine": "Endocrinology",
    "thyroid": "Endocrinology",
    "diabetes, thyroid & hormone": "Endocrinology",
    "hormone": "Endocrinology",

    // Diabetic Medicine (NEW canonical — splits from Endocrinology)
    "diabetologist": "Diabetic Medicine",
    "diabetes": "Diabetic Medicine",
    "diabetes specialist": "Diabetic Medicine",
    "diabetes doctor": "Diabetic Medicine",
    "endocrinoloist": "Diabetic Medicine",

    // Rheumatology
    "rheumatology medicine": "Rheumatology",

    // Hematology
    "haematology": "Hematology",

    // Gastroenterology
    // Note: "hepatology"/"liver medicine" now route to the dedicated Hepatology
    // canonical (SNOMED 408472002) — see further down.
    "gastro": "Gastroenterology",

    // Hepatology (NEW canonical — splits from Gastroenterology)
    "hepatology": "Hepatology",
    "liver medicine": "Hepatology",
    "hepatologist": "Hepatology",
    "liver specialist": "Hepatology",
    "liver doctor": "Hepatology",
    "gastro-liver specialist": "Hepatology",

    // Physical medicine
    "physical medicine": "Physical Medicine & Rehabilitation",
    "physical  medicine & rehabilitation": "Physical Medicine & Rehabilitation",
    "physiotherapy  department": "Physical Medicine & Rehabilitation",
    "rehabilitation medicine": "Physical Medicine & Rehabilitation",
    "pmr": "Physical Medicine & Rehabilitation",

    // Nuclear medicine
    "thyroid & nuclear medicine": "Nuclear Medicine",

    // Critical care
    "critical care medicine": "Critical Care Medicine",
    "icu": "Critical Care Medicine",
    "intensive care": "Critical Care Medicine",

    // Pain
    "pain management": "Pain Medicine",

    // Sports / forensic
    "sports and exercise medicine": "Sports Medicine",

    // Dental
    "dentist": "Dental Surgery",
    "dental": "Dental Surgery",

    // Radiology / imaging
    "sonologist": "Radiology",
    "radiologist": "Radiology",
    "imaging": "Radiology",

    // Nutrition
    "nutritionist": "Nutrition & Dietetics",
    "dietician": "Nutrition & Dietetics",
    "dietitian": "Nutrition & Dietetics",
    "food & nutrition": "Nutrition & Dietetics",

    // Psychiatry
    "psychologist": "Psychiatry",
    "mental health": "Psychiatry",
    "psychology": "Psychiatry",
    "psychiatric": "Psychiatry",

    // ─────────────────────────────────────────────────────────────────
    // Expanded aliases (post-merge-audit additions). Driven by frequency
    // analysis of data/unified/doctors.json. See plan at
    // .claude/plans/act-like-a-data-sparkling-orbit.md
    // ─────────────────────────────────────────────────────────────────

    // General Medicine — these alone are ~1,400 occurrences in the audit
    "medicine specialist": "General Medicine",
    "medicine doctor": "General Medicine",
    "internal medicine specialist": "General Medicine",

    // Pediatrics (Neonatologist → Neonatology already above)
    "child specialist": "Pediatrics",
    "pediatric / neonatal and child": "Pediatrics",
    "neonatal and child": "Pediatrics",
    "(pediatric / neonatal and child)": "Pediatrics",
    "paediatric": "Pediatrics",
    "pediatric": "Pediatrics",
    "child disease": "Pediatrics",
    // Pediatric sub-specialties: single-target fallback for legacy callers.
    // MULTI_ALIASES re-routes seed-unified to [Pediatrics, X].
    "pediatric neurologist": "Neurology",
    "pediatric neurosurgeon": "Neurosurgery",
    "pediatric nephrologist": "Nephrology",
    "pediatric hematologist": "Hematology",
    "pediatric oncologist": "Oncology",
    "surgical oncologist": "Oncology",
    "pediatric pulmonologist": "Pulmonology",
    "pediatric endocrinologist": "Endocrinology",
    "pediatric cardiologist": "Cardiology",
    "child neurologist": "Neurology",
    "child nephrologist": "Nephrology",
    "child eye specialist": "Ophthalmology",

    // Orthopedics
    "orthopedic surgeon": "Orthopedics",
    "orthopedic specialist": "Orthopedics",
    "orthopedic doctor": "Orthopedics",
    "orthopedic": "Orthopedics",
    "orthopaedics, pain, trauma, spine, injury": "Orthopedics",
    "pediatric orthopedic surgeon": "Orthopedics",
    "trauma surgeon": "Orthopedics",

    // Surgery (general / laparoscopic — NOT colorectal / vascular)
    "general surgeon": "Surgery",
    "laparoscopic surgeon": "Surgery",
    "general & laparoscopic surgeon": "Surgery",
    "general, laparoscopic & colorectal surgeon": "Colorectal Surgery",
    "breast surgeon": "Surgery",
    "female surgeon": "Surgery",
    "head & neck surgeon": "Surgery",

    // Neurology / Neurosurgery
    "neuromedicine specialist": "Neurology",
    "neuro medicine specialist": "Neurology",
    "neuro-medicine": "Neurology",
    "neuro medicine": "Neurology",
    "neuromedicine doctor": "Neurology",
    "spine surgeon": "Neurosurgery",
    "neuro surgeon": "Neurosurgery",
    "neurourgeon": "Neurosurgery",
    "brain & spine surgeon": "Neurosurgery",

    // Oncology / Hematology
    "cancer specialist": "Oncology",
    "cancer surgeon": "Oncology",
    "gynecologic oncologist": "Gynaecological Oncology",
    "gynecological oncologist": "Gynaecological Oncology",
    "radiation oncologist": "Oncology",
    "blood cancer specialist": "Hematology",
    "blood cancer & blood diseases": "Hematology",
    "transfusion medicine specialist": "Hematology",
    "blood specialist": "Hematology",

    // Pulmonology
    "chest specialist": "Pulmonology",
    "chest diseases specialist": "Pulmonology",
    "respiratory specialist": "Pulmonology",
    "chest diseases & medicine specialist": "Pulmonology",
    "asthma specialist": "Pulmonology",

    // Nephrology
    "kidney specialist": "Nephrology",
    "kidney doctor": "Nephrology",
    "kidney medicine specialist": "Nephrology",

    // Cardio / Vascular / Colorectal
    "cardiothoracic surgeon": "Cardiothoracic Surgery",
    "cardiovascular surgeon": "Cardiothoracic Surgery",
    "vascular & endovascular surgeon": "Vascular Surgery",
    "vascular & endovascular specialist surgeon": "Vascular Surgery",
    "colorectal & laparoscopic surgeon": "Colorectal Surgery",
    "female colorectal surgeon": "Colorectal Surgery",

    // Physical Medicine / Pain / Critical Care
    "physical medicine specialist": "Physical Medicine & Rehabilitation",
    "physical medicine doctor": "Physical Medicine & Rehabilitation",
    "physiotherapist": "Physical Medicine & Rehabilitation",
    "female physiotherapist": "Physical Medicine & Rehabilitation",
    "rehabilitation specialist": "Physical Medicine & Rehabilitation",
    "pain specialist": "Pain Medicine",
    "critical care specialist": "Critical Care Medicine",

    // Urology
    "urologist surgeon": "Urology",
    "urological surgeon": "Urology",
    "urologist & andrologist": "Urology",
    "andrologist": "Urology",
    "sexual medicine specialist": "Urology",

    // Ophthalmology
    "eye specialist & phaco surgeon": "Ophthalmology",
    "eye specialist & surgeon": "Ophthalmology",
    "eye surgeon": "Ophthalmology",
    "eye doctor": "Ophthalmology",
    "cornea specialist": "Ophthalmology",
    "oculoplastic surgeon": "Ophthalmology",

    // Dermatology / Dental / ENT extras
    "skin doctor": "Dermatology",
    "skin, allergy & vd": "Allergy & Immunology",
    "skin & vd specialist": "Dermatology",
    "skin & sexual diseases specialist": "Dermatology",
    "skin, std, allergy & sex": "Dermatology",
    "skin, vd (sex), allergy specialist & skin surgeon": "Dermatology",
    "aesthetic dermatologist": "Dermatology",
    "laser dermatosurgeon": "Dermatology",
    "venereologist": "Dermatology",
    "allergy skin-vd": "Allergy & Immunology",
    "orthodontist": "Dental Surgery",
    "endodontist": "Dental Surgery",
    "prosthodontist": "Dental Surgery",
    "ear, nose, throat, head-neck": "ENT",

    // New-canonical aliases (single-target — for source strings naming ONE specialty)
    "anesthesiologist": "Anesthesiology",
    "anaesthesiologist": "Anesthesiology",
    "anaesthetics": "Anesthesiology",
    "pathologist": "Pathology",
    "family medicine specialist": "Family Medicine",
    "family medicine": "Family Medicine",
    "neonatologist": "Neonatology",
    "hepatobiliary surgeon": "Hepatobiliary Surgery",
    "maxillofacial surgeon": "Maxillofacial Surgery",
    // "maxillofacial and dental surgeon" → MULTI_ALIASES (dual: Maxillofacial Surgery + Dental Surgery)
    "public health": "Public Health Medicine",
    "public health medicine": "Public Health Medicine",
    "emergency medicine": "Emergency Medicine",
    "adolescent medicine": "Adolescent Medicine",

    // Coverage-audit follow-ups (uncovered strings ≥ 2 occurrences)
    "gynecologists": "Gynecology",
    "gynae": "Gynecology",
    "medicine specialist.": "General Medicine",
    "child specialist.": "Pediatrics",
    "cardiac medicine specialist": "Cardiology",
    "clinical nutritionist": "Nutrition & Dietetics",
    "nutritionist & dietitian": "Nutrition & Dietetics",
    "nutrition": "Nutrition & Dietetics",
    "orthopaedic, trauma & spine": "Orthopedics",
    "orthopaedic & spine surgeon": "Orthopedics",
    "orthopedic specialist & surgeon": "Orthopedics",
    "arthroscopic & arthroplasty surgeon & knee specialist": "Orthopedics",
    "sexual diseases specialist": "Dermatology",
    "skin, sex, allergy, hair & nail diseases specialist": "Dermatology",
};

function cleanKey(raw: string): string {
    return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

// --- Layered-matching helpers (Phase 0a) -----------------------------------

/** British→American spellings so "Paediatric"/"Orthopaedics"/"Gynaecology" match. */
const BRITISH_TO_AMERICAN: Record<string, string> = {
    paediatric: "pediatric",
    paediatrics: "pediatrics",
    paediatrician: "pediatrician",
    gynaecology: "gynecology",
    gynaecological: "gynecological",
    gynaecologist: "gynecologist",
    orthopaedic: "orthopedic",
    orthopaedics: "orthopedics",
    haematology: "hematology",
    haematological: "hematological",
    anaesthesia: "anesthesia",
    anaesthesiology: "anesthesiology",
    anaesthesiologist: "anesthesiologist",
    oesophageal: "esophageal",
    tumour: "tumor",
};

/** Common abbreviations seen in source specialty strings. */
const ABBREV: Record<string, string> = {
    gynae: "gynecology",
    gynaec: "gynecology",
    obs: "obstetrics",
    obg: "obstetrics",
};

/** Dropped before token-set comparison so descriptive noise doesn't block a match. */
const MATCH_STOPWORDS = new Set([
    "and", "the", "of", "amp", "with", "specialist", "surgeon", "consultant",
    "care", "disease", "diseases", "dept", "department", "unit", "ltd", "medical",
]);

/** Tokenize for order-independent matching: drop dots ("E.N.T"→ent), split on
 * non-letters, fold British→American + abbreviations, drop stopwords/1-char tokens. */
function tokenize(s: string): string[] {
    return s
        .toLowerCase()
        .replace(/\./g, "")
        .replace(/&/g, " and ")
        .replace(/[^a-z ]/g, " ")
        .split(/\s+/)
        .map((w) => BRITISH_TO_AMERICAN[w] ?? ABBREV[w] ?? w)
        .filter((w) => w.length > 1 && !MATCH_STOPWORDS.has(w));
}

/** Normalized single-string form (folded + de-noised) for exact/alias retry. */
function normalizeForMatch(key: string): string {
    return tokenize(key).join(" ");
}

/** Descriptive / off-catalog keyword → canonical (medium confidence). Order matters. */
// Prefix patterns (leading \b only — a trailing \b would block "microbiolog" from
// matching "microbiology"). Reached only after exact/alias/token-set/substring miss,
// so canonical names (e.g. "Cardiothoracic Surgery") are already resolved by then.
const KEYWORD_MAP: Array<[RegExp, string]> = [
    [/\b(chest|respirat|asthma|pulmonar|copd|bronch)/, "Pulmonology"],
    [/\b(diet|nutrition)/, "Nutrition & Dietetics"],
    [/\b(skin|dermat|venereolog|leprosy)/, "Dermatology"],
    [/\b(newborn|neonat)/, "Neonatology"],
    [/\b(physiotherap|physiatr|rehab)/, "Physical Medicine & Rehabilitation"],
    [/\b(hepato|liver)/, "Hepatology"],
    [/\b(ivf|infertil|fertility|laparoscop)/, "Obstetrics & Gynaecology"],
    [/\b(biochem|microbiolog|histopath|patholog|cytolog)/, "Pathology"],
    [/\bforensic/, "Pathology"],
    [/\b(diabet|endocrin|thyroid|hormone)/, "Endocrinology"],
    [/\b(ophthalm|opthalm)/, "Ophthalmology"],
    [/\beye\b/, "Ophthalmology"],
    [/\bcardio/, "Cardiology"],
    [/\b(nephro|kidney|renal)/, "Nephrology"],
    [/\bgastro/, "Gastroenterology"],
    [/\burolog/, "Urology"],
    [/\bpsychiatr/, "Psychiatry"],
    [/\b(oncolog|cancer)/, "Oncology"],
    [/\b(ortho|fracture|spine|backpain)/, "Orthopedics"],
    [/\b(arthritis|rheumat|gout)/, "Rheumatology"],
    [/\b(ultrasono|sonolog|radiolog|imaging)/, "Radiology"],
    [/\b(dental|dentist|odonto)/, "Dental Surgery"],
    [/\btropical/, "General Medicine"],
];

/** Levenshtein distance, early-exiting once it provably exceeds 2. */
function levenshtein(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    if (Math.abs(m - n) > 2) return 3;
    const prev = new Array<number>(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
        let prevDiag = prev[0];
        prev[0] = i;
        for (let j = 1; j <= n; j++) {
            const tmp = prev[j];
            prev[j] = Math.min(
                prev[j] + 1,
                prev[j - 1] + 1,
                prevDiag + (a[i - 1] === b[j - 1] ? 0 : 1),
            );
            prevDiag = tmp;
        }
    }
    return prev[n];
}

export function resolveSpecialty(
    raw: unknown,
    lookup: SpecialtyLookup,
): ResolvedSpecialty | null {
    if (typeof raw !== "string" || !raw.trim()) return null;
    const key = cleanKey(raw);

    // 1. Exact canonical hit.
    const exact = lookup.byNameLower.get(key);
    if (exact) return {name: exact.name, fhirCode: exact.fhirCode ?? null, confidence: "high"};

    // 2. Alias hit.
    const aliasTarget = ALIASES[key];
    if (aliasTarget) {
        const viaAlias = lookup.byNameLower.get(aliasTarget.toLowerCase());
        if (viaAlias) {
            return {name: viaAlias.name, fhirCode: viaAlias.fhirCode ?? null, confidence: "high"};
        }
    }

    // 3. Parenthesized hint — "Endocrinology (Medicine,Diabetes,Thyroid & Hormone)".
    const parenStripped = key.replace(/\s*\([^)]*\)\s*/g, " ").trim();
    if (parenStripped && parenStripped !== key) {
        const viaStripped = resolveSpecialty(parenStripped, lookup);
        if (viaStripped) {
            return {...viaStripped, confidence: "medium"};
        }
    }

    // 4. Normalized retry — drop dots / "&"↔"and" / British→American / abbreviations,
    //    then re-test exact + alias. ("E.N.T" → "ent" → ENT; "Gynae & Obs." path too.)
    const normKey = normalizeForMatch(key);
    if (normKey && normKey !== key) {
        const viaNorm =
            lookup.byNameLower.get(normKey) ??
            (ALIASES[normKey] ? lookup.byNameLower.get(ALIASES[normKey].toLowerCase()) : undefined);
        if (viaNorm) {
            return {name: viaNorm.name, fhirCode: viaNorm.fhirCode ?? null, confidence: "high"};
        }
    }

    // 5. Order-independent token-set match ("Gynaecology & Obstetrics" ↔
    //    "Obstetrics & Gynaecology"). Pick the most specific canonical whose tokens
    //    are all present in the input.
    const keyTokens = new Set(tokenize(key));
    if (keyTokens.size > 0) {
        let best: CanonicalSpecialty | null = null;
        let bestLen = 0;
        for (const entry of lookup.byNameLower.values()) {
            const ct = tokenize(entry.name);
            if (ct.length > bestLen && ct.length > 0 && ct.every((t) => keyTokens.has(t))) {
                bestLen = ct.length;
                best = entry;
            }
        }
        if (best) {
            return {
                name: best.name,
                fhirCode: best.fhirCode ?? null,
                confidence: bestLen >= 2 ? "high" : "medium",
            };
        }
    }

    // 6. Substring scan against canonical names — medium confidence.
    for (const [canonicalKey, entry] of lookup.byNameLower) {
        if (key.includes(canonicalKey)) {
            return {name: entry.name, fhirCode: entry.fhirCode ?? null, confidence: "medium"};
        }
    }

    // 7. Keyword → canonical for descriptive / off-catalog strings
    //    (chest→Pulmonology, biochemistry/microbiology→Pathology, …).
    for (const [re, canon] of KEYWORD_MAP) {
        if (re.test(` ${normKey} `)) {
            const hit = lookup.byNameLower.get(canon.toLowerCase());
            if (hit) return {name: hit.name, fhirCode: hit.fhirCode ?? null, confidence: "medium"};
        }
    }

    // 8. Conservative typo recovery (Levenshtein ≤2) vs canonical + alias keys.
    //    ("Onclogy"→Oncology, "Endocrionology"→Endocrinology, "Heapatology"→Hepatology.)
    if (normKey.length >= 5) {
        let best: CanonicalSpecialty | null = null;
        let bestDist = 3;
        for (const [canonKey, entry] of lookup.byNameLower) {
            const d = levenshtein(normKey, canonKey);
            if (d < bestDist) {
                bestDist = d;
                best = entry;
            }
        }
        for (const [aliasKey, target] of Object.entries(ALIASES)) {
            const d = levenshtein(normKey, aliasKey);
            if (d < bestDist) {
                const t = lookup.byNameLower.get(target.toLowerCase());
                if (t) {
                    bestDist = d;
                    best = t;
                }
            }
        }
        if (best && bestDist <= 2) {
            return {name: best.name, fhirCode: best.fhirCode ?? null, confidence: "medium"};
        }
    }

    // 9. Fallback bucket — guarantees ≥1 canonical specialty, but is EXCLUDED from
    //    the merge gate (confidence "fallback"). Only fires when the catalog carries
    //    the "Other / Unspecified" entry.
    const fallback = lookup.byNameLower.get("other / unspecified");
    if (fallback) {
        return {name: fallback.name, fhirCode: fallback.fhirCode ?? null, confidence: "fallback"};
    }

    return null;
}

/**
 * Multi-target aliases — for source strings that name two-or-more specialties
 * (combined occupations like "Gynecologist & Obstetrician", dual practice like
 * "Neurologist & Medicine Specialist", or pediatric sub-specialties that should
 * appear under both /pediatrics AND the disease specialty).
 *
 * Used by `resolveSpecialties()` (plural). The singular `resolveSpecialty()`
 * ignores this map — those callers fall through to the single-target ALIASES
 * entry (which we keep as a same-key fallback for backwards-compatibility).
 *
 * Policy:
 *  - Combined occupation with dedicated SNOMED canonical → single combined target
 *    (e.g. "Gynecologist & Obstetrician" → ["Obstetrics & Gynaecology"]).
 *  - Dual disease+pediatric practice with no combined canonical → multi-target
 *    (e.g. "Pediatric Neurologist" → ["Pediatrics", "Neurology"]).
 *  - Focus areas without an implied second specialty (e.g. "Trauma Surgeon")
 *    stay in single-target ALIASES.
 */
const MULTI_ALIASES: Record<string, string[]> = {
    // OB/GYN — all variants → the combined canonical (SNOMED 394585009)
    "gynecologist & obstetrician": ["Obstetrics & Gynaecology"],
    "gynae & obs": ["Obstetrics & Gynaecology"],
    "gynae & obs.": ["Obstetrics & Gynaecology"],
    "gynae & obs specialist": ["Obstetrics & Gynaecology"],
    "gynae & obs. specialist": ["Obstetrics & Gynaecology"],
    "gynae & obs specialist & surgeon": ["Obstetrics & Gynaecology"],
    "gynae & obs specialist & laparoscopic surgeon": ["Obstetrics & Gynaecology"],
    "gynae & obs. specialist surgeon": ["Obstetrics & Gynaecology"],
    "gynae specialist & surgeon": ["Obstetrics & Gynaecology"],
    "obs & gynae specialist": ["Obstetrics & Gynaecology"],
    "(gynaecology & obs).": ["Obstetrics & Gynaecology"],
    "infertility specialist": ["Obstetrics & Gynaecology"],
    "high risk pregnancy specialist": ["Obstetrics & Gynaecology"],
    "laparoscopic surgeon and infertility specialist": ["Surgery", "Obstetrics & Gynaecology"],

    // Dual practice
    "cardiology and medicine specialist": ["Cardiology", "General Medicine"],
    "cardiology & medicine": ["Cardiology", "General Medicine"],
    "cardiothoracic and vascular surgeon": ["Cardiothoracic Surgery", "Vascular Surgery"],
    "neurologist & medicine specialist": ["Neurology", "General Medicine"],
    "neuro medicine & medicine specialist": ["Neurology", "General Medicine"],
    "neuro-ophthalmologist": ["Neurology", "Ophthalmology"],
    "medicine & diabetes specialist": ["General Medicine", "Diabetic Medicine"],
    "medicine & diabetes": ["General Medicine", "Diabetic Medicine"],
    "medicine & kidney": ["General Medicine", "Nephrology"],
    "medicine & kidney disease specialist": ["General Medicine", "Nephrology"],
    "kidney, medicine & diabetes specialist": ["Nephrology", "General Medicine", "Diabetic Medicine"],
    "medicine, diabetes & kidney disease specialist": ["General Medicine", "Diabetic Medicine", "Nephrology"],
    "medicine, liver & digestive system specialist": ["General Medicine", "Hepatology", "Gastroenterology"],
    "medicine, asthma, chest disease & allergy": ["General Medicine", "Pulmonology"],
    "pediatric hematologist & oncologist": ["Pediatrics", "Hematology", "Oncology"],
    "child haematology & oncology": ["Pediatrics", "Hematology", "Oncology"],
    "paediatric haematology & oncology": ["Pediatrics", "Hematology", "Oncology"],
    "anesthesiologist & intensive care": ["Anesthesiology", "Critical Care Medicine"],
    "orthopedic, trauma & spine surgeon": ["Orthopedics", "Neurosurgery"],
    "cancer, breast, piles & laparoscopic surgeon": ["Oncology", "Colorectal Surgery"],
    "pediatrician & neonatologist": ["Pediatrics", "Neonatology"],

    // Pediatric sub-specialties: doctor visible under BOTH /pediatrics AND
    // the disease specialty filter. Drives /pediatrics filter completeness.
    "pediatric cardiologist": ["Pediatrics", "Cardiology"],
    "pediatric neurologist": ["Pediatrics", "Neurology"],
    "pediatric neurosurgeon": ["Pediatrics", "Neurosurgery"],
    "pediatric nephrologist": ["Pediatrics", "Nephrology"],
    "pediatric hematologist": ["Pediatrics", "Hematology"],
    "pediatric oncologist": ["Pediatrics", "Oncology"],
    "pediatric pulmonologist": ["Pediatrics", "Pulmonology"],
    "pediatric endocrinologist": ["Pediatrics", "Endocrinology"],
    "pediatric orthopedic surgeon": ["Pediatrics", "Orthopedics"],
    "child neurologist": ["Pediatrics", "Neurology"],
    "child nephrologist": ["Pediatrics", "Nephrology"],
    "child eye specialist": ["Pediatrics", "Ophthalmology"],

    // Source string explicitly names two specialties
    "surgical oncologist": ["Surgery", "Oncology"],
    "maxillofacial and dental surgeon": ["Maxillofacial Surgery", "Dental Surgery"],

    // Coverage-audit follow-ups (combined-OB/GYN variants the first pass missed)
    "gynaecology & obstetrics": ["Obstetrics & Gynaecology"],
    "gynae & obstetrics": ["Obstetrics & Gynaecology"],
    "gynae &obs": ["Obstetrics & Gynaecology"],
    "gynae, obstetrics specialist & surgeon": ["Obstetrics & Gynaecology"],
    "infertility specialist & laparoscopic surgeon": ["Obstetrics & Gynaecology", "Surgery"],

    // Other dual-domain strings from the unmatched tail
    "medicine & neuro-medicine specialist.": ["General Medicine", "Neurology"],
    "oncoplastic breast surgeon": ["Oncology", "Surgery"],
    "urinary bladder, prostate & sex organ, specialist in kidney diseases":
        ["Urology", "Nephrology"],
    "kidney, ureter, urinary bladder, prostate, genitalia.": ["Urology", "Nephrology"],

    // Coverage-audit second pass
    "newborn & child disease specialist": ["Neonatology", "Pediatrics"],
    "medicine, diabetic": ["General Medicine", "Diabetic Medicine"],
    "kidney diseases & medicine specialist": ["Nephrology", "General Medicine"],
    "orthopedic & spine surgeon": ["Orthopedics", "Neurosurgery"],
    "bone, joint pain, paralysis diseases & spine specialist": ["Orthopedics", "Neurosurgery"],
    "medicine, gastrointestinal & liver disease specialist":
        ["General Medicine", "Gastroenterology", "Hepatology"],
    "laparoscopic & urological surgeon": ["Surgery", "Urology"],
    "obs, gynae specialist & surgeon": ["Obstetrics & Gynaecology"],
    "general, laparoscopic and colorectal surgeon": ["Colorectal Surgery"],
    "pediatric & child specialist": ["Pediatrics"],
};

/**
 * Resolve a source specialty string to one-or-more canonical refs.
 *
 * Checks MULTI_ALIASES first (combined / dual-practice strings); falls back
 * to the singular `resolveSpecialty()` (which uses ALIASES + parenthesized
 * hint + substring scan).
 *
 *   - Returns [] when nothing matches. Caller (seed-unified.ts) injects the
 *     "Other / Not Listed" SNOMED 394733009 fallback.
 *   - For backwards-compatibility, callers using `resolveSpecialty()` (the
 *     legacy ingest providers in scripts/lib/providers/*) still get a single
 *     ResolvedSpecialty — same keys may exist in both ALIASES (single fallback)
 *     and MULTI_ALIASES (preferred result here).
 */
export function resolveSpecialties(
    raw: unknown,
    lookup: SpecialtyLookup,
): ResolvedSpecialty[] {
    if (typeof raw !== "string" || !raw.trim()) return [];
    const key = cleanKey(raw);
    const multi = MULTI_ALIASES[key];
    if (multi) {
        const out: ResolvedSpecialty[] = [];
        for (const target of multi) {
            const hit = lookup.byNameLower.get(target.toLowerCase());
            if (hit) {
                out.push({
                    name: hit.name,
                    fhirCode: hit.fhirCode ?? null,
                    confidence: "high",
                });
            }
        }
        if (out.length > 0) return out;
    }
    const single = resolveSpecialty(raw, lookup);
    return single ? [single] : [];
}
