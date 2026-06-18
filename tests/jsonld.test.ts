import { describe, it, expect } from "vitest";
import {
  buildPhysicianJsonLd,
  buildChamberJsonLd,
  buildOrganizationJsonLd,
  buildWebSiteJsonLd,
  buildBreadcrumbJsonLd,
  pruneJsonLd,
} from "@/lib/seo/jsonld";
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
      district: "Dhaka",
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

  it("Organization + WebSite expose @id, SearchAction, and a publisher link", () => {
    const org = buildOrganizationJsonLd();
    expect(org["@type"]).toBe("Organization");
    expect(String(org["@id"])).toContain("#organization");

    const site = buildWebSiteJsonLd();
    expect(site["@type"]).toBe("WebSite");
    const action = site.potentialAction as Record<string, unknown>;
    expect(action["@type"]).toBe("SearchAction");
    expect(String((action.target as Record<string, unknown>).urlTemplate)).toContain(
      "/search?q={search_term_string}",
    );
    expect((site.publisher as Record<string, unknown>)["@id"]).toBe(org["@id"]);
  });

  it("BreadcrumbList numbers ListItems from 1 in order", () => {
    const bc = buildBreadcrumbJsonLd([
      { name: "Home", url: "https://x/" },
      { name: "Cardiology doctors", url: "https://x/cardiology" },
      { name: "Dr. Karim Rahman", url: "https://x/karim-rahman-cardiologist" },
    ]);
    expect(bc["@type"]).toBe("BreadcrumbList");
    const items = bc.itemListElement as Record<string, unknown>[];
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ position: 1, name: "Home" });
    expect(items[2]).toMatchObject({ position: 3, item: "https://x/karim-rahman-cardiologist" });
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
