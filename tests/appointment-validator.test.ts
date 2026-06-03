import { describe, it, expect } from "vitest";
import { CreateAppointmentSchema, sanitizeReason } from "@/lib/validators/appointment";

function isoDay(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

const BASE = {
  slug: "dr-karim-rahman-cardiologist",
  chamberId: "65f1...",
  patientName: "Mizan Rahman",
  patientPhone: "01712345678",
  preferredDate: isoDay(3),
  preferredTimeWindow: "morning" as const,
  reason: "Recurring chest pain",
  website: "" as const,
};

describe("CreateAppointmentSchema", () => {
  it("accepts a valid request", () => {
    const r = CreateAppointmentSchema.safeParse(BASE);
    expect(r.success).toBe(true);
  });

  it("rejects an empty patient name", () => {
    expect(CreateAppointmentSchema.safeParse({ ...BASE, patientName: "" }).success).toBe(false);
  });

  it("rejects an empty chamber id", () => {
    expect(CreateAppointmentSchema.safeParse({ ...BASE, chamberId: "" }).success).toBe(false);
  });

  it("rejects a date in the past", () => {
    expect(
      CreateAppointmentSchema.safeParse({ ...BASE, preferredDate: isoDay(-1) }).success,
    ).toBe(false);
  });

  it("rejects a date more than 30 days away", () => {
    expect(
      CreateAppointmentSchema.safeParse({ ...BASE, preferredDate: isoDay(45) }).success,
    ).toBe(false);
  });

  it("accepts a date exactly 30 days away", () => {
    expect(
      CreateAppointmentSchema.safeParse({ ...BASE, preferredDate: isoDay(30) }).success,
    ).toBe(true);
  });

  it("rejects an out-of-range time window", () => {
    expect(
      CreateAppointmentSchema.safeParse({ ...BASE, preferredTimeWindow: "midnight" as never })
        .success,
    ).toBe(false);
  });

  it("caps the reason at 300 chars", () => {
    expect(
      CreateAppointmentSchema.safeParse({ ...BASE, reason: "x".repeat(301) }).success,
    ).toBe(false);
  });

  it("allows an empty reason", () => {
    expect(
      CreateAppointmentSchema.safeParse({ ...BASE, reason: "" }).success,
    ).toBe(true);
  });

  it("flags a filled honeypot as a custom 'website' issue", () => {
    const r = CreateAppointmentSchema.safeParse({ ...BASE, website: "https://spam.example" as never });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.path[0]).toBe("website");
    }
  });
});

describe("sanitizeReason", () => {
  it("returns null for empty input", () => {
    expect(sanitizeReason(null)).toBeNull();
    expect(sanitizeReason("")).toBeNull();
    expect(sanitizeReason("   ")).toBeNull();
  });

  it("strips HTML tags and collapses leftover whitespace", () => {
    expect(sanitizeReason("Has <script>alert(1)</script> chest pain")).toBe(
      "Has alert(1) chest pain",
    );
  });

  it("collapses whitespace runs", () => {
    expect(sanitizeReason("  multiple\t\tspaces\n\nhere  ")).toBe("multiple spaces here");
  });

  it("caps output at 300 characters", () => {
    const out = sanitizeReason("a".repeat(500));
    expect(out?.length).toBe(300);
  });
});
