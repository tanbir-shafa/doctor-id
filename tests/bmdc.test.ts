import { describe, it, expect } from "vitest";
import { isValidBmdcFormat, normalizeBmdc } from "@/lib/utils/bmdc";

describe("BMDC validator", () => {
  it("accepts 5- and 6-digit numbers", () => {
    expect(isValidBmdcFormat("12345")).toBe(true);
    expect(isValidBmdcFormat("123456")).toBe(true);
  });

  it("accepts the dental A- prefix form", () => {
    expect(isValidBmdcFormat("A-12345")).toBe(true);
  });

  it("rejects letters, symbols, and out-of-range lengths", () => {
    expect(isValidBmdcFormat("abc12")).toBe(false);
    expect(isValidBmdcFormat("123")).toBe(false);
    expect(isValidBmdcFormat("12345678")).toBe(false);
    expect(isValidBmdcFormat(undefined)).toBe(false);
  });

  it("normalizes to upper-case trimmed form", () => {
    expect(normalizeBmdc(" a-12345 ")).toBe("A-12345");
    expect(normalizeBmdc("123456")).toBe("123456");
  });
});
