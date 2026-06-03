import { describe, it, expect } from "vitest";
import {
  BD_DIVISIONS,
  BD_DISTRICTS,
  BD_DISTRICT_NAMES,
  canonicalizeDistrict,
  divisionForDistrict,
  isKnownDistrict,
  recoverDistrictFromFreeText,
} from "@/lib/geo/bd-districts";

describe("BD districts catalog", () => {
  it("has exactly 64 districts", () => {
    expect(BD_DISTRICTS).toHaveLength(64);
    expect(BD_DISTRICT_NAMES).toHaveLength(64);
  });

  it("has exactly 8 divisions", () => {
    expect(BD_DIVISIONS).toHaveLength(8);
  });

  it("every district's division is one of the 8 official divisions", () => {
    for (const d of BD_DISTRICTS) {
      expect(BD_DIVISIONS).toContain(d.division);
    }
  });

  it("district names are unique", () => {
    const names = BD_DISTRICTS.map((d) => d.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("divisionForDistrict resolves known districts", () => {
    expect(divisionForDistrict("Dhaka")).toBe("Dhaka");
    expect(divisionForDistrict("Chittagong")).toBe("Chattogram");
    expect(divisionForDistrict("Sylhet")).toBe("Sylhet");
    expect(divisionForDistrict("Bogra")).toBe("Rajshahi");
    expect(divisionForDistrict("Cox's Bazar")).toBe("Chattogram");
    expect(divisionForDistrict("Mymensingh")).toBe("Mymensingh");
  });

  it("divisionForDistrict returns null for unknown / empty / null", () => {
    expect(divisionForDistrict("Atlantis")).toBeNull();
    expect(divisionForDistrict("")).toBeNull();
    expect(divisionForDistrict(null)).toBeNull();
  });

  it("isKnownDistrict is exact + case-sensitive", () => {
    expect(isKnownDistrict("Dhaka")).toBe(true);
    expect(isKnownDistrict("dhaka")).toBe(false);
    expect(isKnownDistrict("Chittagong")).toBe(true);
    expect(isKnownDistrict("Chattogram")).toBe(false); // canonical is Chittagong
  });
});

describe("canonicalizeDistrict", () => {
  it("returns null for null / undefined / empty / whitespace", () => {
    expect(canonicalizeDistrict(null)).toBeNull();
    expect(canonicalizeDistrict(undefined)).toBeNull();
    expect(canonicalizeDistrict("")).toBeNull();
    expect(canonicalizeDistrict("   ")).toBeNull();
  });

  it("returns the canonical name for an already-canonical input (case-insensitive)", () => {
    expect(canonicalizeDistrict("Dhaka")).toBe("Dhaka");
    expect(canonicalizeDistrict("dhaka")).toBe("Dhaka");
    expect(canonicalizeDistrict("  CHITTAGONG  ")).toBe("Chittagong");
  });

  it("resolves the post-2018 official-rename aliases", () => {
    expect(canonicalizeDistrict("Chattogram")).toBe("Chittagong");
    expect(canonicalizeDistrict("Barishal")).toBe("Barisal");
    expect(canonicalizeDistrict("Bogura")).toBe("Bogra");
    expect(canonicalizeDistrict("Cumilla")).toBe("Comilla");
    expect(canonicalizeDistrict("Jashore")).toBe("Jessore");
  });

  it("resolves typos and spelling variants observed in the source data", () => {
    expect(canonicalizeDistrict("Mymenshing")).toBe("Mymensingh");
    expect(canonicalizeDistrict("Kustia")).toBe("Kushtia");
    expect(canonicalizeDistrict("Sirajgonj")).toBe("Sirajganj");
    expect(canonicalizeDistrict("Coxs Bazar")).toBe("Cox's Bazar");
    expect(canonicalizeDistrict("Cox's Bazar")).toBe("Cox's Bazar");
  });

  it("resolves Dhaka strings with trailing noise", () => {
    expect(canonicalizeDistrict("Dhaka 1205")).toBe("Dhaka");
    expect(canonicalizeDistrict("Dhaka with expertise in treating stroke")).toBe("Dhaka");
    expect(canonicalizeDistrict("Dhaka with qualifications including MBBS")).toBe("Dhaka");
    expect(canonicalizeDistrict("Dhata")).toBe("Dhaka");
    expect(canonicalizeDistrict("Bogra, Bangladesh")).toBe("Bogra");
  });

  it("maps Dhaka neighborhoods / upazilas to the parent district", () => {
    expect(canonicalizeDistrict("Savar")).toBe("Dhaka");
    expect(canonicalizeDistrict("Dhanmondi")).toBe("Dhaka");
    expect(canonicalizeDistrict("Uttara")).toBe("Dhaka");
    expect(canonicalizeDistrict("Mirpur")).toBe("Dhaka");
  });

  it("maps non-Dhaka upazilas to the parent district", () => {
    expect(canonicalizeDistrict("Ishwardi")).toBe("Pabna");
    expect(canonicalizeDistrict("Debidwar")).toBe("Comilla");
  });

  it("returns null for genuinely unknown values", () => {
    expect(canonicalizeDistrict("Atlantis")).toBeNull();
    expect(canonicalizeDistrict("xyz123")).toBeNull();
  });
});

/**
 * Covers every distinct city value observed in
 * data/unified/cities-distribution.json — the source of truth file we built
 * before authoring the alias table. If a new value appears in the data, add
 * an entry to BD_DISTRICT_ALIASES and a row here.
 */
describe("canonicalizeDistrict — exhaustive coverage of observed source values", () => {
  const observed: Array<[input: string, expected: string]> = [
    ["Dhaka", "Dhaka"],
    ["Chittagong", "Chittagong"],
    ["Rajshahi", "Rajshahi"],
    ["Sylhet", "Sylhet"],
    ["Bogra", "Bogra"],
    ["Comilla", "Comilla"],
    ["Mymensingh", "Mymensingh"],
    ["Khulna", "Khulna"],
    ["Chattogram", "Chittagong"],
    ["Narayanganj", "Narayanganj"],
    ["Rangpur", "Rangpur"],
    ["Barisal", "Barisal"],
    ["Pabna", "Pabna"],
    ["Barishal", "Barisal"],
    ["Kushtia", "Kushtia"],
    ["Dhaka 1205", "Dhaka"],
    ["Jessore", "Jessore"],
    ["Savar", "Dhaka"],
    ["Gazipur", "Gazipur"],
    ["Cox's Bazar", "Cox's Bazar"],
    ["Satkhira", "Satkhira"],
    ["Sirajganj", "Sirajganj"],
    ["Brahmanbaria", "Brahmanbaria"],
    ["Dinajpur", "Dinajpur"],
    ["Faridpur", "Faridpur"],
    ["Jashore", "Jessore"],
    ["Feni", "Feni"],
    ["Manikganj", "Manikganj"],
    ["Kishoreganj", "Kishoreganj"],
    ["Mymenshing", "Mymensingh"],
    ["Noakhali", "Noakhali"],
    ["Patuakhali", "Patuakhali"],
    ["Tangail", "Tangail"],
    ["Gopalganj", "Gopalganj"],
    ["Ishwardi", "Pabna"],
    ["Jamalpur", "Jamalpur"],
    ["Lakshmipur", "Lakshmipur"],
    ["Meherpur", "Meherpur"],
    ["Moulvibazar", "Moulvibazar"],
    ["Bagerhat", "Bagerhat"],
    ["Barguna", "Barguna"],
    ["Bogra, Bangladesh", "Bogra"],
    ["Bogura", "Bogra"],
    ["Chandpur", "Chandpur"],
    ["Chuadanga", "Chuadanga"],
    ["Coxs Bazar", "Cox's Bazar"],
    ["Debidwar", "Comilla"],
    ["Dhaka with expertise in treating stroke", "Dhaka"],
    ["Dhaka with qualifications including MBBS", "Dhaka"],
    ["Dhanmondi", "Dhaka"],
    ["Dhata", "Dhaka"],
    ["Gaibandha", "Gaibandha"],
    ["Habiganj", "Habiganj"],
    ["Jhenaidah", "Jhenaidah"],
    ["Kustia", "Kushtia"],
    ["Madaripur", "Madaripur"],
    ["Mirpur", "Dhaka"],
    ["Narail", "Narail"],
    ["Natore", "Natore"],
    ["Rajbari", "Rajbari"],
    ["Shariatpur", "Shariatpur"],
    ["Sirajgonj", "Sirajganj"],
    ["Thakurgaon", "Thakurgaon"],
    ["Uttara", "Dhaka"],
  ];

  it.each(observed)('"%s" → "%s"', (input, expected) => {
    expect(canonicalizeDistrict(input)).toBe(expected);
  });
});

describe("recoverDistrictFromFreeText", () => {
  it("returns null for empty / null input", () => {
    expect(recoverDistrictFromFreeText(null)).toBeNull();
    expect(recoverDistrictFromFreeText("")).toBeNull();
    expect(recoverDistrictFromFreeText("    ")).toBeNull();
  });

  it("finds a district mentioned in a chamber name or street", () => {
    expect(recoverDistrictFromFreeText("Popular Drug House, Habiganj Sadar")).toBe("Habiganj");
    expect(recoverDistrictFromFreeText("Chittagong Medical Centre")).toBe("Chittagong");
    expect(recoverDistrictFromFreeText("Hospital Road, Nabiganj, Habiganj, Bangladesh")).toBe(
      "Habiganj",
    );
  });

  it("uses aliases — Mirpur in a Dhaka chamber's street → Dhaka", () => {
    expect(recoverDistrictFromFreeText("Famous Dental, Mirpur 10")).toBe("Dhaka");
    expect(recoverDistrictFromFreeText("Savar EPZ Road")).toBe("Dhaka");
  });

  it("does not false-match a substring inside a longer word", () => {
    // "Dhakaria" must not match the token "Dhaka".
    expect(recoverDistrictFromFreeText("Dhakaria Lane")).toBeNull();
  });

  it("returns null when there's no recognizable district mention", () => {
    expect(recoverDistrictFromFreeText("Unknown")).toBeNull();
    expect(recoverDistrictFromFreeText("Telemedicine")).toBeNull();
  });
});
