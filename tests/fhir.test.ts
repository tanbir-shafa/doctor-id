import { describe, it, expect } from "vitest";
import { toFhirPractitioner } from "@/lib/fhir/practitioner";
import type { DoctorDocLike } from "@/types/doctor";

const doctor: DoctorDocLike = {
  _id: "abc123",
  ownerType: "doctor",
  ownerId: "u1",
  slug: "karim-rahman-cardiologist",
  bmdcNumber: "12345",
  bmdcVerified: true,
  nidVerified: false,
  verificationLevel: "bmdc_verified",
  name: { prefix: "Dr.", first: "Karim", last: "Rahman", displayName: "Karim Rahman" },
  photo: { url: "https://i.example.com/p.jpg", s3Key: "k" },
  gender: "male",
  languages: ["Bangla", "English"],
  specialties: [{ name: "Cardiology", isPrimary: true, fhirCode: "394579002" }],
  qualifications: [{ degree: "MBBS", institution: "DMC", year: 2010, country: "Bangladesh" }],
  experience: [{ role: "Consultant", organization: "DMC", from: new Date("2018-01-01"), current: true }],
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
  contact: { publicPhone: "+8801711000000", publicEmail: "k@example.com", whatsapp: "+8801711000000" },
  privacyHidePhone: false,
  privacyHideEmail: false,
  profileCompletenessScore: 100,
  profileViews: 0,
  isClaimed: true,
  status: "published",
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("toFhirPractitioner", () => {
  it("emits Practitioner.identifier with BMDC + canonical slug", () => {
    const fhir = toFhirPractitioner(doctor);
    expect(fhir.resourceType).toBe("Practitioner");
    expect(fhir.identifier).toContainEqual({
      system: "urn:bd:bmdc",
      value: "12345",
      use: "official",
    });
    expect(fhir.identifier).toContainEqual({
      system: "https://doctor.id.bd",
      value: "karim-rahman-cardiologist",
      use: "official",
    });
  });

  it("includes WhatsApp under telecom with the `whatsapp:` URI prefix", () => {
    const fhir = toFhirPractitioner(doctor);
    expect(fhir.telecom).toContainEqual({
      system: "other",
      value: "whatsapp:+8801711000000",
      use: "work",
    });
  });

  it("redacts phone + WhatsApp when privacyHidePhone is true", () => {
    const fhir = toFhirPractitioner({ ...doctor, privacyHidePhone: true });
    expect(fhir.telecom.find((t) => t.system === "phone")).toBeUndefined();
    expect(fhir.telecom.find((t) => t.value.startsWith("whatsapp:"))).toBeUndefined();
    expect(fhir.telecom.find((t) => t.system === "email")).toBeDefined();
  });

  it("emits one PractitionerRole per chamber with SNOMED specialty coding", () => {
    const fhir = toFhirPractitioner(doctor);
    expect(fhir.roles).toHaveLength(1);
    expect(fhir.roles[0]!.specialty[0]!.coding[0]).toMatchObject({
      system: "http://snomed.info/sct",
      code: "394579002",
      display: "Cardiology",
    });
    expect(fhir.roles[0]!.location[0]!.address).toMatchObject({
      city: "Dhaka",
      country: "BD",
    });
    expect(fhir.roles[0]!.location[0]!.position).toEqual({ latitude: 23.81, longitude: 90.42 });
  });

  it("surfaces verification level on a custom extension", () => {
    const fhir = toFhirPractitioner(doctor);
    expect(fhir.extension).toContainEqual({
      url: "https://doctor.id.bd/fhir/verificationLevel",
      valueString: "bmdc_verified",
    });
  });
});
