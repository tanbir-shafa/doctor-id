import {describe, it, expect} from "vitest";
import {parseDoctorName, normalizeNameForMatch} from "../../scripts/lib/normalize/name";

describe("parseDoctorName (re-export sanity)", () => {
    it("parses Prof. Dr. prefix correctly", () => {
        const parsed = parseDoctorName("Prof. Dr. Abdul Wadud Chowdhury");
        expect(parsed).not.toBeNull();
        expect(parsed!.prefix).toBe("Prof. Dr.");
        expect(parsed!.last).toBe("Chowdhury");
        expect(parsed!.displayName).toBe("Prof. Dr. Abdul Wadud Chowdhury");
    });

    it("parses Dr. M. S. Newaz with middle initials", () => {
        const parsed = parseDoctorName("Dr. M. S. Newaz");
        expect(parsed!.prefix).toBe("Dr.");
        expect(parsed!.first).toBe("M. S.");
        expect(parsed!.last).toBe("Newaz");
    });
});

describe("normalizeNameForMatch", () => {
    it("strips prefixes and lowercases", () => {
        expect(normalizeNameForMatch("Prof. Dr. Karim Rahman")).toBe("karim rahman");
        expect(normalizeNameForMatch("Dr. Karim Rahman")).toBe("karim rahman");
        expect(normalizeNameForMatch("Assoc. Prof. Dr. Karim Rahman")).toBe("karim rahman");
        expect(normalizeNameForMatch("Asst. Prof. Dr. Karim Rahman")).toBe("karim rahman");
    });

    it("collapses Md / Mohammad / Mohammed / Muhammad to a single key", () => {
        expect(normalizeNameForMatch("Dr. Mohammad Karim Rahman")).toBe("md karim rahman");
        expect(normalizeNameForMatch("Dr. Md. Karim Rahman")).toBe("md karim rahman");
        expect(normalizeNameForMatch("MD. KARIM RAHMAN")).toBe("md karim rahman");
        expect(normalizeNameForMatch("Dr. Muhammad Karim Rahman")).toBe("md karim rahman");
        expect(normalizeNameForMatch("Dr. M Karim Rahman")).toBe("md karim rahman");
    });

    it("dedupes consecutive 'md md' (e.g. 'Mohammad Md. Karim')", () => {
        expect(normalizeNameForMatch("Mohammad Md. Karim Rahman")).toBe("md karim rahman");
    });

    it("removes punctuation while preserving word boundaries", () => {
        expect(normalizeNameForMatch("Dr.A.B.M. Karim")).toBe("a b md karim");
    });

    it("returns null for empty / non-string input", () => {
        expect(normalizeNameForMatch("")).toBeNull();
        expect(normalizeNameForMatch(null)).toBeNull();
        expect(normalizeNameForMatch(undefined)).toBeNull();
        expect(normalizeNameForMatch(123)).toBeNull();
    });

    it("handles single-token names", () => {
        expect(normalizeNameForMatch("Dr. Karim")).toBe("karim");
    });
});
