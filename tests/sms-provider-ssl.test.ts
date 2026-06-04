// @vitest-environment node
import { describe, it, expect } from "vitest";
import { toMsisdn, makeCsmsId } from "@/lib/sms/providers/ssl";

describe("toMsisdn", () => {
  it("strips the E.164 '+' prefix", () => {
    expect(toMsisdn("+8801711563450")).toBe("8801711563450");
  });

  it("strips a '00' international prefix", () => {
    expect(toMsisdn("008801711563450")).toBe("8801711563450");
  });

  it("expands a bare national '01XXXXXXXXX' to 880…", () => {
    expect(toMsisdn("01711563450")).toBe("8801711563450");
  });

  it("passes through an already-bare 880 number", () => {
    expect(toMsisdn("8801711563450")).toBe("8801711563450");
  });

  it("drops stray formatting characters", () => {
    expect(toMsisdn(" +880 17115-63450 ")).toBe("8801711563450");
  });
});

describe("makeCsmsId", () => {
  it("never exceeds the 20-char SSL limit and is unique across calls", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const id = makeCsmsId();
      expect(id.length).toBeGreaterThan(0);
      expect(id.length).toBeLessThanOrEqual(20);
      seen.add(id);
    }
    // Random suffix makes collisions within a run vanishingly unlikely.
    expect(seen.size).toBe(1000);
  });
});
