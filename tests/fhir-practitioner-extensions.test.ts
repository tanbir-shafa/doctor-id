import { describe, it, expect } from "vitest";
import { toFhirPractitioner } from "@/lib/fhir/practitioner";
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

describe("toFhirPractitioner — Loop A extensions", () => {
  it("emits designation + institute + yearsOfExperience as scalar extensions", () => {
    const fhir = toFhirPractitioner(
      makeDoc({
        designation: "Associate Professor of Cardiology",
        institute: "BSMMU",
        yearsOfExperience: 18,
      }),
    );

    expect(fhir.extension).toContainEqual({
      url: "https://doctor.id.bd/fhir/designation",
      valueString: "Associate Professor of Cardiology",
    });
    expect(fhir.extension).toContainEqual({
      url: "https://doctor.id.bd/fhir/institute",
      valueString: "BSMMU",
    });
    expect(fhir.extension).toContainEqual({
      url: "https://doctor.id.bd/fhir/yearsOfExperience",
      valueInteger: 18,
    });
  });

  it("omits Loop A extensions when fields are unset", () => {
    const fhir = toFhirPractitioner(makeDoc());
    const urls = fhir.extension.map((e) => e.url);
    expect(urls).not.toContain("https://doctor.id.bd/fhir/designation");
    expect(urls).not.toContain("https://doctor.id.bd/fhir/institute");
    expect(urls).not.toContain("https://doctor.id.bd/fhir/yearsOfExperience");
  });

  it("emits one nested extension per award with title/issuer/year sub-fields", () => {
    const fhir = toFhirPractitioner(
      makeDoc({
        awards: [
          { title: "Gold Medal", issuer: "DMC", year: 2010 },
          { title: "Best Teacher" },
        ],
      }),
    );
    const awards = fhir.extension.filter(
      (e) => e.url === "https://doctor.id.bd/fhir/award",
    );
    expect(awards).toHaveLength(2);
    expect(awards[0]!.extension).toContainEqual({ url: "title", valueString: "Gold Medal" });
    expect(awards[0]!.extension).toContainEqual({ url: "issuer", valueString: "DMC" });
    expect(awards[0]!.extension).toContainEqual({ url: "year", valueInteger: 2010 });
    // The second award has only a title — issuer/year are not present.
    expect(awards[1]!.extension).toHaveLength(1);
    expect(awards[1]!.extension![0]).toMatchObject({ url: "title", valueString: "Best Teacher" });
  });

  it("emits one nested extension per membership", () => {
    const fhir = toFhirPractitioner(
      makeDoc({
        memberships: [
          { body: "BMA", role: "Life Member", since: 2012 },
          { body: "BCPS" },
        ],
      }),
    );
    const memberships = fhir.extension.filter(
      (e) => e.url === "https://doctor.id.bd/fhir/membership",
    );
    expect(memberships).toHaveLength(2);
    expect(memberships[0]!.extension).toContainEqual({ url: "body", valueString: "BMA" });
    expect(memberships[0]!.extension).toContainEqual({ url: "role", valueString: "Life Member" });
    expect(memberships[0]!.extension).toContainEqual({ url: "since", valueInteger: 2012 });
  });

  it("emits one nested extension per publication with url under valueUrl", () => {
    const fhir = toFhirPractitioner(
      makeDoc({
        publications: [
          {
            title: "On the management of acute MI",
            journal: "BMJ",
            year: 2015,
            url: "https://example.com/pub/1",
          },
        ],
      }),
    );
    const pubs = fhir.extension.filter(
      (e) => e.url === "https://doctor.id.bd/fhir/publication",
    );
    expect(pubs).toHaveLength(1);
    expect(pubs[0]!.extension).toContainEqual({
      url: "url",
      valueUrl: "https://example.com/pub/1",
    });
    expect(pubs[0]!.extension).toContainEqual({ url: "title", valueString: "On the management of acute MI" });
    expect(pubs[0]!.extension).toContainEqual({ url: "journal", valueString: "BMJ" });
    expect(pubs[0]!.extension).toContainEqual({ url: "year", valueInteger: 2015 });
  });

  it("emits one scalar extension per concentration tag", () => {
    const fhir = toFhirPractitioner(
      makeDoc({ concentrations: ["Interventional Cardiology", "Structural Heart Disease"] }),
    );
    const concentrations = fhir.extension.filter(
      (e) => e.url === "https://doctor.id.bd/fhir/concentration",
    );
    expect(concentrations).toHaveLength(2);
    expect(concentrations.map((e) => e.valueString)).toEqual([
      "Interventional Cardiology",
      "Structural Heart Disease",
    ]);
  });
});
