import { describe, it, expect } from "vitest";
import { parseClientIp } from "@/lib/utils/request-ip";

function h(headers: Record<string, string>): Headers {
  return new Headers(headers);
}

describe("parseClientIp — trusted client IP resolution", () => {
  it("prefers X-Real-IP (nginx-set, hardest to spoof)", () => {
    const headers = h({
      "x-real-ip": "203.0.113.7",
      "x-forwarded-for": "1.2.3.4, 203.0.113.7",
    });
    expect(parseClientIp(headers, 1)).toBe("203.0.113.7");
  });

  it("ignores a spoofed left-most X-Forwarded-For hop", () => {
    // Attacker sent `X-Forwarded-For: 9.9.9.9`; nginx appended the real peer.
    const headers = h({ "x-forwarded-for": "9.9.9.9, 203.0.113.7" });
    expect(parseClientIp(headers, 1)).toBe("203.0.113.7");
  });

  it("takes the real client when no header is spoofed (single hop)", () => {
    const headers = h({ "x-forwarded-for": "203.0.113.7" });
    expect(parseClientIp(headers, 1)).toBe("203.0.113.7");
  });

  it("honors a larger trusted-proxy hop count (e.g. CDN → nginx → app)", () => {
    // client, cdn — real client is 2 from the right.
    const headers = h({ "x-forwarded-for": "203.0.113.7, 70.0.0.1" });
    expect(parseClientIp(headers, 2)).toBe("203.0.113.7");
  });

  it("never returns the attacker hop even with many forged entries", () => {
    const headers = h({ "x-forwarded-for": "1.1.1.1, 2.2.2.2, 3.3.3.3, 203.0.113.7" });
    expect(parseClientIp(headers, 1)).toBe("203.0.113.7");
  });

  it("falls back to 'unknown' when no IP headers are present", () => {
    expect(parseClientIp(h({}), 1)).toBe("unknown");
  });

  it("clamps to the left-most only when XFF is shorter than the hop count", () => {
    const headers = h({ "x-forwarded-for": "203.0.113.7" });
    expect(parseClientIp(headers, 5)).toBe("203.0.113.7");
  });
});
