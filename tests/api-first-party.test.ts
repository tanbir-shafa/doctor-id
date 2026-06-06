// @vitest-environment node
import { describe, it, expect } from "vitest";
import { isFirstParty, corsHeaders } from "@/lib/api/response";

// vitest.setup.ts seeds NEXT_PUBLIC_APP_URL=http://localhost:3000, so that is
// the sole allowlisted origin in these tests.
const APP = "http://localhost:3000";

function h(headers: Record<string, string>): Headers {
  return new Headers(headers);
}

describe("isFirstParty — /api/v1 origin gate", () => {
  it("allows the app's own origin (Origin header)", () => {
    expect(isFirstParty(h({ origin: APP }))).toBe(true);
  });

  it("allows via Referer when Origin is absent", () => {
    expect(isFirstParty(h({ referer: `${APP}/search` }))).toBe(true);
  });

  it("rejects a foreign origin", () => {
    expect(isFirstParty(h({ origin: "https://evil.com" }))).toBe(false);
  });

  it("rejects a request with no Origin/Referer at all", () => {
    expect(isFirstParty(h({}))).toBe(false);
  });

  it("rejects a malformed Origin", () => {
    expect(isFirstParty(h({ origin: "not-a-url" }))).toBe(false);
  });
});

describe("corsHeaders — never wildcard", () => {
  it("echoes the allowlisted origin only", () => {
    const headers = corsHeaders(h({ origin: APP }));
    expect(headers["Access-Control-Allow-Origin"]).toBe(APP);
    expect(headers["Vary"]).toBe("Origin");
  });

  it("omits Access-Control-Allow-Origin for a foreign origin (no `*`)", () => {
    const headers = corsHeaders(h({ origin: "https://evil.com" }));
    expect(headers["Access-Control-Allow-Origin"]).toBeUndefined();
  });

  it("omits Access-Control-Allow-Origin when no origin is given", () => {
    const headers = corsHeaders();
    expect(headers["Access-Control-Allow-Origin"]).toBeUndefined();
  });
});
