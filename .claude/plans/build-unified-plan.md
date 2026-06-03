# Plan: Unified merge of Popular Diagnostic + Ibn Sina (revised)

> **Status**: awaiting sign-off on the matching/merge logic (§3) before writing
> `scripts/build-unified.ts`. This revision supersedes the earlier inline draft.
> Created 2026-06-02. Every claim about data shape, field presence, and counts
> below was **measured against the on-disk data** (not assumed) — see the
> evidence callouts.

## Context

The earlier 5-source unified merge was deleted because the result was inaccurate
(loose name-based clustering, noisy city canonicalization, dedup rules that
didn't cluster correctly). This rebuild is conservative and starts with **two
sources** — Popular Diagnostic (3,237 records) and Ibn Sina Trust (1,932
records) — with these invariants:

- **Union all fields across sources — drop nothing.** Source-specific fields
  (Ibn Sina's `floor_number`/`room_number`, Popular's `absent_message`) survive
  into the unified record.
- **Same doctor across sources → one unified record.**
- **A "duplicate" here almost always means the same doctor at a different
  branch.** Each source record holds exactly one branch, so merging duplicates
  means **unioning their chambers**, never discarding a record.
- **On conflict: keep the most complete/specific value, log the conflict.**

### Why the prior matching approach was scrapped (measured)

Running the real `normalizeNameForMatch` + `resolveSpecialty` over all 5,169
records showed name alone is a coin flip — **roughly half of same-name pairs are
different people**:

- Cross-source: 188 shared name-keys → 89 specialty-agree (likely same), **89
  specialty-disagree**, 10 unresolved.
- Intra-PD: 183 same-name groups → 103 same-doctor-multi-branch, **88 different
  people / true-dups split out** (78 different people + 10 gender-mismatch).
- The proposed "≥1 shared degree token (MBBS/FCPS)" HIGH-tier gate fires for
  ~every pair → it would have rubber-stamped ~265 false merges.

So the degree-token signal and the specialty co-occurrence graph (fueled by only
190 PD records, 0 from Ibn Sina) are **dropped**. The new logic uses **name to
block, gender + canonical specialty to decide, phone to confirm**.

---

## 1. Field inventory by source

### Popular Diagnostic (`data/popular-diagnostic/doctors.json` — 3,237 records, 11 MB)

Each element is a full record; the embedded `detail` object is also present as a
standalone file in `details/{id}.json`.

```
INDEX
  id, name, degree, gender                  gender always non-null
  image                                     external URL (old.populardiagnostic.com)
  on_leave, on_future_leave                 0|1
  absent_from, absent_to                    ISO date (index-level field names)
  branches[]   ALWAYS length 1   .branch.{id,name}    e.g. {id:1,name:"Dhanmondi"}
  specialists[] 1+ elements      .specialist.{id,name}  {id:167,name:"Cardiology"}
  schedule[]   day-only          .day
  localPhotoPath, fetchedAt
  detail       ENRICHED — see below

DETAIL (also embedded under `.detail`)
  name, mobile, email, image, degree, gender, education
  experience_summery   bio prose (field name is misspelled in the source)
  previous_experience  usually null
  practicing_branches  comma-sep branch names
  schedule[]           RICHER: {key, day, start_time, end_time, appointment_type}
  branches[]  ALWAYS 1 {branch_id, name, map, phone, telephones[]}
                       - map = full BD address (mixed Bangla + English)
                       - phone = the BRANCH's phone (NOT the doctor's mobile)
                       - telephones = [] in practice
  specialists[]        SIMPLIFIED: {specialist_id, specialist_name}
  friday_reservation_information, appointment_number   usually null
  on_leave, on_future_leave
  dr_absent_from, dr_absent_to    ← detail uses `dr_`-prefixed names
  absent_message       HTML ("In Leave from <b>Wed, 27th May 2026</b>...")
```

### Ibn Sina Trust (`data/ibn-sina/doctors.json` — 1,932 records, 4.1 MB)

Flat — no separate `details/` directory.

```
INDEX
  id, name
  mobile        ALWAYS null            ← no doctor phone in this source
  email         ALWAYS null
  gender        ALWAYS null            ← no gender in this source
  image, degree, education
  designation   "Professor", "Consultant", ...   NOT IN POPULAR (1,882/1,932)
  institute     "Bangladesh Medical University…"  NOT IN POPULAR (1,802/1,932)
  language_spoken  "English,Bangla"               NOT IN POPULAR
  specialty     primary specialty (comma-sep if multi)   (1,931/1,932)
  previous_experience, experience_summery   ALWAYS null
  profile_url   source-side profile URL
  practicing_branches  comma-sep branch names
  branches[]  ALWAYS 1
    branch_id, name (facility), map (address), phone (comma-sep facility line)
    telephones[]   []
    chamber_time   "(05:30 PM-09:00 PM)" | "5 PM - 9 PM"
    off_day        "TUE,THU,FRI" | "Friday Closed"
    floor_number   "04", "3rd"          NOT IN POPULAR
    room_number    "514", "421, 422"    NOT IN POPULAR
    schedule[]     {key, day, start_time, end_time, appointment_type}
  specialists[]  ALWAYS 1
    specialist_id  null
    specialist_name   can be nested: "Endocrinology (Medicine,Diabetes,Thyroid…)"
  localPhotoPath  (34% downloaded), fetchedAt

branches.json: 22 facility records {id,name}.  branch-pages/*.html: raw HTML.
```

### Field-presence comparison (measured)

| Field | Popular | Ibn Sina | Notes |
|---|---|---|---|
| doctor **mobile** | 3,237/3,237 (2,780 distinct) | 0 (always null) | **PD's `detail.mobile` is the doctor's own number — never equal to the branch phone (0/3,237 match). 328 numbers are shared by >1 doctor (booking lines).** |
| **gender** | 3,237/3,237 | 0 (always null) | PD-only |
| **bio** (`experience_summery`) | 3,222/3,237 | 0 (always null) | PD-only |
| `designation` / `institute` | — | 1,882 / 1,802 | Ibn-only |
| `specialty` (string) | — | 1,931/1,932 | Ibn-only |
| **branch address** (`branches[].map`) | yes | yes | both, free-text BD address |
| **branch phone** | yes (`detail.branches[].phone`) | yes (`branches[].phone`) | facility line, **shared by all doctors at that facility** |
| **schedule** | structured (`detail.schedule[]`) | structured (`branches[0].schedule[]`) + `chamber_time`/`off_day` fallback | shape-compatible |
| floor/room | — | yes | Ibn-only |
| leave status | yes (`on_leave`, `absent_*`, `absent_message`) | — | PD-only |
| photo URL | 3,237 (99.8% downloaded) | 1,932 (34% downloaded) | both |

**Key implication**: no shared strong identifier (no BMDC; Ibn mobile always
null; branch phones are facility-level and differ across the two chains).
Matching uses **`nameKey` to block, gender + canonical specialty to decide, the
PD doctor mobile to confirm intra-PD.**

---

## 2. Unified record schema

Two layers: a **canonical** view ready to seed into the production `Doctor`
model, plus a **`sources[]`** array preserving each raw record verbatim.

```typescript
// data/unified/doctors.json is an array of UnifiedDoctor.
interface UnifiedDoctor {
  // === Identity ===
  unifiedId: string;          // sha1(sorted("source:sourceId" list)).slice(0,12)
  matchKey: {
    nameKey: string;          // normalizeNameForMatch(displayName)
    specialties: string[];    // canonical names across the cluster
    tier: "MERGE-HIGH" | "MERGE-MEDIUM" | "REVIEW" | "SEPARATE" | "SINGLE";
  };

  // === Canonical (production-shaped) ===
  canonical: {
    name: { prefix, first, last, displayName };
    gender?: "male" | "female" | "other" | "prefer_not_to_say";
    bio?: string;                                   // longest non-null
    contact: { publicPhone?: string; publicEmail?: string };
    languages: string[];                            // union, deduped
    qualifications: { degree, institution, year, country }[]; // union by degree
    specialties: {                                  // one entry per source string — source+canonical PAIRED, nothing dropped
      canonical: string;                            // from SPECIALTIES; "Other / Unspecified" if unmappable
      fhirCode?: string;
      sourceValue: string;                          // verbatim source specialty string
      sourceProvider: "popular-diagnostic" | "ibn-sina";
      isPrimary: boolean;
      matchConfidence: "high" | "medium" | "low" | "fallback";
    }[];
    sourceSpecialties: string[];                    // all raw source strings, deduped (kept for display/search)
    subSpecialties: string[];                       // extra free-text not used as a canonical
    chambers: {                                     // ref + DENORMALIZED query keys; display fields stay in ChamberLocation
      chamberLocationId: string;                    // FK → ChamberLocation.id ("popular-diagnostic:1")
      // denormalized location — the ONLY queryable/sortable fields (indexed; stable + tiny):
      division: string;
      district: string;
      area: string;
      // per-doctor, display-only (never queried):
      schedule: { day, startTime, endTime, available }[];
      floor?: string;                               // Ibn-only (can be doctor-specific)
      room?: string;                                // Ibn-only
      isPrimary: boolean;
    }[];
    designation?: string;                           // Ibn
    institute?: string;                             // Ibn
    externalImageUrl?: string;                      // first non-null
    photos: { source, url, localPath? }[];          // ALL refs across sources
  };

  // === Provenance & audit ===
  sources: {
    source: "popular-diagnostic" | "ibn-sina";
    sourceId: string;
    sourceUrl: string;
    scrapedAt: string;
    raw: object;            // VERBATIM source record — nothing dropped
  }[];
  conflicts: {
    field: string;
    values: { source: string; value: unknown }[];
    chosen: { source: string; value: unknown };
    reason: string;
  }[];
  warnings: string[];
  createdAt: string;        // build timestamp passed in as arg
}

// data/chambers/chamber-locations.json — the Chamber collection (47 now, grows to 10k+).
// Display fields live ONLY here; the 3 location fields are copied onto Doctor.chambers[] for querying.
interface ChamberLocation {
  id: string;               // "{provider}:{branchId}" — e.g. "popular-diagnostic:1"
  provider: string;
  branchId: number;         // source-assigned, stable (verified: exactly 1 address per id)
  // canonical location — source of truth; stamped onto Doctor.chambers[] (the query keys):
  division: string;         // 8
  district: string;         // 64 — MANDATORY (build asserts every row resolves)
  area: string;             // locality, e.g. "Dhanmondi" — from the gazetteer
  // display-only (fetched by id at render; NEVER queried):
  name: string;             // "Popular Diagnostic Centre Ltd. Dhanmondi" (titleCased / prefixed)
  address: string;          // the source `map` (1 distinct value per branchId)
  sourceCity: string;       // ORIGINAL branch/city text — preserved
  phone?: string;           // facility reception line (shared by all its doctors)
  coordinates?: { lat: number; lng: number };
}
```

`canonical.*` mirrors the production `Doctor` model and the existing
`CandidateFields` shape ([scripts/lib/providers/types.ts](../../scripts/lib/providers/types.ts)),
so seeding later is mechanical. `sources[].raw` guarantees the union of every
field even when `canonical` doesn't surface it. **Chambers are normalized**: the
~47 distinct facilities live once in `ChamberLocation` (location resolved once);
each doctor's `chambers[]` only references one by `chamberLocationId` and carries
that doctor's own schedule/room/floor.

---

## Step A — Chamber catalog & seed (run BEFORE Phase 0)

Chambers are a **separate, first-class reference collection** — built and **seeded
before** any doctor processing, like the specialty catalog. The ~47 distinct
facilities (PD 27 + Ibn 20 `branch_id`s; verified exactly 1 address per id) live
once; doctors later reference a row by `chamberLocationId`. This replaces per-doctor
location resolution (5,169×) with per-facility (47×) — the same facility can never
resolve two ways.

The 64-district catalog already exists and is tested — `src/lib/geo/bd-districts.ts`
(`BD_DISTRICTS` = 64, `canonicalizeDistrict`, `recoverDistrictFromFreeText`) — plus
an ingest `AREAS` table (area→district).

**A1. Build the chamber raw file** `data/chambers/chamber-locations.json` (separate,
committed, hand-reviewable — 47 rows):
1. Extract the 47 distinct `(provider, branch_id)` facilities. Stable id =
   `"{provider}:{branchId}"`; address is consistent per id (verified).
2. Resolve each row's `city` (64-district) + `area` **once** via `parseBdAddress`.
   Fixes the PD `city: "Dhaka"` hardcode
   ([popular.ts:243](../../scripts/lib/providers/popular.ts)).
3. Spelling/alias layer (`Narayangonj`→Narayanganj, `Bogra`→Bogura, `Jessore`→Jashore,
   `Chittagong`→Chattogram) + reconcile `bd-admin.ts` (**65** keys — `Comilla`/`Cumilla`
   dup) against the tested 64.
4. Area = the branch/facility locality
   (`Dhanmondi → { city: "Dhaka", area: "Dhanmondi" }`). Seed AREAS→Dhaka gaps:
   `Jatrabari`, `Savar`, `English Road`, `Kallyanpur`, `Doyagonj`, `Keraniganj`.
5. Preserve the original branch/city text in `sourceCity`.
6. **Build asserts all 47 resolve** — an unknown locality is a build error (fix the
   gazetteer), never a `null` or defaulted "Dhaka".

**A2. Seed the chambers** into a new `Chamber` collection (idempotent upsert keyed by
the stable `id`, exactly like the specialty seed in `seed.ts`) — runs **before** Phase 0.

**Phase 0 stays DB-less:** the stable string id is the contract — the seed loads the
file into Mongo, and Phase 0 references the same ids straight from the file.

---

## Phase 0 — Field normalization: specialty + doctor→chamber links (build BEFORE §3)

### Phase 0a — Specialty coverage

Specialty is the **merge gate** (§3.2 rule 3) *and* the "every doctor has ≥1
canonical specialty" invariant, so resolution must be solid before clustering.
Measured coverage today: **PD 3,236/3,237; Ibn Sina 1,747/1,932 (185 unresolved,
~10%)**. The unresolved are almost all real specialties written differently
(word-order, abbreviations, British spelling, typos).

Extend `resolveSpecialty`
([scripts/lib/normalize/specialty.ts](../../scripts/lib/normalize/specialty.ts))
with layered, **source-agnostic** rules (this benefits every source's ingest, not
just this merge) and attach a confidence to each result:

1. (existing) exact → alias → paren-strip.                                → HIGH
2. normalize: strip dots (`E.N.T`→ent), `&`↔`and`, collapse whitespace.   → HIGH
3. order-independent **token-set** match
   (`Gynaecology & Obstetrics` ↔ `Obstetrics & Gynaecology`).             → HIGH
4. British→American + abbreviation map
   (`Paediatric`→Pediatric, `Orthopaedics`→Orthopedics, `Gynae`→Gynaecology,
   `Obs`→Obstetrics).                                                      → HIGH
5. conservative Levenshtein (≤2 on a token) for typos
   (`Onclogy`→Oncology, `Endocrionology`→Endocrinology, `Heapatology`→Hepatology). → MEDIUM
6. keyword→canonical for descriptive strings
   (chest/respiratory/asthma→Pulmonology; diet/nutrition→Nutrition & Dietetics;
   skin→Dermatology; newborn/neonat→Neonatology; physio→Physical Medicine &
   Rehabilitation; hepato→Hepatology; IVF/infertility→Obstetrics & Gynaecology). → MEDIUM
7. fallback for the genuine remainder (see policy below).                 → FALLBACK

Measured effect: rules 2–4 alone rescue **128 of 185**; rules 5–6 clear ~35–40
more, leaving ~15–20 genuinely off-catalog records.

**Off-catalog policy (decided):**
- **`Biochemistry`, `Microbiology`, `Forensic Medicine` → `Pathology`**
  (laboratory / diagnostic-medicine umbrella; raw kept in `sourceValue`;
  confidence MEDIUM). Promote to standalone catalog entries later if desired —
  the raw string makes that lossless.
- **`Natural Medicine` + anything still unmatched → `Other / Unspecified`** — a
  new catch-all added to `SPECIALTIES`, **excluded from the merge gate** (raw
  kept; confidence FALLBACK). Avoids a false-merge magnet of look-alike "Other"
  doctors.

Outcome: **100% of records carry ≥1 canonical specialty**, the raw source string
is always preserved (`canonical.specialties[].sourceValue` +
`canonical.sourceSpecialties[]`), and the merge gate fires only on HIGH/MEDIUM
canonicals (FALLBACK never auto-merges — see §3.2).

### Phase 0b — Link doctors to the seeded chambers

Doctor normalization references **Step A**: each `chambers[]` entry =
`{ chamberLocationId, schedule, room?, floor? }` — the facility id from the chamber
catalog + that doctor's own days/times. **No facility fields are embedded.** If a
doctor's `branch_id` isn't in the seeded catalog the build errors (the catalog is
authoritative) — guaranteeing every chamber resolves to a real, city-bearing facility.

Ship order: **Step A** (chamber catalog + seed) as **PR0 ✅ DONE**; **Phase 0**
(specialty coverage + doctor→chamber links) as **PR1 ✅ DONE**; the merge as
**PR2 ✅ DONE**; **seed into MongoDB ✅ DONE** (`npm run seed:unified` →
**4,899 doctors**, idempotent).

> **Seeded (doctor-id-dev):** 4,899 doctors (from `data/unified/doctors.json`),
> 47 chambers, 48 specialties. Doctor model gained chamber **refs**
> (`chambers[].chamberLocationId` → Chamber collection) + cached display fields
> (PhotoSchema-style, #12) + **`sourceProvider`/`sourceProviderId` provenance with a
> partial-unique index** — which fixed a pre-existing idempotency bug (those fields
> weren't in the schema, so each `--source` re-ingest duplicated the collection →
> the 17,810 rows we found). Re-running `seed:unified` now holds at 4,899.

> **Status (PR0+PR1+PR2 shipped):** 47-row chamber catalog (100% district-resolved)
> + `Chamber` model + idempotent seed; `resolveSpecialty` 9-layer (Ibn 90%→**99.7%**
> gate-eligible, PD 100%, 0 NULL) + `Other / Unspecified` bucket; per-source
> normalized staging (chamber **references** + paired specialties); merge →
> **4,899 unified docs** from 5,169 records: 56 cross-source merges (district-gated),
> 80 intra-high + 123 intra-medium, 143 review groups, 9 same-facility chamber
> dedups, 375 conflicts logged. typecheck clean, **420 tests**, build green.

---

## 3. Matching & merge logic

**The merge unit is a doctor; the output is one profile carrying every branch as
its own chamber.** Each source record holds exactly one branch (`branches[]` is
always length 1 in both sources), so a doctor at *N* branches appears as *N*
records — merging them **unions their chambers**, dropping nothing. `nameKey` is
used only to *block*. The same-doctor decision uses **gender + canonical
specialty**, with **phone as a confirmer** — never the degree token, never a
co-occurrence graph.

### 3.1 Block — generate candidate groups

- Compute `nameKey = normalizeNameForMatch(name)` for all 5,169 records.
- Group records by `nameKey`.
- (Optional) also block PD records by identical `detail.mobile` to catch a
  doctor whose name is spelled differently across two branch records but shares
  a cell — additive, never splitting.
- A group is a *candidate set*, not yet a doctor.

### 3.2 Same-doctor test — split each name-group into doctor-clusters

Within a name-group, link records pairwise with this **ordered** test, then take
connected components (groups are tiny — usually 2–3 records):

| # | Condition (in order) | Result |
|---|---|---|
| 1 | gender both **known** and **differs** (PD only — Ibn null = wildcard) | **different people** — never link |
| 2 | phone both present and **equal** | **same doctor** — link (decisive; if specialties differ, it's one *multi-specialty* doctor → union specialties) |
| 3 | **HIGH/MEDIUM** canonical specialty **intersects** (`resolveSpecialty`, Phase 0), gender compatible | **same doctor** — link (**different phone is allowed** — it's a per-branch number, not a disqualifier). A FALLBACK specialty (`Other / Unspecified`) never satisfies this rule. |
| 4 | none of the above (specialty disjoint, phone differs/absent) | **don't link** → §3.3 |

Connected components of "link" = the doctor-clusters.

> Worked example — `md mukhlesur rahman`: two Cardiology records share phone
> `01712503818` → linked (one doctor, two branches); a General-Medicine record
> with a different phone → its own doctor. One name → two doctors, correctly.

### 3.3 Decision per doctor-cluster

| Outcome | Trigger | Action |
|---|---|---|
| **MERGE-HIGH** | intra-source linked via **rule 2 (same phone)**; or cross-source clean **1 PD + 1 Ibn** via rule 3 | auto-merge, **union chambers** |
| **MERGE-MEDIUM** | linked via **rule 3 only** (specialty agrees, no phone lock): PD multi-branch (has gender) *or* Ibn multi-facility (no gender — weakest) | auto-merge, union chambers, **tag for audit** |
| **REVIEW** | cross-source **collision** (≥2 on a side), or any **cross-source** name-match left unlinked by rule 4 | do **not** merge; emit each side separately **and** write the pair to `review-queue.md` |
| **SEPARATE** | intra-source records unlinked by rule 1 or rule 4 | distinct people — separate profiles, not flagged |
| **SINGLE** | one record, nothing links to it | pass through (1 source, 1 chamber) |

No degree-token signal; no auto-merge without gender/specialty agreement;
**cross-source pairs are never silently dropped** — unconfirmed ones go to
REVIEW (~130 items, fully human-reviewable).

### 3.4 Merge operation — folding a cluster (the chamber union)

1. **Chambers — union the `chamberLocationId` references** across all records in
   the cluster. Each record contributes one reference (its facility) + that
   doctor's schedule.
2. **Dedupe references by `chamberLocationId`.** When two records point to the same
   facility (the 2 true same-branch dups in PD), keep one reference and **merge the
   schedule slots**. Facility data is untouched — it lives once in `ChamberLocation`.
3. **Per-doctor data stays on the reference**: schedule, plus any doctor-specific
   room/floor/booking phone, are never flattened away.
4. **Specialties** — union (deduped by canonical name); a rule-2 multi-specialty
   merge keeps all.
5. **Photos / qualifications / languages** — union. **Bio** — longest.
   **name/gender/publicPhone** — per the conflict table (§3.6).
6. **Pre-fold normalization** (shapes `canonical` only — never mutates
   `sources[].raw`): PD chamber names → `"Popular Diagnostic Centre Ltd. " +
   titleCase(branch)` (one-line edit at
   [scripts/lib/providers/popular.ts:240](../../scripts/lib/providers/popular.ts),
   currently `"Popular Diagnostic — {branch}"`). Ibn chamber names left as-is
   (already self-qualified).

### 3.5 Stable `unifiedId`

`sha1(sorted("{source}:{sourceId}" for each record in the cluster)).slice(0,12)`
— order-independent, deterministic across re-runs.

### 3.6 Conflict resolution (linked records with differing values)

| Field | Rule |
|---|---|
| `name.displayName` | Longest after `parseDoctorName` |
| `name.prefix` | Rank: `Prof. Dr.` > `Assoc. Prof. Dr.` > `Asst. Prof. Dr.` > `Dr.` |
| `gender` | First **known** (PD wins; Ibn null) |
| `bio` | Longest non-null (PD-only) |
| `contact.publicPhone` | First non-null PD doctor mobile; branch numbers live on each chamber |
| `designation`, `institute` | First non-null (Ibn-only) |
| `languages`, `qualifications` | Union, deduped (qualifications by normalized degree token) |
| `specialties` | Concatenate entries from every record (one per source string); dedupe only exact (same `sourceProvider` + `sourceValue`). Keep each entry's `canonical` + `sourceValue` + `matchConfidence`; `isPrimary` per source. |
| `sourceSpecialties` | Union of all raw source strings, deduped |
| **`chambers`** | **Union of `chamberLocationId` refs, deduped by id; schedules merged when two refs share a facility (§3.4)** |
| `externalImageUrl` / `photos` | First non-null URL; ALL refs preserved in `photos[]` |

Every linked-and-differing known value gets a `conflicts[]` entry.

### Expected outcomes (measured — sign-off targets)

- **Intra-PD:** ~**103** multi-branch consolidations (64 phone-confirmed
  *high* + 39 specialty-confirmed *medium*) + **2** true same-branch dedups;
  ~**78** name-groups correctly kept as separate people.
- **Intra-Ibn:** ~**72** multi-facility consolidations (no phone/gender →
  specialty-only, *medium*, tagged); 61 kept separate; 16 unresolved.
- **Cross-source:** ~**56** clean auto-merges (*high*) + ~**33** collisions →
  REVIEW; ~**99** specialty-disagree/unresolved → REVIEW.
- **True "drop a record" cases: 2.** Everything else preserves all chambers.

---

## 4. Output artifacts

```
data/chambers/
  chamber-locations.json the 47 ChamberLocation rows (Step A) — committed + curated,
                         SEEDED into the new `Chamber` collection BEFORE Phase 0

data/unified/
  doctors.json           array of UnifiedDoctor (§2 + §3); chambers reference chamberLocationId
  clusters.json          audit: { unifiedId, nameKey, specialties[], sources[], tier,
                            chamberCount } — one line per doctor-cluster
  review-queue.md   REVIEW-tier pairs side-by-side (name, specialties, chambers,
                            qualifications) for manual decision
  report.json       summary: {
                      inputs: { popularDiagnostic: 3237, ibnSina: 1932 },
                      clusters: { total, single, separate,
                                  intraMerge_high, intraMerge_medium,
                                  crossMerge_high, review },
                      chambers: { locations: 47, refsUnioned, sameFacilityDeduped },
                      conflictCounts: { byField: {...} },
                      warnings: { total, byKind: {...} },
                      generatedAt
                    }
  conflicts.md      human-readable: top conflicting fields for spot-check
```

`doctors.json` lands around **30–50 MB** (raw inputs are 11 MB + 4.1 MB ≈ 15 MB;
inlining `sources[].raw` duplicates that, plus the canonical layer and
pretty-printing). This is the intentional cost of the "nothing dropped" rule.

---

## 5. Script to write — `scripts/build-unified.ts`

A single new file. Pure-functional, **no DB, no network**. Steps:

1. **Build the SpecialtyLookup offline.** Both normalizers require a
   `SpecialtyLookup`. The canonical catalog is currently an inline `const
   SPECIALTIES` in [scripts/seed.ts](../../scripts/seed.ts) (~line 81) and is
   **not exported** — factor it into a shared `scripts/lib/specialty-catalog.ts`
   (export `{ name, fhirCode }[]`), import it in both `seed.ts` and here, then
   `buildSpecialtyLookup(catalog)`. No DB read needed. **Phase 0 must ship
   first** — the extended `resolveSpecialty` + the new `Other / Unspecified`
   catalog entry are prerequisites for the merge gate.
2. **Load raw records and normalize per-record, keeping raw.** The generators
   `loadPopular()` / `loadIbnSina()` exist but yield `CanonicalCandidate` and
   **discard the raw record**, which the schema's `sources[].raw` needs. So
   mirror the per-record path already used in
   [seed.ts:289–319](../../scripts/seed.ts):
   - **PD**: `loadPopularIndex()` → for each id, `loadPopularDetail(id)` (this
     object *is* the raw) → `normalizePopularDoctor(detail, id, lookup)` →
     `toCanonicalCandidate(norm, scrapedAt)`. Keep `detail` as `raw`.
   - **Ibn**: read `data/ibn-sina/doctors.json` → for each `doc`,
     `normalizeIbnSinaDoctor(doc, lookup, scrapedAt)`. Keep `doc` as `raw`.
   - Carry `(candidate, raw)` together via `candidate.sourceMeta.sourceId`.
3. **Block + split (§3.1–§3.2)**: group candidates by `dedupKeys.nameKey`; within
   each group run the ordered same-doctor test and take connected components to
   get doctor-clusters. *(This replaces the old single-key `(nameKey,
   primarySpecialty)` grouping.)*
4. **Classify + fold (§3.3–§3.6)**: tier each cluster, union chambers, resolve
   conflicts.
5. **Always set `sources[].raw`** = the verbatim raw object from step 2 (never
   the normalized candidate).
6. **Write** the five artifacts in §4.

CLI:

```
npx tsx scripts/build-unified.ts                 # full run
npx tsx scripts/build-unified.ts --limit=100     # sample for inspection
npx tsx scripts/build-unified.ts --dry-run       # write nothing; print report.json
```

Add `package.json` script: `"build:unified": "tsx scripts/build-unified.ts"`.

**Reuse (verified to exist) — do NOT reimplement:**
- [scripts/lib/providers/popular.ts](../../scripts/lib/providers/popular.ts) —
  `loadPopularIndex`, `loadPopularDetail`, `normalizePopularDoctor`,
  `toCanonicalCandidate`
- [scripts/lib/providers/ibn-sina.ts](../../scripts/lib/providers/ibn-sina.ts) —
  `normalizeIbnSinaDoctor`
- [scripts/lib/normalize/name.ts](../../scripts/lib/normalize/name.ts) —
  `normalizeNameForMatch`, `parseDoctorName` (re-exported)
- [scripts/lib/normalize/specialty.ts](../../scripts/lib/normalize/specialty.ts) —
  `buildSpecialtyLookup`, `resolveSpecialty`
- [scripts/lib/normalize/schedule.ts](../../scripts/lib/normalize/schedule.ts) —
  `to24h`, `normalizeDay`, `normalizeStructuredSchedule`
- [scripts/lib/normalize/address.ts](../../scripts/lib/normalize/address.ts) —
  `parseBdAddress`, `resolveCity`

New code is only: the catalog extraction, the block→split→fold→write logic.
~300 lines.

---

## 6. Verification

After the build completes:

1. **`report.json` sanity**: `single + separate + all merge tiers + review`
   clusters account for all 5,169 input records. Tier counts are close to the
   §3 measured targets (intra-PD ~103 merges, cross-source ~56 high + ~132
   review, 2 same-branch dedups).
2. **Chamber-union integrity** (the core invariant): pick 10 multi-branch merges
   and confirm the merged doctor carries **one chamber per source branch** with
   address/schedule/phone/floor/room intact — i.e. no branch was dropped. Pick
   the 2 same-branch dedups and confirm their schedules were merged, not lost.
3. **Inspect 10 random cross-source MERGE-HIGH clusters** in `clusters.json` to
   confirm real same-person matches, not name collisions. If false-positive rate
   >10%, tighten rule 3 (e.g. require same city).
4. **Skim `review-queue.md`** (~130 pairs) for obvious same-person matches the
   gate was too strict to auto-merge.
5. **Inspect 10 random `conflicts.md` entries** for sensible winners.
6. **Field-presence audit**: 5 records — confirm every top-level key in the
   source `raw` survives byte-for-byte under `sources[].raw`.
7. **No DB writes, no production impact** — disk I/O only.

If verification passes, the user gives the go-ahead for a follow-up seed into
MongoDB. **That step is out of scope here.**

---

## 7. Decisions locked in

- **Name blocks; gender + specialty decide; phone confirms.** No degree-token
  gate, no specialty co-occurrence graph (both shown unreliable on this data).
- **A merge is a chamber union, not a record drop.** Intra-source "duplicates"
  are overwhelmingly the same doctor at different branches (measured: 103 of 183
  PD name-groups); only 2 records are true same-branch redundancies. All
  branches, schedules, phones, floor/room survive into `canonical.chambers[]`.
- **A different phone is not a disqualifier** — it's a per-branch number. Phone
  *equality* confirms; phone *difference* is ignored (this fixed the 39 PD
  multi-branch doctors the prior heuristic mislabeled as different people).
- **Gender mismatch is a hard block** (PD only — Ibn gender is null = wildcard).
- **Cross-source merges are HIGH-only (clean 1:1 + specialty agreement).**
  Everything cross-source we can't confirm → `review-queue.md`, never auto-merge
  and never silently split away.
- **One relaxation to confirm**: Ibn-only multi-facility merges (rule 3, ~72)
  have neither phone nor gender — only name + specialty. Default is
  **MERGE-MEDIUM (auto, tagged for audit)** because 72 is impractical to
  hand-review and Ibn's one-branch-per-record structure makes multi-facility the
  likely explanation; a wrong merge here affects only Ibn's listing granularity,
  not cross-source identity. **Flip to REVIEW if you want maximum conservatism.**
- **Specialty: source + canonical are both kept, paired.** Every
  `canonical.specialties[]` entry carries `sourceValue` (verbatim), `canonical`
  (from `SPECIALTIES`), and `matchConfidence`; all raw strings also live in
  `sourceSpecialties[]`. Off-catalog: `Biochemistry`/`Microbiology`/`Forensic
  Medicine` → `Pathology`; `Natural Medicine` + residue → a new
  merge-gate-excluded `Other / Unspecified`. Specialty coverage (Phase 0) is a
  prerequisite PR built before the merge.
- **Chambers are a separately-seeded reference collection (~47 rows).** A standalone
  `data/chambers/chamber-locations.json` is built + curated, then **seeded into a new
  `Chamber` collection before Phase 0** (Step A / PR0); doctors reference it by
  `chamberLocationId` + carry their own schedule. Location (`city` = mandatory
  64-district, `area`, `division`, `sourceCity`) resolves once per facility; build
  asserts all 47. Fixes the PD `city: "Dhaka"` hardcode.
- **Production Doctor chamber model: split by access pattern** (pre-production →
  drop the embedded `ChamberSchema` at
  [Doctor.ts:235](../../src/lib/db/models/Doctor.ts) and redesign). Built for **10k+
  chambers** where the ONLY query/sort keys are `division`/`district`/`area` and
  everything else is display-only.
  - **`Chamber` collection** = source of truth + all display fields (name, address,
    phone, coordinates), fetched by `_id` only — never scanned.
  - **`Doctor.chambers[] = { chamberLocationId, division, district, area, schedule,
    room?, floor? }`** — the 3 location fields are a **denormalized, indexed copy**
    (the query keys), stamped from the `Chamber` row at link time; display data is
    referenced.
  - **Indexes**: multikey `chambers.district` / `chambers.area` / `chambers.division`
    on `Doctor` → location search/sort is a **single index hit, independent of chamber
    count**. Specialty + location stay *separate* single-field indexes intersected by
    the planner (parallel-arrays rule, CLAUDE.md #5).
  - **Display**: fetch the page's chamber docs by `_id` (`$in`, a few per page) —
    cheap at any scale, no 10k cache needed. **SEO unaffected** (resolved server-side
    during SSR).
  - **Why not pure-ref**: at 10k, "resolve location→chamberIds→`$in` doctors" explodes
    (a big district → thousands of ids). Denormalizing 3 stable, tiny, low-cardinality
    fields makes it `O(matching doctors)`. Bulky/volatile fields stay single-source in
    `Chamber` — same philosophy as PhotoSchema (CLAUDE.md #12).
- **Output location**: `data/unified/` — the path we just cleared.
```
