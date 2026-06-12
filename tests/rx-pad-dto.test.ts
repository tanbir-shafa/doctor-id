import { describe, it, expect } from "vitest";
import { buildRxPadDto, formatSchedule, to12h } from "@/lib/rx-pad/dto";
import type { DoctorDocLike } from "@/types/doctor";

function fixture(overrides: Partial<DoctorDocLike & { slug: string }> = {}): DoctorDocLike & {
  slug: string;
} {
  return {
    slug: "dr-karim-rahman-cardiologist",
    bmdcNumber: "12345",
    bmdcVerified: true,
    nidVerified: false,
    verificationLevel: "bmdc_verified",
    name: { prefix: "Prof. Dr.", first: "Karim", last: "Rahman", displayName: "Prof. Dr. Karim Rahman" },
    photo: { url: "https://example.com/photo.jpg" } as never,
    bio: "Senior cardiologist",
    gender: "male",
    languages: ["Bangla", "English"],
    specialties: [{ name: "Cardiology", isPrimary: true, fhirCode: null } as never],
    subSpecialties: [],
    qualifications: [
      { degree: "MBBS", institution: "DMC", year: 2000, country: "Bangladesh" } as never,
      { degree: "FCPS", institution: "BCPS", year: 2008, country: "Bangladesh" } as never,
    ],
    experience: [],
    chambers: [
      {
        name: "Popular Diagnostic — Dhanmondi",
        address: "House 16, Road 2",
        area: "Dhanmondi",
        district: "Dhaka",
        division: "Dhaka",
        coordinates: { lat: null, lng: null },
        phone: "+8801711000000",
        schedule: [
          { day: "sat", startTime: "17:00", endTime: "21:00", available: true },
          { day: "sun", startTime: "17:00", endTime: "21:00", available: true },
          { day: "mon", startTime: "17:00", endTime: "21:00", available: true },
          { day: "tue", startTime: "17:00", endTime: "21:00", available: true },
          { day: "wed", startTime: "17:00", endTime: "21:00", available: true },
        ],
        consultationFee: { amount: 1500, currency: "BDT" },
        isPrimary: true,
      } as never,
    ],
    registrations: [],
    contact: { publicPhone: "+8801711000000", publicEmail: null, whatsapp: null, website: null } as never,
    socialLinks: {} as never,
    profileViews: 0,
    profileCompletenessScore: 0,
    isClaimed: true,
    status: "published",
    privacyHidePhone: false,
    privacyHideEmail: false,
    ...overrides,
  } as DoctorDocLike & { slug: string };
}

describe("to12h", () => {
  it("converts 24-hour times to 12-hour with AM/PM", () => {
    expect(to12h("00:30")).toBe("12:30 AM");
    expect(to12h("09:00")).toBe("9:00 AM");
    expect(to12h("12:00")).toBe("12:00 PM");
    expect(to12h("17:30")).toBe("5:30 PM");
    expect(to12h("23:59")).toBe("11:59 PM");
  });

  it("returns the raw input on parse failure", () => {
    expect(to12h("garbage")).toBe("garbage");
  });
});

describe("formatSchedule", () => {
  it("collapses consecutive days with identical times into a range", () => {
    const out = formatSchedule([
      { day: "sat", startTime: "17:00", endTime: "21:00", available: true },
      { day: "sun", startTime: "17:00", endTime: "21:00", available: true },
      { day: "mon", startTime: "17:00", endTime: "21:00", available: true },
    ]);
    expect(out).toBe("Sat–Mon 5:00 PM – 9:00 PM");
  });

  it("keeps non-consecutive days separated", () => {
    const out = formatSchedule([
      { day: "sat", startTime: "10:00", endTime: "12:00", available: true },
      { day: "mon", startTime: "10:00", endTime: "12:00", available: true },
    ]);
    expect(out).toBe("Sat 10:00 AM – 12:00 PM · Mon 10:00 AM – 12:00 PM");
  });

  it("falls back when there are no slots", () => {
    expect(formatSchedule([])).toBe("Schedule on profile");
  });

  it("ignores unavailable slots", () => {
    const out = formatSchedule([
      { day: "mon", startTime: "10:00", endTime: "12:00", available: false },
      { day: "tue", startTime: "10:00", endTime: "12:00", available: true },
    ]);
    expect(out).toBe("Tue 10:00 AM – 12:00 PM");
  });
});

describe("buildRxPadDto", () => {
  it("builds a complete DTO from a complete doctor", () => {
    const r = buildRxPadDto(fixture(), "https://daktar.link");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.displayName).toBe("Prof. Dr. Karim Rahman");
      expect(r.degrees).toBe("MBBS, FCPS");
      expect(r.bmdcNumber).toBe("12345");
      expect(r.photoUrl).toBe("https://example.com/photo.jpg");
      expect(r.primarySpecialty).toBe("Cardiology");
      expect(r.profileUrl).toBe("https://daktar.link/dr-karim-rahman-cardiologist");
      expect(r.chambers).toHaveLength(1);
      expect(r.chambers[0]?.schedule).toBe("Sat–Wed 5:00 PM – 9:00 PM");
      expect(r.chambers[0]?.consultationFee).toBe("1500 BDT");
    }
  });

  it("flags required fields when missing (no BMDC + no chamber)", () => {
    const r = buildRxPadDto(
      fixture({ bmdcNumber: null as never, chambers: [] }),
      "https://daktar.link",
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.missing).toContain("bmdc");
      expect(r.missing).toContain("chamber");
    }
  });

  it("succeeds when only recommended fields are missing (no photo)", () => {
    const r = buildRxPadDto(
      fixture({ photo: undefined as never }),
      "https://daktar.link",
    );
    expect(r.ok).toBe(true);
  });

  it("strips trailing slash from origin", () => {
    const r = buildRxPadDto(fixture(), "https://daktar.link/");
    if (r.ok) {
      expect(r.profileUrl).toBe("https://daktar.link/dr-karim-rahman-cardiologist");
    }
  });
});
