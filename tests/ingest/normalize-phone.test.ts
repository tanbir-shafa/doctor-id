import {describe, it, expect} from "vitest";
import {normalizeBdPhone} from "../../scripts/lib/normalize/phone";

describe("normalizeBdPhone (ingest)", () => {
    it("canonicalizes the common BD national form 01XXXXXXXXX", () => {
        expect(normalizeBdPhone("01711563450")).toBe("+8801711563450");
    });

    it("accepts the +880 international form unchanged", () => {
        expect(normalizeBdPhone("+8801711563450")).toBe("+8801711563450");
    });

    it("accepts 880-prefixed form without +", () => {
        expect(normalizeBdPhone("8801711563450")).toBe("+8801711563450");
    });

    it("strips dashes, spaces, and parens", () => {
        expect(normalizeBdPhone("(+880) 1711-563-450")).toBe("+8801711563450");
        expect(normalizeBdPhone("017 1156 3450")).toBe("+8801711563450");
    });

    it("rejects invalid operator prefix (BD operators are 01[3-9])", () => {
        expect(normalizeBdPhone("01211563450")).toBeNull(); // 012 not valid
        expect(normalizeBdPhone("01011563450")).toBeNull();
    });

    it("rejects under-length / over-length numbers", () => {
        expect(normalizeBdPhone("0171156")).toBeNull();
        expect(normalizeBdPhone("01711563450123")).toBeNull();
    });

    it("returns null for non-string / empty / garbage input", () => {
        expect(normalizeBdPhone(null)).toBeNull();
        expect(normalizeBdPhone(undefined)).toBeNull();
        expect(normalizeBdPhone("")).toBeNull();
        expect(normalizeBdPhone("not a phone")).toBeNull();
    });
});
