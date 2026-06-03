// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendSms, estimateSegments } from "@/lib/sms/client";

describe("estimateSegments", () => {
  it("packs ASCII bodies at 160 chars per segment", () => {
    expect(estimateSegments("a".repeat(159), false)).toBe(1);
    expect(estimateSegments("a".repeat(161), false)).toBe(2);
    expect(estimateSegments("", false)).toBe(0);
  });

  it("packs Unicode bodies at 70 chars per segment", () => {
    expect(estimateSegments("ক".repeat(69), true)).toBe(1);
    expect(estimateSegments("ক".repeat(71), true)).toBe(2);
  });
});

describe("sendSms — dev no-op", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns sent:false when MDL creds aren't configured", async () => {
    // vitest.setup.ts boots with no MDL_* vars; env() returns undefined
    // for all three. We don't bother mocking env() — that IS the dev case.
    const r = await sendSms({ to: "+8801711000000", body: "Hello" });
    expect(r.sent).toBe(false);
    expect(r.segments).toBe(1);
  });

  it("detects Unicode and reports more segments", async () => {
    const r = await sendSms({ to: "+8801711000000", body: "ক".repeat(75) });
    expect(r.sent).toBe(false);
    expect(r.segments).toBe(2);
  });
});
