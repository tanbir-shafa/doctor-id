import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  buildSpecialtyLookup,
  normalizePopularDoctor,
  parseClockTime,
  popularSourceUrl,
  type PopularDetail,
} from "@/../scripts/lib/providers/popular";

const FIXTURE_PATH = path.join(process.cwd(), "data", "popular-diagnostic", "details", "2094.json");

const LOOKUP = buildSpecialtyLookup([
  { name: "Cardiology", fhirCode: "394579002" },
  { name: "Pediatrics", fhirCode: "394537008" },
]);

describe("parseClockTime", () => {
  it("parses 'pm' suffix correctly", () => {
    expect(parseClockTime("2:00 pm")).toBe("14:00");
    expect(parseClockTime("12:30 PM")).toBe("12:30");
  });

  it("parses 'am' suffix correctly", () => {
    expect(parseClockTime("9:15 am")).toBe("09:15");
    expect(parseClockTime("12:00 AM")).toBe("00:00");
  });

  it("handles 24-hour input passthrough", () => {
    expect(parseClockTime("17:00")).toBe("17:00");
  });

  it("rejects garbage", () => {
    expect(parseClockTime("evening")).toBeNull();
    expect(parseClockTime(null)).toBeNull();
    expect(parseClockTime("25:00")).toBeNull();
  });
});

describe("normalizePopularDoctor with the real 2094 fixture", () => {
  it("produces a complete normalized record", async () => {
    const detail: PopularDetail = JSON.parse(await fs.readFile(FIXTURE_PATH, "utf8"));
    const r = normalizePopularDoctor(detail, 2094, LOOKUP);

    expect(r.id).toBe(2094);
    expect(r.parsedName?.prefix).toBe("Prof. Dr.");
    expect(r.parsedName?.last).toBe("Islam");
    expect(r.gender).toBe("male");
    expect(r.bio).toContain("NICVD");

    expect(r.contact.publicPhone).toBe("+8801711563450");

    // Specialty "Cardiology" should match the lookup; nothing falls to subSpecialties.
    expect(r.specialties.length).toBe(1);
    expect(r.specialties[0]?.name).toBe("Cardiology");
    expect(r.specialties[0]?.isPrimary).toBe(true);
    expect(r.subSpecialties).toHaveLength(0);

    // Branches → chambers; primary holds the schedule.
    expect(r.chambers).toHaveLength(1);
    expect(r.chambers[0]?.name).toBe("Popular Diagnostic — Dhanmondi");
    expect(r.chambers[0]?.isPrimary).toBe(true);
    expect(r.chambers[0]?.schedule.length).toBe(6); // Sun–Thu + Sat in the fixture
    for (const slot of r.chambers[0]!.schedule) {
      expect(slot.startTime).toBe("14:00");
      expect(slot.endTime).toBe("17:00");
    }

    expect(r.sourceUrl).toBe(popularSourceUrl(2094));
    expect(r.warnings).toEqual([]);
  });

  it("logs unmatched specialties as subSpecialties + warnings", () => {
    const detail: PopularDetail = {
      name: "Dr. Test Subject",
      mobile: "01711563450",
      email: null,
      image: null,
      degree: "MBBS",
      gender: "Male",
      specialists: [{ specialist_id: 999, specialist_name: "Astro-medicine" }],
      branches: [],
      schedule: [],
    };
    const r = normalizePopularDoctor(detail, 9999, LOOKUP);
    expect(r.specialties).toHaveLength(0);
    expect(r.subSpecialties).toEqual(["Astro-medicine"]);
    expect(r.warnings.some((w) => w.startsWith("specialty unmatched:"))).toBe(true);
  });

  it("flags malformed schedule slots without dropping the doctor", () => {
    const detail: PopularDetail = {
      name: "Dr. Bad Schedule",
      mobile: null,
      email: null,
      image: null,
      degree: "MBBS",
      gender: "Female",
      specialists: [],
      branches: [
        { branch_id: 1, name: "Test Branch", map: "Some address", phone: "01700000000" },
      ],
      schedule: [
        { day: "FunDay", start_time: "2:00 pm", end_time: "5:00 pm" } as any,
        { day: "Monday", start_time: "2:00 pm", end_time: "5:00 pm" },
      ],
    };
    const r = normalizePopularDoctor(detail, 9998, LOOKUP);
    expect(r.chambers[0]?.schedule.length).toBe(1);
    expect(r.warnings.some((w) => w.startsWith("schedule slot dropped:"))).toBe(true);
  });
});
