import { describe, it, expect } from "vitest";
import { buildPhysicianJsonLd, buildChamberJsonLd, pruneJsonLd } from "@/lib/seo/jsonld";
import type { DoctorDocLike } from "@/types/doctor";

const baseDoc: DoctorDocLike = {
  ownerType: "doctor",
  ownerId: "u1",
  slug: "karim-rahman-cardiologist",
  bmdcNumber: "12345",
  bmdcVerified: true,
  nidVerified: false,
  verificationLevel: "bmdc_verified",
  name: { prefix: "Dr.", first: "Karim", last: "Rahman", displayName: "Karim Rahman" },
  photo: { url: "https://x/y.jpg", s3Key: "k" },
  languages: ["Bangla", "English"],
  specialties: [{ name: "Cardiology", isPrimary: true }],
  qualifications: [{ degree: "MBBS", institution: "DMC", year: 2010, country: "BD" }],
  experience: [],
  chambers: [
    {
      name: "Apollo",
      address: "100 Road",
      area: "Bashundhara",
      city: "Dhaka",
      division: "Dhaka",
      coordinates: { lat: 23.81, lng: 90.42 },
      phone: "+8801711000000",
      schedule: [{ day: "sat", startTime: "17:00", endTime: "21:00", available: true }],
      isPrimary: true,
    },
  ],
  registrations: [],
  contact: {},
  profileCompletenessScore: 0,
  profileViews: 0,
  isClaimed: true,
  status: "published",
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("Schema.org JSON-LD builders", () => {
  it("Physician graph carries BMDC propertyValue + specialty array", () => {
    const ld = buildPhysicianJsonLd(baseDoc) as Record<string, unknown>;
    expect(ld["@type"]).toBe("Physician");
    expect(ld["@id"]).toContain("/karim-rahman-cardiologist");
    expect(ld.medicalSpecialty).toEqual(["Cardiology"]);
    expect(ld.identifier).toMatchObject({ propertyID: "BMDC", value: "12345" });
  });

  it("Chamber graph emits MedicalBusiness with PostalAddress + OpeningHoursSpecification", () => {
    const [ld] = buildChamberJsonLd(baseDoc).map((x) => x as Record<string, unknown>);
    expect(ld!["@type"]).toBe("MedicalBusiness");
    expect((ld!.address as Record<string, unknown>).addressLocality).toBe("Bashundhara");
    expect(Array.isArray(ld!.openingHoursSpecification)).toBe(true);
  });

  it("pruneJsonLd strips undefined and empty arrays without mangling valid values", () => {
    const cleaned = pruneJsonLd({
      keep: "yes",
      drop: undefined,
      empty: [],
      arr: [1, 2],
      nested: { keep: "x", drop: undefined },
    });
    expect(cleaned).toEqual({ keep: "yes", arr: [1, 2], nested: { keep: "x" } });
  });
});
