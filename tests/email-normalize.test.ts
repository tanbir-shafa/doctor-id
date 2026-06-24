import { describe, it, expect } from "vitest";
import { normalizeEmail } from "@/lib/utils/email";

describe("normalizeEmail", () => {
  it("lowercases and trims a normal address", () => {
    expect(normalizeEmail("  Doctor@Example.COM ")).toBe("doctor@example.com");
  });

  it("accepts subdomains and plus-addressing", () => {
    expect(normalizeEmail("a.b+tag@mail.example.co")).toBe("a.b+tag@mail.example.co");
  });

  it("rejects malformed addresses", () => {
    for (const bad of ["", "foo", "a@", "@b.com", "a@b", "a b@c.com", "a@b .com", "a@@b.com"]) {
      expect(normalizeEmail(bad)).toBeNull();
    }
  });

  it("rejects non-string input", () => {
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
    expect(normalizeEmail(123)).toBeNull();
  });
});
