import { describe, it, expect } from "vitest";
import { CreateDoctorSchema } from "@/lib/validators/doctor";

describe("CreateDoctorSchema", () => {
  it("accepts a minimal payload (name only) and defaults the prefix to Dr.", () => {
    const r = CreateDoctorSchema.safeParse({ firstName: "Karim", lastName: "Rahman" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.prefix).toBe("Dr.");
      expect(r.data.firstName).toBe("Karim");
      expect(r.data.lastName).toBe("Rahman");
    }
  });

  it("accepts a full payload (prefix + specialty + BMDC)", () => {
    const r = CreateDoctorSchema.safeParse({
      prefix: "Prof. Dr.",
      firstName: "Aisha",
      lastName: "Khan",
      primarySpecialty: "Cardiology",
      bmdcNumber: "A-12345",
    });
    expect(r.success).toBe(true);
  });

  it("trims surrounding whitespace on names", () => {
    const r = CreateDoctorSchema.safeParse({ firstName: "  Karim  ", lastName: "  Rahman " });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.firstName).toBe("Karim");
      expect(r.data.lastName).toBe("Rahman");
    }
  });

  it("treats empty-string specialty and BMDC as allowed (optional)", () => {
    const r = CreateDoctorSchema.safeParse({
      firstName: "Karim",
      lastName: "Rahman",
      primarySpecialty: "",
      bmdcNumber: "",
    });
    expect(r.success).toBe(true);
  });

  it("rejects a missing first name", () => {
    expect(CreateDoctorSchema.safeParse({ lastName: "Rahman" }).success).toBe(false);
  });

  it("rejects a missing last name", () => {
    expect(CreateDoctorSchema.safeParse({ firstName: "Karim" }).success).toBe(false);
  });

  it("rejects a whitespace-only first name", () => {
    expect(
      CreateDoctorSchema.safeParse({ firstName: "   ", lastName: "Rahman" }).success,
    ).toBe(false);
  });

  it("rejects an unknown prefix", () => {
    expect(
      CreateDoctorSchema.safeParse({ prefix: "Mr.", firstName: "Karim", lastName: "Rahman" }).success,
    ).toBe(false);
  });

  it("rejects a first name longer than 80 chars", () => {
    expect(
      CreateDoctorSchema.safeParse({ firstName: "a".repeat(81), lastName: "Rahman" }).success,
    ).toBe(false);
  });
});
