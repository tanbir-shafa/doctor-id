/**
 * Canonical list of the 64 districts and 8 divisions of Bangladesh.
 *
 * Single source of truth for everything that touches `Doctor.chambers[].city`
 * and `.division` — the Zod validator, Mongoose `enum`, dashboard chambers
 * editor dropdown, admin doctors list filter, the one-time DB migration,
 * the `data/unified/doctors.json` canonicalization, and the ingest pipeline.
 *
 * No Mongo collection backs this. The 64 districts are stable government-
 * defined administrative units (last change: Mymensingh division split off
 * in 2015); they are not admin-editable and don't justify the operational
 * cost of a Mongo collection + seeding flow + admin UI. The existing
 * `Specialty` collection lives in the DB because *that* catalog gets edited.
 * Districts don't.
 *
 * Naming policy
 * -------------
 * District names use the spelling that dominates the live data and BMDC
 * registry: "Chittagong" (not "Chattogram"), "Barisal" (not "Barishal"),
 * "Bogra" (not "Bogura"), "Comilla" (not "Cumilla"), "Jessore" (not
 * "Jashore"). The post-2018 official spellings are accepted as aliases.
 *
 * Division names follow the post-2018 official spellings ("Chattogram",
 * "Barishal") so the FHIR seam [lib/fhir/practitioner.ts] emits values
 * the EMR side expects.
 */

export const BD_DIVISIONS = [
  "Dhaka",
  "Chattogram",
  "Rajshahi",
  "Khulna",
  "Barishal",
  "Sylhet",
  "Rangpur",
  "Mymensingh",
] as const;
export type BdDivision = (typeof BD_DIVISIONS)[number];

interface DistrictEntry {
  readonly name: string;
  readonly division: BdDivision;
}

// 64 districts, grouped by division. Order within each division is alphabetical
// so the rendered <select> reads predictably.
export const BD_DISTRICTS: ReadonlyArray<DistrictEntry> = [
  // Dhaka division — 13 districts
  { name: "Dhaka", division: "Dhaka" },
  { name: "Faridpur", division: "Dhaka" },
  { name: "Gazipur", division: "Dhaka" },
  { name: "Gopalganj", division: "Dhaka" },
  { name: "Kishoreganj", division: "Dhaka" },
  { name: "Madaripur", division: "Dhaka" },
  { name: "Manikganj", division: "Dhaka" },
  { name: "Munshiganj", division: "Dhaka" },
  { name: "Narayanganj", division: "Dhaka" },
  { name: "Narsingdi", division: "Dhaka" },
  { name: "Rajbari", division: "Dhaka" },
  { name: "Shariatpur", division: "Dhaka" },
  { name: "Tangail", division: "Dhaka" },

  // Chattogram division — 11 districts
  { name: "Bandarban", division: "Chattogram" },
  { name: "Brahmanbaria", division: "Chattogram" },
  { name: "Chandpur", division: "Chattogram" },
  { name: "Chittagong", division: "Chattogram" },
  { name: "Comilla", division: "Chattogram" },
  { name: "Cox's Bazar", division: "Chattogram" },
  { name: "Feni", division: "Chattogram" },
  { name: "Khagrachhari", division: "Chattogram" },
  { name: "Lakshmipur", division: "Chattogram" },
  { name: "Noakhali", division: "Chattogram" },
  { name: "Rangamati", division: "Chattogram" },

  // Rajshahi division — 8 districts
  { name: "Bogra", division: "Rajshahi" },
  { name: "Chapainawabganj", division: "Rajshahi" },
  { name: "Joypurhat", division: "Rajshahi" },
  { name: "Naogaon", division: "Rajshahi" },
  { name: "Natore", division: "Rajshahi" },
  { name: "Pabna", division: "Rajshahi" },
  { name: "Rajshahi", division: "Rajshahi" },
  { name: "Sirajganj", division: "Rajshahi" },

  // Khulna division — 10 districts
  { name: "Bagerhat", division: "Khulna" },
  { name: "Chuadanga", division: "Khulna" },
  { name: "Jessore", division: "Khulna" },
  { name: "Jhenaidah", division: "Khulna" },
  { name: "Khulna", division: "Khulna" },
  { name: "Kushtia", division: "Khulna" },
  { name: "Magura", division: "Khulna" },
  { name: "Meherpur", division: "Khulna" },
  { name: "Narail", division: "Khulna" },
  { name: "Satkhira", division: "Khulna" },

  // Barishal division — 6 districts
  { name: "Barguna", division: "Barishal" },
  { name: "Barisal", division: "Barishal" },
  { name: "Bhola", division: "Barishal" },
  { name: "Jhalokati", division: "Barishal" },
  { name: "Patuakhali", division: "Barishal" },
  { name: "Pirojpur", division: "Barishal" },

  // Sylhet division — 4 districts
  { name: "Habiganj", division: "Sylhet" },
  { name: "Moulvibazar", division: "Sylhet" },
  { name: "Sunamganj", division: "Sylhet" },
  { name: "Sylhet", division: "Sylhet" },

  // Rangpur division — 8 districts
  { name: "Dinajpur", division: "Rangpur" },
  { name: "Gaibandha", division: "Rangpur" },
  { name: "Kurigram", division: "Rangpur" },
  { name: "Lalmonirhat", division: "Rangpur" },
  { name: "Nilphamari", division: "Rangpur" },
  { name: "Panchagarh", division: "Rangpur" },
  { name: "Rangpur", division: "Rangpur" },
  { name: "Thakurgaon", division: "Rangpur" },

  // Mymensingh division — 4 districts
  { name: "Jamalpur", division: "Mymensingh" },
  { name: "Mymensingh", division: "Mymensingh" },
  { name: "Netrokona", division: "Mymensingh" },
  { name: "Sherpur", division: "Mymensingh" },
];

export type BdDistrict = (typeof BD_DISTRICTS)[number]["name"];

export const BD_DISTRICT_NAMES: readonly string[] = BD_DISTRICTS.map((d) => d.name);

// O(1) lookup: district name → division.
const DISTRICT_TO_DIVISION = new Map<string, BdDivision>(
  BD_DISTRICTS.map((d) => [d.name.toLowerCase(), d.division]),
);

/**
 * Alias table — maps every messy historical value observed in
 * `data/unified/doctors.json` (and a few sensible defensive aliases) to a
 * canonical district name. Keys are lowercased + whitespace-normalized so
 * `canonicalizeDistrict()` can compare insensitively.
 *
 * Maintenance: when the canonicalize:cities or migrate:cities script flags
 * a new unmappable value, add it here.
 */
const BD_DISTRICT_ALIASES: Readonly<Record<string, BdDistrict>> = {
  // Post-2018 official renames the data sometimes uses
  chattogram: "Chittagong",
  barishal: "Barisal",
  bogura: "Bogra",
  cumilla: "Comilla",
  jashore: "Jessore",

  // Spelling variants and typos observed in the source data
  mymenshing: "Mymensingh",
  kustia: "Kushtia",
  sirajgonj: "Sirajganj",
  coxsbazar: "Cox's Bazar",
  "coxs bazar": "Cox's Bazar",
  "cox bazar": "Cox's Bazar",
  jhenidah: "Jhenaidah",
  "chapai nawabganj": "Chapainawabganj",
  chapainawabgonj: "Chapainawabganj",
  nawabganj: "Chapainawabganj",
  khagrachari: "Khagrachhari",
  laxmipur: "Lakshmipur",
  brahminbaria: "Brahmanbaria",

  // Postal-code / annotated Dhaka strings
  "dhaka 1205": "Dhaka",
  "dhaka 1207": "Dhaka",
  "dhaka 1212": "Dhaka",
  "dhaka 1216": "Dhaka",
  "dhaka 1230": "Dhaka",
  "dhaka with expertise in treating stroke": "Dhaka",
  "dhaka with qualifications including mbbs": "Dhaka",
  dhata: "Dhaka", // observed typo, chamber name confirmed it's Dhaka

  // Thana / upazila / neighborhood names that aren't districts themselves;
  // map to the district they belong to.
  savar: "Dhaka", // Savar upazila → Dhaka district
  dhanmondi: "Dhaka", // neighborhood
  uttara: "Dhaka", // neighborhood
  mirpur: "Dhaka", // there's also a Mirpur in Kushtia, but the observed
                   //  record's chamber name placed it in Dhaka
  ishwardi: "Pabna", // upazila of Pabna
  debidwar: "Comilla", // upazila of Comilla

  // Dhaka thanas / well-known neighborhoods, observed in chamber name/street
  // fields where the explicit `city` field was missing. Each is part of Dhaka
  // metropolitan area.
  mohakhali: "Dhaka",
  banani: "Dhaka",
  gulshan: "Dhaka",
  banasree: "Dhaka",
  shewrapara: "Dhaka",
  jatrabari: "Dhaka",
  kakrail: "Dhaka",
  hemayetpur: "Dhaka",
  doyagonj: "Dhaka", // Old Dhaka neighborhood
  dholaikhal: "Dhaka",
  mohammadpur: "Dhaka",
  dania: "Dhaka", // Dania, Jatrabari area
  donia: "Dhaka", // alt spelling of Dania
  motijheel: "Dhaka",
  tejgaon: "Dhaka",
  badda: "Dhaka",
  baridhara: "Dhaka",
  bashundhara: "Dhaka",
  rampura: "Dhaka",
  malibagh: "Dhaka",
  mogbazar: "Dhaka",
  farmgate: "Dhaka",
  khilkhet: "Dhaka",
  khilgaon: "Dhaka",
  shyamoli: "Dhaka",
  kallyanpur: "Dhaka",
  cantonment: "Dhaka",
  nabinagar: "Dhaka", // Nabinagar bus station, Savar upazila of Dhaka district
                       //  (there is also a Nabinagar upazila of Brahmanbaria,
                       //  but the lone observed record refers to the Savar one)

  // Narayanganj — frequent typo and the district HQ town name
  narayangonj: "Narayanganj",
  chashara: "Narayanganj", // district HQ town centre

  // Other district HQ towns / thanas that appear without their district name
  joydebpur: "Gazipur", // Joydebpur is the HQ of Gazipur district
  joydevpur: "Gazipur",
  kishorganj: "Kishoreganj",

  // Trailing-country variants
  "bogra, bangladesh": "Bogra",
  "dhaka, bangladesh": "Dhaka",
  "chittagong, bangladesh": "Chittagong",
};

/**
 * Resolve a raw city string to a canonical Bangladesh district.
 *
 * Returns `null` only when the input is null/empty/whitespace OR an unknown
 * value not present in the alias table. Callers that need to honor the
 * "every chamber must have a city" invariant should fall back to "Dhaka"
 * + set a `cityNeedsReview` flag when this returns `null`.
 *
 * Comparison is case-insensitive and whitespace-normalized; punctuation
 * (apostrophes, commas, periods) is stripped during the alias-key match
 * but preserved on output via the canonical district name.
 */
export function canonicalizeDistrict(raw: string | null | undefined): BdDistrict | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  const direct = DISTRICT_TO_DIVISION.get(lower);
  if (direct) {
    // Find and return the canonical-cased name (the Map key is lowercased).
    return BD_DISTRICTS.find((d) => d.name.toLowerCase() === lower)!.name;
  }
  // Try the alias table with the trimmed lowercase form first.
  if (BD_DISTRICT_ALIASES[lower]) return BD_DISTRICT_ALIASES[lower];
  // Try a punctuation-stripped form (apostrophes, periods, commas).
  const stripped = lower.replace(/['.,]/g, "").replace(/\s+/g, " ").trim();
  if (BD_DISTRICT_ALIASES[stripped]) return BD_DISTRICT_ALIASES[stripped];
  // Also try matching against canonical district names with punctuation stripped
  // (e.g., "coxs bazar" → "Cox's Bazar").
  const strippedDirect = BD_DISTRICTS.find(
    (d) => d.name.toLowerCase().replace(/['.,]/g, "").replace(/\s+/g, " ") === stripped,
  );
  if (strippedDirect) return strippedDirect.name;
  return null;
}

/**
 * Look up the division for a canonical district. Returns `null` if the
 * input is not one of the 64 known districts.
 */
export function divisionForDistrict(district: string | null | undefined): BdDivision | null {
  if (!district) return null;
  return DISTRICT_TO_DIVISION.get(district.toLowerCase()) ?? null;
}

/** Type guard — true when `name` is one of the 64 known districts (exact, case-sensitive). */
export function isKnownDistrict(name: string): name is BdDistrict {
  return BD_DISTRICTS.some((d) => d.name === name);
}

// Pre-computed lowercase token set for substring scanning. Includes the 64
// canonical names AND every alias key, so "mohakhali" -> Dhaka works as
// long as you add the alias. The scanner does word-boundary matching to avoid
// false positives ("dhaka" inside "dhakaria" should NOT match).
const SCAN_TOKENS: ReadonlyArray<readonly [token: string, district: BdDistrict]> = (() => {
  const entries: Array<[string, BdDistrict]> = [];
  for (const d of BD_DISTRICTS) {
    entries.push([d.name.toLowerCase(), d.name]);
    // Also include the punctuation-stripped form for Cox's Bazar etc.
    const stripped = d.name.toLowerCase().replace(/['.,]/g, "").replace(/\s+/g, " ").trim();
    if (stripped !== d.name.toLowerCase()) entries.push([stripped, d.name]);
  }
  for (const [alias, canonical] of Object.entries(BD_DISTRICT_ALIASES)) {
    entries.push([alias.toLowerCase(), canonical]);
  }
  // Sort longest-first so "cox's bazar" is tried before "cox".
  entries.sort((a, b) => b[0].length - a[0].length);
  return entries;
})();

/**
 * Last-resort recovery: scan free-text (a chamber name or street string) for
 * a known district token with word-boundary matching, and return the first
 * match.
 *
 * Used by the canonicalize script to salvage chambers where `address.city`
 * came in null but the chamber name or street mentions a real district.
 * Never used by the production validator path — that's strictly enum-only.
 */
export function recoverDistrictFromFreeText(text: string | null | undefined): BdDistrict | null {
  if (!text) return null;
  const lower = ` ${String(text).toLowerCase().replace(/[^a-z' ]/g, " ").replace(/\s+/g, " ")} `;
  for (const [token, district] of SCAN_TOKENS) {
    // Word-boundary check: token must be flanked by non-letter chars.
    const idx = lower.indexOf(` ${token} `);
    if (idx !== -1) return district;
  }
  return null;
}
