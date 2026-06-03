import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildChamberCatalog } from "../scripts/build-chamber-catalog";
import { BD_DISTRICT_NAMES, BD_DIVISIONS } from "@/lib/geo/bd-districts";

// Minimal source-shaped fixtures (not the full dumps) so the logic is exercised
// fast and deterministically.
const pd = [
  {
    branches: [{ branch_id: 1, branch: { id: 1, name: "Dhanmondi" } }],
    detail: { branches: [{ branch_id: 1, name: "DHANMONDI", map: "House 16, Dhanmondi, Dhaka-1205", phone: "09666" }] },
  },
  {
    branches: [{ branch_id: 13, branch: { id: 13, name: "Bogura" } }],
    // address mentions Sherpur (a *different* district) — must NOT win over the locality.
    detail: { branches: [{ branch_id: 13, name: "BOGURA", map: "Sherpur Road, Bogura", phone: "051" }] },
  },
  // Second doctor at the same Dhanmondi branch → must dedupe to one row.
  {
    branches: [{ branch_id: 1, branch: { id: 1, name: "Dhanmondi" } }],
    detail: { branches: [{ branch_id: 1, name: "DHANMONDI", map: "House 16, Dhanmondi, Dhaka-1205" }] },
  },
];
const ibn = [
  { branches: [{ branch_id: 14, name: "Ibn Sina Diagnostic & Consultation Center, Bogura", map: "Sherpur Road, Bogura" }] },
  { branches: [{ branch_id: 10, name: "Ibn Sina Hospital & Diagnostic Center, Jashore. We are ISO 9001-2015 Certified.", map: "Jashore Town" }] },
];

describe("buildChamberCatalog", () => {
  const { rows, errors } = buildChamberCatalog(pd, ibn);
  const byId = (id: string) => rows.find((r) => r.id === id)!;

  it("resolves every facility with no errors", () => {
    expect(errors).toHaveLength(0);
  });

  it("dedupes by provider:branchId (first occurrence wins)", () => {
    expect(rows).toHaveLength(4); // pd:1, pd:13, ibn:14, ibn:10
    expect(rows.filter((r) => r.id === "popular-diagnostic:1")).toHaveLength(1);
  });

  it("resolves the branch locality over an incidental district in the address (Bogura → Bogra, not Sherpur)", () => {
    expect(byId("popular-diagnostic:13").district).toBe("Bogra");
    expect(byId("ibn-sina:14").district).toBe("Bogra");
  });

  it("cleans Ibn marketing tails when deriving the area (Jashore → Jessore / 'Jashore')", () => {
    expect(byId("ibn-sina:10").district).toBe("Jessore");
    expect(byId("ibn-sina:10").area).toBe("Jashore");
  });

  it("prefixes + title-cases Popular branch names; keeps Ibn names verbatim", () => {
    expect(byId("popular-diagnostic:1").name).toBe("Popular Diagnostic Centre Ltd. Dhanmondi");
    expect(byId("popular-diagnostic:1").area).toBe("Dhanmondi");
    expect(byId("ibn-sina:14").name).toBe("Ibn Sina Diagnostic & Consultation Center, Bogura");
  });

  it("derives division from the resolved district", () => {
    expect(byId("popular-diagnostic:13").division).toBe("Rajshahi"); // Bogra is in Rajshahi
    expect(byId("ibn-sina:10").division).toBe("Khulna"); // Jessore is in Khulna
  });
});

describe("committed data/chambers/chamber-locations.json", () => {
  const rows = JSON.parse(
    readFileSync(join(process.cwd(), "data/chambers/chamber-locations.json"), "utf8"),
  ) as Array<Record<string, string | number>>;
  const districts = new Set<string>(BD_DISTRICT_NAMES);
  const divisions = new Set<string>(BD_DIVISIONS);

  it("has 47 facilities with unique ids", () => {
    expect(rows).toHaveLength(47);
    expect(new Set(rows.map((r) => r.id)).size).toBe(47);
  });

  it("every row has a canonical 64-district, a valid division, a non-empty area, and a well-formed id", () => {
    for (const r of rows) {
      expect(districts.has(r.district as string), `${r.id}: bad district ${r.district}`).toBe(true);
      expect(divisions.has(r.division as string), `${r.id}: bad division ${r.division}`).toBe(true);
      expect(String(r.area).length, `${r.id}: empty area`).toBeGreaterThan(0);
      expect(r.id).toBe(`${r.provider}:${r.branchId}`);
    }
  });
});
