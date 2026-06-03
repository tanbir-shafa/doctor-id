import {describe, it, expect} from "vitest";
import {parseBdAddress, resolveCity} from "../../scripts/lib/normalize/address";

describe("parseBdAddress", () => {
    it("resolves Dhaka-area chamber address with thana hit", () => {
        const r = parseBdAddress(
            "House # 67, Avenue # 5, Block # C, Section-6 Mirpur, Pallabi, Dhaka",
        );
        expect(r.area).toBe("Mirpur");
        expect(r.district).toBe("Dhaka");
        expect(r.division).toBe("Dhaka");
    });

    it("resolves Dhanmondi with house-number prefix noise", () => {
        const r = parseBdAddress("HOUSE # 16 Road Dhanmondi, Dhaka 1205");
        expect(r.area).toBe("Dhanmondi");
        expect(r.district).toBe("Dhaka");
    });

    it("resolves Gandaria from ibn-sina address shape", () => {
        const r = parseBdAddress("28, Doyagonj (Hut lane), Gandaria, Dhaka-1204");
        expect(r.area).toBe("Gandaria");
        expect(r.district).toBe("Dhaka");
    });

    it("resolves a Chattogram address via thana hit", () => {
        const r = parseBdAddress("Suite 5, Agrabad C/A, Chattogram-4100");
        expect(r.area).toBe("Agrabad");
        expect(r.district).toBe("Chattogram");
        expect(r.division).toBe("Chattogram");
    });

    it("falls back to district match when no thana matches", () => {
        const r = parseBdAddress("Mid Town Diagnostic Center, Pabna");
        expect(r.area).toBeNull();
        expect(r.district).toBe("Pabna");
        expect(r.division).toBe("Rajshahi");
    });

    it("resolves district aliases (Cumilla, Bogra, Jessore, Chittagong)", () => {
        expect(parseBdAddress("Some address, Cumilla").district).toBe("Comilla");
        expect(parseBdAddress("Hospital Rd, Bogra").district).toBe("Bogura");
        expect(parseBdAddress("Center, Jessore Sadar").district).toBe("Jashore");
        expect(parseBdAddress("Building 12, Chittagong").district).toBe("Chattogram");
    });

    it("returns nulls when nothing matches", () => {
        const r = parseBdAddress("Some random street address");
        expect(r.area).toBeNull();
        expect(r.district).toBeNull();
        expect(r.division).toBeNull();
        expect(r.raw).toBe("Some random street address");
    });

    it("handles empty / non-string input gracefully", () => {
        expect(parseBdAddress("").district).toBeNull();
        expect(parseBdAddress(null).district).toBeNull();
        expect(parseBdAddress(undefined).district).toBeNull();
    });

    it("prefers the most specific area when district name is also present", () => {
        // "Dhanmondi, Dhaka" — should pick Dhanmondi as area, not just Dhaka as district.
        const r = parseBdAddress("Dhanmondi, Dhaka");
        expect(r.area).toBe("Dhanmondi");
        expect(r.district).toBe("Dhaka");
    });
});

describe("resolveCity (fast path for structured city fields)", () => {
    it("resolves 'Chittagong' → Chattogram + division", () => {
        expect(resolveCity("Chittagong")).toEqual({district: "Chattogram", division: "Chattogram"});
    });

    it("resolves 'Dhaka' → Dhaka district", () => {
        expect(resolveCity("Dhaka")).toEqual({district: "Dhaka", division: "Dhaka"});
    });

    it("returns null for unknown city", () => {
        expect(resolveCity("Atlantis")).toBeNull();
        expect(resolveCity("")).toBeNull();
        expect(resolveCity(null)).toBeNull();
    });
});
