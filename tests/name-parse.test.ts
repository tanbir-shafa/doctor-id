import { describe, it, expect } from "vitest";
import { parseDoctorName } from "@/lib/utils/name-parser";

describe("parseDoctorName", () => {
  it("handles a plain 'Dr.' prefix", () => {
    const r = parseDoctorName("Dr. Karim Rahman");
    expect(r).toEqual({
      prefix: "Dr.",
      first: "Karim",
      last: "Rahman",
      displayName: "Dr. Karim Rahman",
    });
  });

  it("handles 'Prof. Dr.' with middle initial", () => {
    const r = parseDoctorName("Prof. Dr. M. Nazrul Islam");
    expect(r?.prefix).toBe("Prof. Dr.");
    expect(r?.first).toBe("M. Nazrul");
    expect(r?.last).toBe("Islam");
    expect(r?.displayName).toBe("Prof. Dr. M. Nazrul Islam");
  });

  it("handles 'Asst. Prof. Dr.'", () => {
    expect(parseDoctorName("Asst. Prof. Dr. Sadia Akter")?.prefix).toBe("Asst. Prof. Dr.");
    expect(parseDoctorName("Assistant Professor Dr. Sadia Akter")?.prefix).toBe("Asst. Prof. Dr.");
  });

  it("handles 'Assoc. Prof. Dr.'", () => {
    expect(parseDoctorName("Assoc. Prof. Dr. Tania Hossain")?.prefix).toBe("Assoc. Prof. Dr.");
    expect(parseDoctorName("Associate Prof. Dr. Tania Hossain")?.prefix).toBe("Assoc. Prof. Dr.");
  });

  it("strips military prefixes and falls back to Dr.", () => {
    expect(parseDoctorName("Brig. Gen. (Retd.) Dr. Anwarul Haque")?.prefix).toBe("Dr.");
    expect(parseDoctorName("Major (Retd.) Dr. Saleh Ahmed")?.prefix).toBe("Dr.");
    expect(parseDoctorName("Lt. Col. (Retd.) Dr. Hossain Ali")?.prefix).toBe("Dr.");
  });

  it("strips military prefixes BEFORE a Prof prefix", () => {
    expect(parseDoctorName("Brig. Gen. (Retd.) Prof. Dr. Anwarul Haque")?.prefix).toBe("Prof. Dr.");
  });

  it("handles single-token name by duplicating into first and last", () => {
    // The Doctor schema requires both first and last; a mononym fills both
    // so validation passes. displayName still renders as "Dr. Mahbub".
    const r = parseDoctorName("Dr. Mahbub");
    expect(r?.first).toBe("Mahbub");
    expect(r?.last).toBe("Mahbub");
    expect(r?.displayName).toBe("Dr. Mahbub");
  });

  it("handles dotted prefixes with no space", () => {
    const r = parseDoctorName("Dr.M.A.Sayem");
    expect(r?.prefix).toBe("Dr.");
    expect(r?.first).toBe("M. A.");
    expect(r?.last).toBe("Sayem");
  });

  it("rejects empty / non-string", () => {
    expect(parseDoctorName("")).toBeNull();
    expect(parseDoctorName("   ")).toBeNull();
    expect(parseDoctorName(undefined)).toBeNull();
  });

  it("collapses extra whitespace", () => {
    const r = parseDoctorName("  Dr.   Karim    Rahman  ");
    expect(r?.first).toBe("Karim");
    expect(r?.last).toBe("Rahman");
  });
});
