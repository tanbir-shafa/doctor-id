import { describe, it, expect } from "vitest";
import { ChambersUpdateSchema, ChamberSchema } from "@/lib/validators/doctor";

const VALID_BASE = {
  name: "Test Chamber",
  address: "House 1, Road 1",
  area: "Dhanmondi",
  city: "Dhaka",
  division: "Dhaka",
  phone: "+8801711000000",
  consultationFee: { amount: 1000, currency: "BDT" as const },
  coordinates: { lat: 23.81, lng: 90.41 },
  schedule: [] as Array<{ day: string; startTime: string; endTime: string; available: boolean }>,
  isPrimary: false,
};

describe("ChamberSchema (single chamber)", () => {
  it("accepts a minimal valid chamber", () => {
    const r = ChamberSchema.safeParse({ ...VALID_BASE });
    expect(r.success).toBe(true);
  });

  it("rejects HH:mm formatting errors", () => {
    const r = ChamberSchema.safeParse({
      ...VALID_BASE,
      schedule: [{ day: "mon", startTime: "9 AM", endTime: "17:00", available: true }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects end before start", () => {
    const r = ChamberSchema.safeParse({
      ...VALID_BASE,
      schedule: [{ day: "mon", startTime: "18:00", endTime: "17:00", available: true }],
    });
    expect(r.success).toBe(false);
  });

  it("detects overlapping slots on the same day", () => {
    const r = ChamberSchema.safeParse({
      ...VALID_BASE,
      schedule: [
        { day: "mon", startTime: "10:00", endTime: "12:00", available: true },
        { day: "mon", startTime: "11:00", endTime: "13:00", available: true },
      ],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message.includes("overlap"))).toBe(true);
    }
  });

  it("allows non-overlapping slots on the same day", () => {
    const r = ChamberSchema.safeParse({
      ...VALID_BASE,
      schedule: [
        { day: "mon", startTime: "09:00", endTime: "12:00", available: true },
        { day: "mon", startTime: "14:00", endTime: "17:00", available: true },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("allows overlapping times on different days", () => {
    const r = ChamberSchema.safeParse({
      ...VALID_BASE,
      schedule: [
        { day: "mon", startTime: "10:00", endTime: "12:00", available: true },
        { day: "tue", startTime: "10:00", endTime: "12:00", available: true },
      ],
    });
    expect(r.success).toBe(true);
  });
});

describe("ChambersUpdateSchema (full list)", () => {
  it("accepts an empty list", () => {
    const r = ChambersUpdateSchema.safeParse({ chambers: [] });
    expect(r.success).toBe(true);
  });

  it("rejects more than 10 chambers", () => {
    const c = { ...VALID_BASE };
    const r = ChambersUpdateSchema.safeParse({ chambers: Array.from({ length: 11 }, () => c) });
    expect(r.success).toBe(false);
  });

  it("rejects two-primary attempts", () => {
    const r = ChambersUpdateSchema.safeParse({
      chambers: [
        { ...VALID_BASE, isPrimary: true },
        { ...VALID_BASE, isPrimary: true },
      ],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message.includes("primary"))).toBe(true);
    }
  });

  it("accepts zero or one primary", () => {
    const zeroR = ChambersUpdateSchema.safeParse({ chambers: [{ ...VALID_BASE }] });
    expect(zeroR.success).toBe(true);
    const oneR = ChambersUpdateSchema.safeParse({
      chambers: [{ ...VALID_BASE, isPrimary: true }],
    });
    expect(oneR.success).toBe(true);
  });
});
