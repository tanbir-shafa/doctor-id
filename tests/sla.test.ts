import { describe, it, expect } from "vitest";
import { classifySla, formatDuration } from "@/lib/db/queries/admin";

const HOUR = 60 * 60 * 1000;
const now = new Date("2026-05-29T12:00:00Z");

function expiresIn(ms: number): string {
  return new Date(now.getTime() + ms).toISOString();
}

describe("formatDuration", () => {
  it("renders minutes when under an hour", () => {
    expect(formatDuration(45 * 60 * 1000)).toBe("45m");
  });

  it("renders whole hours", () => {
    expect(formatDuration(3 * HOUR)).toBe("3h");
  });

  it("renders hours + minutes", () => {
    expect(formatDuration(3 * HOUR + 12 * 60 * 1000)).toBe("3h 12m");
  });

  it("clamps negative input to zero", () => {
    expect(formatDuration(-1000)).toBe("0m");
  });
});

describe("classifySla", () => {
  it("returns approved/green when status is approved", () => {
    const r = classifySla({ status: "approved", slaExpiresAt: expiresIn(2 * HOUR) }, now);
    expect(r.bucket).toBe("approved");
    expect(r.tone).toBe("green");
    expect(r.label).toBe("Verified");
  });

  it("returns rejected/red when status is rejected", () => {
    const r = classifySla({ status: "rejected", slaExpiresAt: expiresIn(2 * HOUR) }, now);
    expect(r.bucket).toBe("rejected");
    expect(r.tone).toBe("red");
  });

  it("classifies >12h as green", () => {
    const r = classifySla({ status: "pending", slaExpiresAt: expiresIn(20 * HOUR) }, now);
    expect(r.bucket).toBe("gt12h");
    expect(r.tone).toBe("green");
    expect(r.label).toBe("20h left");
  });

  it("classifies 6–12h as amber", () => {
    const r = classifySla({ status: "pending", slaExpiresAt: expiresIn(8 * HOUR) }, now);
    expect(r.bucket).toBe("lt12h");
    expect(r.tone).toBe("amber");
  });

  it("classifies <6h as red", () => {
    const r = classifySla({ status: "pending", slaExpiresAt: expiresIn(2 * HOUR) }, now);
    expect(r.bucket).toBe("lt6h");
    expect(r.tone).toBe("red");
    expect(r.label).toBe("2h left");
  });

  it("classifies breach (past expiry) as red", () => {
    const r = classifySla({ status: "pending", slaExpiresAt: expiresIn(-3 * HOUR) }, now);
    expect(r.bucket).toBe("breached");
    expect(r.tone).toBe("red");
    expect(r.label).toContain("Breached");
    expect(r.label).toContain("3h");
  });

  it("treats legacy rows (no slaExpiresAt) as pending/green", () => {
    const r = classifySla({ status: "pending", slaExpiresAt: null }, now);
    expect(r.bucket).toBe("gt12h");
    expect(r.tone).toBe("green");
    expect(r.label).toBe("Pending");
  });
});
