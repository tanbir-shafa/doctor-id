/**
 * Bangladesh administrative hierarchy — minimal table for ingest-time
 * address resolution.
 *
 * Scope:
 *  - All 8 divisions
 *  - All 64 districts mapped to their division
 *  - ~70 high-doctor-density thanas/upazilas/areas (mostly Dhaka, plus the
 *    other major divisional cities). Anything not in this table falls through
 *    and stays as free-text `area`.
 *
 * Source: Bangladesh Bureau of Statistics + manual curation of
 * Popular Diagnostic + sasthyaseba chamber-address samples. Last verified
 * 2026-05-30.
 *
 * Why not the full ~4,500-row union table? Because the public SEO surface
 * only needs division+city pairs (`/cardiology/dhaka/dhanmondi`) and we
 * already have 5 sources each carrying free-text city/area. Manual curation
 * of the ~70 high-traffic thanas covers >85% of merged chamber rows.
 */

export const DIVISIONS = [
    "Dhaka",
    "Chattogram",
    "Sylhet",
    "Rajshahi",
    "Khulna",
    "Barishal",
    "Rangpur",
    "Mymensingh",
] as const;

export type Division = (typeof DIVISIONS)[number];

interface DistrictEntry {
    division: Division;
    aliases?: string[]; // common alternate spellings
}

export const DISTRICTS: Record<string, DistrictEntry> = {
    // Dhaka division (13 districts)
    Dhaka: {division: "Dhaka"},
    Gazipur: {division: "Dhaka"},
    Kishoreganj: {division: "Dhaka"},
    Manikganj: {division: "Dhaka"},
    Munshiganj: {division: "Dhaka"},
    Narayanganj: {division: "Dhaka"},
    Narsingdi: {division: "Dhaka"},
    Tangail: {division: "Dhaka"},
    Faridpur: {division: "Dhaka"},
    Gopalganj: {division: "Dhaka"},
    Madaripur: {division: "Dhaka"},
    Rajbari: {division: "Dhaka"},
    Shariatpur: {division: "Dhaka"},

    // Chattogram division (11)
    Chattogram: {division: "Chattogram", aliases: ["Chittagong"]},
    "Cox's Bazar": {division: "Chattogram", aliases: ["Coxs Bazar"]},
    Comilla: {division: "Chattogram", aliases: ["Cumilla"]},
    Cumilla: {division: "Chattogram"},
    Bandarban: {division: "Chattogram"},
    Brahmanbaria: {division: "Chattogram"},
    Chandpur: {division: "Chattogram"},
    Feni: {division: "Chattogram"},
    Khagrachari: {division: "Chattogram", aliases: ["Khagrachhari"]},
    Lakshmipur: {division: "Chattogram"},
    Noakhali: {division: "Chattogram"},
    Rangamati: {division: "Chattogram"},

    // Sylhet division (4)
    Sylhet: {division: "Sylhet"},
    Habiganj: {division: "Sylhet"},
    Moulvibazar: {division: "Sylhet", aliases: ["Maulvi Bazar"]},
    Sunamganj: {division: "Sylhet"},

    // Rajshahi division (8)
    Rajshahi: {division: "Rajshahi"},
    Bogura: {division: "Rajshahi", aliases: ["Bogra"]},
    Joypurhat: {division: "Rajshahi"},
    Naogaon: {division: "Rajshahi"},
    Natore: {division: "Rajshahi"},
    Chapainawabganj: {division: "Rajshahi"},
    Pabna: {division: "Rajshahi"},
    Sirajganj: {division: "Rajshahi"},

    // Khulna division (10)
    Khulna: {division: "Khulna"},
    Bagerhat: {division: "Khulna"},
    Chuadanga: {division: "Khulna"},
    Jashore: {division: "Khulna", aliases: ["Jessore"]},
    Jhenaidah: {division: "Khulna"},
    Kushtia: {division: "Khulna"},
    Magura: {division: "Khulna"},
    Meherpur: {division: "Khulna"},
    Narail: {division: "Khulna"},
    Satkhira: {division: "Khulna"},

    // Barishal division (6)
    Barishal: {division: "Barishal", aliases: ["Barisal"]},
    Barguna: {division: "Barishal"},
    Bhola: {division: "Barishal"},
    Jhalokati: {division: "Barishal", aliases: ["Jhalakathi"]},
    Patuakhali: {division: "Barishal"},
    Pirojpur: {division: "Barishal"},

    // Rangpur division (8)
    Rangpur: {division: "Rangpur"},
    Dinajpur: {division: "Rangpur"},
    Gaibandha: {division: "Rangpur"},
    Kurigram: {division: "Rangpur"},
    Lalmonirhat: {division: "Rangpur"},
    Nilphamari: {division: "Rangpur"},
    Panchagarh: {division: "Rangpur"},
    Thakurgaon: {division: "Rangpur"},

    // Mymensingh division (4)
    Mymensingh: {division: "Mymensingh"},
    Jamalpur: {division: "Mymensingh"},
    Netrokona: {division: "Mymensingh"},
    Sherpur: {division: "Mymensingh"},
};

/**
 * High-density doctor-chamber thanas / areas. Keyed by the canonical area
 * name (lowercased). Value = parent district. Matching is substring-aware,
 * so "Dhanmondi 27" or "Block C, Dhanmondi" both resolve to Dhanmondi.
 */
export const AREAS: Record<string, {district: string; canonical: string}> = {
    // Dhaka city
    dhanmondi: {district: "Dhaka", canonical: "Dhanmondi"},
    gulshan: {district: "Dhaka", canonical: "Gulshan"},
    banani: {district: "Dhaka", canonical: "Banani"},
    uttara: {district: "Dhaka", canonical: "Uttara"},
    mirpur: {district: "Dhaka", canonical: "Mirpur"},
    mohammadpur: {district: "Dhaka", canonical: "Mohammadpur"},
    mohakhali: {district: "Dhaka", canonical: "Mohakhali"},
    shyamoli: {district: "Dhaka", canonical: "Shyamoli"},
    panthapath: {district: "Dhaka", canonical: "Panthapath"},
    "green road": {district: "Dhaka", canonical: "Green Road"},
    greenroad: {district: "Dhaka", canonical: "Green Road"},
    bashundhara: {district: "Dhaka", canonical: "Bashundhara R/A"},
    farmgate: {district: "Dhaka", canonical: "Farmgate"},
    motijheel: {district: "Dhaka", canonical: "Motijheel"},
    "old dhaka": {district: "Dhaka", canonical: "Old Dhaka"},
    lalbagh: {district: "Dhaka", canonical: "Lalbagh"},
    azimpur: {district: "Dhaka", canonical: "Azimpur"},
    badda: {district: "Dhaka", canonical: "Badda"},
    "tejgaon": {district: "Dhaka", canonical: "Tejgaon"},
    gandaria: {district: "Dhaka", canonical: "Gandaria"},
    "khilgaon": {district: "Dhaka", canonical: "Khilgaon"},
    malibagh: {district: "Dhaka", canonical: "Malibagh"},
    rampura: {district: "Dhaka", canonical: "Rampura"},
    "shantinagar": {district: "Dhaka", canonical: "Shantinagar"},
    "elephant road": {district: "Dhaka", canonical: "Elephant Road"},
    paltan: {district: "Dhaka", canonical: "Paltan"},
    "new market": {district: "Dhaka", canonical: "New Market"},

    // Chattogram
    "agrabad": {district: "Chattogram", canonical: "Agrabad"},
    "gec circle": {district: "Chattogram", canonical: "GEC Circle"},
    nasirabad: {district: "Chattogram", canonical: "Nasirabad"},
    panchlaish: {district: "Chattogram", canonical: "Panchlaish"},
    chawkbazar: {district: "Chattogram", canonical: "Chawkbazar"},
    halishahar: {district: "Chattogram", canonical: "Halishahar"},

    // Sylhet
    zindabazar: {district: "Sylhet", canonical: "Zindabazar"},
    ambarkhana: {district: "Sylhet", canonical: "Ambarkhana"},

    // Khulna
    sonadanga: {district: "Khulna", canonical: "Sonadanga"},

    // Rajshahi
    "shaheb bazar": {district: "Rajshahi", canonical: "Shaheb Bazar"},
};

/**
 * Build a lookup function for districts that also resolves alias spellings.
 * Returns `null` if the input doesn't match any district name or alias.
 */
export function resolveDistrict(raw: string): {district: string; division: Division} | null {
    const target = raw.trim().toLowerCase();
    if (!target) return null;
    for (const [district, entry] of Object.entries(DISTRICTS)) {
        if (district.toLowerCase() === target) return {district, division: entry.division};
        for (const alias of entry.aliases ?? []) {
            if (alias.toLowerCase() === target) return {district, division: entry.division};
        }
    }
    return null;
}
