import { describe, it, expect } from "vitest";
import { BD_DIVISIONS, BD_DISTRICTS } from "@/lib/geo/bd-districts";
import {
  BD_DIVISION_BN,
  BD_DISTRICT_BN,
  divisionBn,
  districtBn,
  specialtyBn,
} from "@/lib/geo/bn-glossary";

describe("Bangla glossary", () => {
  it("covers every one of the 8 divisions", () => {
    for (const d of BD_DIVISIONS) {
      expect(BD_DIVISION_BN[d], `missing Bangla for division ${d}`).toBeTruthy();
    }
    expect(Object.keys(BD_DIVISION_BN)).toHaveLength(8);
  });

  it("covers every one of the 64 districts", () => {
    for (const d of BD_DISTRICTS) {
      expect(BD_DISTRICT_BN[d.name], `missing Bangla for district ${d.name}`).toBeTruthy();
    }
    expect(Object.keys(BD_DISTRICT_BN)).toHaveLength(64);
  });

  it("applies the two reviewer corrections (standard spellings)", () => {
    expect(districtBn("Netrokona")).toBe("নেত্রকোনা");
    expect(districtBn("Rangamati")).toBe("রাঙামাটি");
  });

  it("looks up case-insensitively and returns null for unknowns", () => {
    expect(districtBn("dhaka")).toBe("ঢাকা");
    expect(divisionBn("SYLHET")).toBe("সিলেট");
    expect(specialtyBn("Cardiology")).toBe("হৃদরোগ বিশেষজ্ঞ");
    expect(districtBn("Atlantis")).toBeNull();
    expect(districtBn(null)).toBeNull();
    expect(specialtyBn(undefined)).toBeNull();
  });
});
