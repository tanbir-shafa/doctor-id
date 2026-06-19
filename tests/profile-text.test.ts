import { describe, it, expect } from "vitest";
import {
  buildAutoMetaDescription,
  buildAutoProfileSummary,
  buildProfileFaq,
  buildSpecialtyNavLinks,
} from "@/lib/seo/profile-text";
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

describe("data-driven profile FAQ", () => {
  it("always answers specialty + verification, and weaves in real data", () => {
    const faq = buildProfileFaq(baseDoc);
    const questions = faq.map((f) => f.question);
    expect(questions.some((q) => /specialise/i.test(q))).toBe(true);
    expect(questions.some((q) => /verified/i.test(q))).toBe(true);

    const verification = faq.find((f) => /verified/i.test(f.question));
    expect(verification?.answer).toContain("BMDC");
    const location = faq.find((f) => /see patients/i.test(f.question));
    expect(location?.answer).toContain("Dhaka");
  });

  it("includes a fee question when a chamber has a consultation fee", () => {
    const withFee: DoctorDocLike = {
      ...baseDoc,
      chambers: [{ ...baseDoc.chambers[0]!, consultationFee: { amount: 800, currency: "BDT" } }],
    };
    const fee = buildProfileFaq(withFee).find((f) => /consultation fee/i.test(f.question));
    expect(fee?.answer).toContain("BDT 800");
  });

  it("sparse profile still yields specialty + verification + appointment", () => {
    const sparse: DoctorDocLike = {
      ...baseDoc,
      chambers: [],
      languages: [],
      qualifications: [],
      subSpecialties: [],
      concentrations: [],
    };
    expect(buildProfileFaq(sparse).length).toBeGreaterThanOrEqual(3);
  });
});

describe("buildSpecialtyNavLinks (neutral category links)", () => {
  const base = {
    specialtyName: "Cardiology",
    specialtySlug: "cardiology",
    districts: ["Dhaka", "Chittagong", "Sylhet", "Khulna"],
  };

  it("leads with the doctor's primary district and ends with the all-specialty hub", () => {
    const links = buildSpecialtyNavLinks({ ...base, primaryDistrict: "Dhaka" });
    expect(links[0]).toEqual({ label: "Cardiology doctors in Dhaka", href: "/cardiology/dhaka" });
    expect(links[links.length - 1]).toEqual({
      label: "All Cardiology doctors in Bangladesh",
      href: "/cardiology",
    });
    // No named-peer links — every href points to a category/hub page.
    expect(links.every((l) => l.href.startsWith("/cardiology"))).toBe(true);
  });

  it("dedupes the primary district out of the others list (case-insensitive)", () => {
    const links = buildSpecialtyNavLinks({ ...base, primaryDistrict: "dhaka" });
    expect(links.filter((l) => l.href === "/cardiology/dhaka")).toHaveLength(1);
  });

  it("caps the other-district links at maxOtherDistricts (default 3)", () => {
    const links = buildSpecialtyNavLinks({
      ...base,
      primaryDistrict: null,
      districts: ["Dhaka", "Chittagong", "Sylhet", "Khulna", "Rajshahi"],
    });
    expect(links).toHaveLength(4); // 3 districts + 1 hub
  });

  it("allows the primary district plus maxOtherDistricts others plus the hub", () => {
    const links = buildSpecialtyNavLinks({ ...base, primaryDistrict: "Barisal" });
    expect(links).toHaveLength(5); // Barisal + 3 others + hub
    expect(links[0]!.href).toBe("/cardiology/barisal");
  });

  it("lowercases + URL-encodes the district in the href but keeps canonical case in the label", () => {
    const links = buildSpecialtyNavLinks({
      ...base,
      primaryDistrict: "Cox's Bazar",
      districts: [],
    });
    expect(links[0]).toEqual({
      label: "Cardiology doctors in Cox's Bazar",
      href: `/cardiology/${encodeURIComponent("cox's bazar")}`,
    });
  });

  it("returns [] when there is no specialty slug", () => {
    expect(
      buildSpecialtyNavLinks({ ...base, specialtySlug: "", primaryDistrict: "Dhaka" }),
    ).toEqual([]);
  });

  it("returns just the hub link when there are no districts at all", () => {
    const links = buildSpecialtyNavLinks({ ...base, primaryDistrict: null, districts: [] });
    expect(links).toEqual([{ label: "All Cardiology doctors in Bangladesh", href: "/cardiology" }]);
  });
});
