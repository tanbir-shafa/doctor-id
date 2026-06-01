import { describe, it, expect } from "vitest";
import { computeCompleteness } from "@/lib/utils/completeness";
import type { DoctorDocLike } from "@/types/doctor";

function makeDoc(overrides: Partial<DoctorDocLike> = {}): DoctorDocLike {
  return {
    ownerType: "doctor",
    ownerId: "u1",
    slug: "x",
    bmdcVerified: false,
    nidVerified: false,
    verificationLevel: "unverified",
    name: { prefix: "Dr.", first: "X", last: "Y", displayName: "X Y" },
    languages: [],
    specialties: [],
    qualifications: [],
    experience: [],
    chambers: [],
    registrations: [],
    contact: {},
    profileCompletenessScore: 0,
    profileViews: 0,
    isClaimed: false,
    status: "draft",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("computeCompleteness", () => {
  it("returns 10 for the basic-name section alone", () => {
    const { score, sections } = computeCompleteness(makeDoc());
    // Only `basic` is done (name fields are populated by makeDoc).
    expect(score).toBe(10);
    expect(sections.find((s) => s.key === "basic")?.done).toBe(true);
    expect(sections.find((s) => s.key === "photo")?.done).toBe(false);
  });

  it("scales linearly: adding a chamber adds the chamber weight", () => {
    const before = computeCompleteness(makeDoc()).score;
    const after = computeCompleteness(
      makeDoc({
        chambers: [
          {
            name: "x",
            address: "y",
            area: "a",
            city: "Dhaka",
            division: "Dhaka",
            schedule: [],
            isPrimary: true,
          },
        ],
      }),
    ).score;
    expect(after - before).toBe(15);
  });

  it("counts a fully-filled profile as 100", () => {
    const { score } = computeCompleteness(
      makeDoc({
        photo: { url: "u", s3Key: "k" },
        bio: "x".repeat(100),
        specialties: [{ name: "Cardiology", isPrimary: true }],
        qualifications: [{ degree: "MBBS", institution: "DMC", year: 2010, country: "BD" }],
        experience: [{ role: "Consultant", organization: "DMC", from: new Date(), current: true }],
        chambers: [
          { name: "x", address: "y", area: "a", city: "Dhaka", division: "Dhaka", schedule: [], isPrimary: true },
        ],
        contact: { publicPhone: "+8801" },
        bmdcNumber: "123456",
        languages: ["Bangla"],
        // Loop A block (designation/institute/awards/memberships/publications)
        // each contributes 3 points; together they make the profile reach 100.
        designation: "Associate Professor of Cardiology",
        institute: "BSMMU",
        awards: [{ title: "Gold Medal" }],
        memberships: [{ body: "BMA" }],
        publications: [{ title: "On the management of acute MI" }],
      }),
    );
    expect(score).toBe(100);
  });

  it("rewards each Loop A field independently (designation alone = +3)", () => {
    const baseline = computeCompleteness(makeDoc()).score; // 10 from basic
    const withDesignation = computeCompleteness(
      makeDoc({ designation: "Professor of Cardiology" }),
    ).score;
    expect(withDesignation - baseline).toBe(3);
  });
});
