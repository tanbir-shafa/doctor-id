import { describe, it, expect } from "vitest";
import { missingPublishRequirements, MANDATORY_PUBLISH_KEYS } from "@/lib/utils/completeness";
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

const PHOTO = { url: "https://cdn/p.jpg", s3Key: "k" };
const SPEC = { name: "Cardiology", isPrimary: true };
const QUAL = { degree: "MBBS", institution: "DMC", year: 2010, country: "Bangladesh" };

describe("missingPublishRequirements", () => {
  it("a fresh profile (name only) is missing photo + specialty + qualification", () => {
    const missing = missingPublishRequirements(makeDoc()).map((s) => s.key);
    expect(missing).toEqual(["photo", "specialties", "qualifications"]);
  });

  it("returns empty once all 4 mandatory items are present", () => {
    const doc = makeDoc({ photo: PHOTO, specialties: [SPEC], qualifications: [QUAL] });
    expect(missingPublishRequirements(doc)).toEqual([]);
  });

  it("flags only photo when it's the sole missing item", () => {
    const doc = makeDoc({ specialties: [SPEC], qualifications: [QUAL] });
    expect(missingPublishRequirements(doc).map((s) => s.key)).toEqual(["photo"]);
  });

  it("flags the name/title section when first/last/displayName are blank", () => {
    const doc = makeDoc({
      name: { prefix: "Dr.", first: "", last: "", displayName: "" },
      photo: PHOTO,
      specialties: [SPEC],
      qualifications: [QUAL],
    });
    expect(missingPublishRequirements(doc).map((s) => s.key)).toEqual(["basic"]);
  });

  it("only ever returns mandatory keys, each with a human label", () => {
    const sections = missingPublishRequirements(makeDoc());
    for (const s of sections) {
      expect(MANDATORY_PUBLISH_KEYS as readonly string[]).toContain(s.key);
      expect(typeof s.label).toBe("string");
      expect(s.label.length).toBeGreaterThan(0);
    }
  });
});
