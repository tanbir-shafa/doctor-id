import { describe, it, expect } from "vitest";
import { buildAutoMetaDescription, buildAutoProfileSummary } from "@/lib/seo/profile-text";
import type { DoctorDocLike } from "@/types/doctor";

const baseDoc: DoctorDocLike = {
  ownerType: "doctor",
  ownerId: "u1",
  slug: "karim-rahman-cardiologist",
  bmdcVerified: true,
  nidVerified: false,
  verificationLevel: "bmdc_verified",
  name: { prefix: "Dr.", first: "Karim", last: "Rahman", displayName: "Dr. Karim Rahman" },
  languages: ["Bangla", "English"],
  specialties: [{ name: "Cardiology", isPrimary: true }],
  qualifications: [
    { degree: "MBBS", institution: "Dhaka Medical College", year: 2008, country: "BD" },
    { degree: "FCPS (Cardiology)", institution: "BCPS", year: 2014, country: "BD" },
  ],
  experience: [],
  yearsOfExperience: 12,
  chambers: [
    { name: "Apollo", address: "100 Road", area: "Bashundhara", district: "Dhaka", division: "Dhaka", schedule: [], isPrimary: true },
  ],
  registrations: [],
  contact: {},
  profileCompletenessScore: 0,
  profileViews: 0,
  isClaimed: false,
  status: "published",
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("auto-generated profile copy", () => {
  it("meta description stays ≤160 chars and weaves in specialty + district", () => {
    const d = buildAutoMetaDescription(baseDoc);
    expect(d.length).toBeLessThanOrEqual(160);
    expect(d).toContain("Cardiology");
    expect(d).toContain("Dhaka");
    expect(d).toContain("12+ years");
  });

  it("summary is unique per doctor and includes qualifications + chambers + languages", () => {
    const s = buildAutoProfileSummary(baseDoc);
    expect(s).toContain("Dr. Karim Rahman");
    expect(s).toContain("MBBS");
    expect(s).toContain("Dhaka Medical College");
    expect(s).toContain("chamber");
    expect(s).toContain("Bangla");

    const other = buildAutoProfileSummary({
      ...baseDoc,
      name: { ...baseDoc.name, displayName: "Dr. Other Person" },
      specialties: [{ name: "Dermatology", isPrimary: true }],
    });
    expect(other).not.toEqual(s);
    expect(other).toContain("Dermatology");
  });

  it("handles a sparse profile (no quals/chambers/languages) without throwing", () => {
    const sparse: DoctorDocLike = {
      ...baseDoc,
      qualifications: [],
      chambers: [],
      languages: [],
      yearsOfExperience: undefined,
      subSpecialties: [],
      concentrations: [],
    };
    const summary = buildAutoProfileSummary(sparse);
    expect(summary).toContain("Cardiology");
    expect(summary.length).toBeGreaterThan(0);

    const meta = buildAutoMetaDescription(sparse);
    expect(meta).toContain("Daktar.Link");
    expect(meta.length).toBeLessThanOrEqual(160);
  });
});
