import { describe, it, expect } from "vitest";
import { normalizeBdPhone } from "@/lib/utils/phone";

describe("normalizeBdPhone", () => {
  it("accepts the national 11-digit form", () => {
    expect(normalizeBdPhone("01711563450")).toBe("+8801711563450");
  });

  it("accepts E.164 already", () => {
    expect(normalizeBdPhone("+8801711563450")).toBe("+8801711563450");
  });

  it("accepts 880-prefixed without plus", () => {
    expect(normalizeBdPhone("8801711563450")).toBe("+8801711563450");
  });

  it("accepts the 10-digit core (no leading 0)", () => {
    expect(normalizeBdPhone("1711563450")).toBe("+8801711563450");
  });

  it("tolerates whitespace, dashes, and parens", () => {
    expect(normalizeBdPhone("017-1156-3450")).toBe("+8801711563450");
    expect(normalizeBdPhone("(+880) 1711-563450")).toBe("+8801711563450");
    expect(normalizeBdPhone("  01711 563 450  ")).toBe("+8801711563450");
  });

  it("rejects too-short and too-long numbers", () => {
    expect(normalizeBdPhone("0171156345")).toBeNull();
    expect(normalizeBdPhone("017115634500")).toBeNull();
  });

  it("rejects invalid operator prefixes", () => {
    expect(normalizeBdPhone("01211563450")).toBeNull(); // 012 isn't a BD operator
    expect(normalizeBdPhone("02711563450")).toBeNull();
  });

  it("rejects non-string and empty input", () => {
    expect(normalizeBdPhone(undefined)).toBeNull();
    expect(normalizeBdPhone(null)).toBeNull();
    expect(normalizeBdPhone("")).toBeNull();
    expect(normalizeBdPhone(1711563450)).toBeNull();
  });
});
