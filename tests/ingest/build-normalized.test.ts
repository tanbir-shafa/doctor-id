import { describe, it, expect } from "vitest";
import { toNormalizedRecord } from "../../scripts/build-normalized";
import type { CanonicalCandidate } from "../../scripts/lib/providers/types";

const candidate = {
  dedupKeys: { nameKey: "test doctor", phone: "+8801711000000" },
  fields: {
    name: { prefix: "Dr.", first: "Test", last: "Doctor", displayName: "Dr. Test Doctor" },
    gender: "male",
    chambers: [{ schedule: [{ day: "sat", startTime: "10:00", endTime: "12:00", available: true }] }],
    subSpecialties: [],
  },
  sourceMeta: {
    source: "popular-diagnostic",
    sourceId: "1",
    sourceUrl: "http://x",
    scrapedAt: "2026-01-01",
    confidence: "high",
  },
  warnings: [],
} as unknown as CanonicalCandidate;

// Two facilities in the catalog; location is what should be stamped onto refs.
const catalog = new Map<string, any>([
  ["popular-diagnostic:5", { id: "popular-diagnostic:5", provider: "popular-diagnostic", branchId: 5, division: "Dhaka", district: "Dhaka", area: "Dhanmondi", name: "PDC Dhanmondi", address: "addr", sourceCity: "Dhanmondi" }],
  ["ibn-sina:7", { id: "ibn-sina:7", provider: "ibn-sina", branchId: 7, division: "Khulna", district: "Jessore", area: "Jashore", name: "Ibn Sina Jashore", address: "addr", sourceCity: "Jashore" }],
]);

describe("toNormalizedRecord (Phase 0b)", () => {
  it("builds a chamber REFERENCE with location stamped from the catalog — facility data not embedded", () => {
    const { record, missingChamber } = toNormalizedRecord(
      candidate,
      { id: 1 },
      { provider: "popular-diagnostic", branchId: 5, specialtyStrings: ["Cardiology"] },
      catalog,
    );
    expect(missingChamber).toBeUndefined();
    expect(record.doctor.chambers).toHaveLength(1);
    const ch = record.doctor.chambers[0];
    expect(ch).toMatchObject({
      chamberLocationId: "popular-diagnostic:5",
      division: "Dhaka",
      district: "Dhaka",
      area: "Dhanmondi",
      isPrimary: true,
    });
    expect(ch.schedule).toHaveLength(1);
    expect(ch).not.toHaveProperty("name"); // display fields live in the Chamber collection, not on the doctor
    expect(ch).not.toHaveProperty("address");
  });

  it("preserves Ibn floor/room on the reference", () => {
    const { record } = toNormalizedRecord(
      candidate,
      {},
      { provider: "ibn-sina", branchId: 7, specialtyStrings: [], floor: "04", room: "514" },
      catalog,
    );
    expect(record.doctor.chambers[0]).toMatchObject({
      chamberLocationId: "ibn-sina:7",
      district: "Jessore",
      floor: "04",
      room: "514",
    });
  });

  it("flags a branch missing from the catalog (hard build error upstream), no chamber emitted", () => {
    const { record, missingChamber } = toNormalizedRecord(
      candidate,
      {},
      { provider: "popular-diagnostic", branchId: 999, specialtyStrings: [] },
      catalog,
    );
    expect(missingChamber).toBe("popular-diagnostic:999");
    expect(record.doctor.chambers).toHaveLength(0);
  });

  it("pairs specialties (canonical + verbatim sourceValue + confidence), first is primary, dedupes by source text", () => {
    const { record } = toNormalizedRecord(
      candidate,
      {},
      {
        provider: "popular-diagnostic",
        branchId: 5,
        specialtyStrings: ["Cardiology", "cardiology", "Gynae & Obs."],
      },
      catalog,
    );
    expect(record.doctor.specialties).toHaveLength(2); // "Cardiology"/"cardiology" deduped
    expect(record.doctor.specialties[0]).toMatchObject({
      canonical: "Cardiology",
      sourceValue: "Cardiology",
      isPrimary: true,
      matchConfidence: "high",
    });
    expect(record.doctor.specialties[1]).toMatchObject({
      canonical: "Obstetrics & Gynaecology",
      sourceValue: "Gynae & Obs.",
      isPrimary: false,
    });
    expect(record.doctor.sourceSpecialties).toEqual(["Cardiology", "Gynae & Obs."]);
  });

  it("carries dedupe keys and preserves the raw record verbatim", () => {
    const raw = { id: 1, marker: "verbatim" };
    const { record } = toNormalizedRecord(
      candidate,
      raw,
      { provider: "popular-diagnostic", branchId: 5, specialtyStrings: [] },
      catalog,
    );
    expect(record.dedupKeys.nameKey).toBe("test doctor");
    expect(record.raw).toBe(raw);
  });
});
