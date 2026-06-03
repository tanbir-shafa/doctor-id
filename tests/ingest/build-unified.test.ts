import { describe, it, expect } from "vitest";
import { sameDoctor, tierOf, foldCluster, connectedComponents } from "../../scripts/build-unified";
import type { NormalizedRecord } from "../../scripts/build-normalized";

type Conf = "high" | "medium" | "low" | "fallback";
function mk(o: {
  source?: "popular-diagnostic" | "ibn-sina";
  id?: string;
  phone?: string;
  gender?: "male" | "female";
  specs?: Array<[string, Conf]>;
  district?: string;
  bio?: string;
  chamberId?: string;
}): NormalizedRecord {
  const source = o.source ?? "popular-diagnostic";
  return {
    source,
    sourceId: o.id ?? "1",
    sourceUrl: "u",
    scrapedAt: "t",
    dedupKeys: { nameKey: "md karim", phone: o.phone },
    doctor: {
      name: { prefix: "Dr.", first: "Md", last: "Karim", displayName: "Dr. Md Karim" },
      gender: o.gender,
      bio: o.bio,
      specialties: (o.specs ?? []).map(([canonical, matchConfidence]) => ({
        canonical,
        fhirCode: null,
        sourceValue: canonical,
        sourceProvider: source,
        isPrimary: false,
        matchConfidence,
      })),
      sourceSpecialties: [],
      subSpecialties: [],
      chambers: o.district
        ? [{ chamberLocationId: o.chamberId ?? `${source}:1`, division: "X", district: o.district, area: "A", schedule: [], isPrimary: true }]
        : [],
    },
    raw: {},
    warnings: [],
  } as unknown as NormalizedRecord;
}

describe("sameDoctor (§3.2)", () => {
  it("rule 1 — known gender conflict never links", () => {
    expect(sameDoctor(mk({ gender: "male", specs: [["Cardiology", "high"]] }), mk({ gender: "female", specs: [["Cardiology", "high"]] }))).toBe(false);
  });
  it("rule 2 — equal phone links even with different specialties", () => {
    expect(sameDoctor(mk({ phone: "+8801", specs: [["Cardiology", "high"]] }), mk({ phone: "+8801", specs: [["Dermatology", "high"]] }))).toBe(true);
  });
  it("rule 3 intra — specialty intersect suffices (phone may differ)", () => {
    expect(sameDoctor(mk({ phone: "+8801", specs: [["Cardiology", "high"]] }), mk({ phone: "+8802", specs: [["Cardiology", "high"]] }))).toBe(true);
  });
  it("rule 3 cross — specialty intersect requires a shared district", () => {
    const pd = mk({ source: "popular-diagnostic", specs: [["Cardiology", "high"]], district: "Dhaka" });
    expect(sameDoctor(pd, mk({ source: "ibn-sina", specs: [["Cardiology", "high"]], district: "Dhaka" }))).toBe(true);
    expect(sameDoctor(pd, mk({ source: "ibn-sina", specs: [["Cardiology", "high"]], district: "Chittagong" }))).toBe(false);
  });
  it("rule 4 — no shared HIGH/MEDIUM specialty, no link; fallback never counts", () => {
    expect(sameDoctor(mk({ specs: [["Cardiology", "high"]], district: "Dhaka" }), mk({ source: "ibn-sina", specs: [["Dermatology", "high"]], district: "Dhaka" }))).toBe(false);
    expect(sameDoctor(mk({ specs: [["Other / Unspecified", "fallback"]], district: "Dhaka" }), mk({ source: "ibn-sina", specs: [["Other / Unspecified", "fallback"]], district: "Dhaka" }))).toBe(false);
  });
});

describe("tierOf (§3.3)", () => {
  it("SINGLE vs SEPARATE depends on name-group size", () => {
    expect(tierOf([mk({})], 1)).toBe("SINGLE");
    expect(tierOf([mk({})], 3)).toBe("SEPARATE");
  });
  it("intra phone → MERGE-HIGH; intra specialty-only → MERGE-MEDIUM", () => {
    expect(tierOf([mk({ phone: "+8801" }), mk({ id: "2", phone: "+8801" })], 2)).toBe("MERGE-HIGH");
    expect(tierOf([mk({ phone: "+8801" }), mk({ id: "2", phone: "+8802" })], 2)).toBe("MERGE-MEDIUM");
  });
  it("cross clean 1:1 → MERGE-HIGH; cross collision → REVIEW", () => {
    const pd = mk({ source: "popular-diagnostic" });
    const ibn = mk({ source: "ibn-sina", id: "9" });
    expect(tierOf([pd, ibn], 2)).toBe("MERGE-HIGH");
    expect(tierOf([pd, mk({ source: "popular-diagnostic", id: "2" }), ibn], 3)).toBe("REVIEW");
  });
});

describe("foldCluster (§3.4)", () => {
  it("unions chamber references by id and merges schedules for the same facility", () => {
    const a = mk({ district: "Dhaka", chamberId: "popular-diagnostic:1" });
    a.doctor.chambers[0].schedule = [{ day: "sat", startTime: "10:00", endTime: "12:00", available: true }];
    const b = mk({ id: "2", phone: undefined, district: "Dhaka", chamberId: "popular-diagnostic:1", specs: [["Cardiology", "high"]] });
    b.doctor.chambers[0].schedule = [{ day: "sun", startTime: "10:00", endTime: "12:00", available: true }];
    const ud = foldCluster([a, b], "MERGE-HIGH", "2026-01-01");
    expect(ud.canonical.chambers).toHaveLength(1); // same facility → one ref
    expect(ud.canonical.chambers[0].schedule).toHaveLength(2); // schedules merged

    const c = mk({ id: "3", chamberId: "ibn-sina:7", district: "Dhaka", source: "ibn-sina" });
    const ud2 = foldCluster([a, c], "MERGE-HIGH", "2026-01-01");
    expect(ud2.canonical.chambers).toHaveLength(2); // different facilities → two refs
  });

  it("is deterministic (order-independent unifiedId) and logs scalar conflicts", () => {
    const a = mk({ id: "1", bio: "short" });
    const b = mk({ id: "2", bio: "a much longer biography string", phone: "+8801" });
    a.dedupKeys.phone = "+8801";
    const u1 = foldCluster([a, b], "MERGE-HIGH", "2026-01-01");
    const u2 = foldCluster([b, a], "MERGE-HIGH", "2026-01-01");
    expect(u1.unifiedId).toBe(u2.unifiedId);
    expect(u1.canonical.bio).toBe("a much longer biography string"); // longest wins
    expect(u1.conflicts.some((c) => c.field === "bio")).toBe(true);
  });
});

describe("connectedComponents", () => {
  it("splits a name-group into distinct doctors", () => {
    // Two cardiologists share a phone; a third (dermatologist, other phone) is separate.
    const a = mk({ id: "1", phone: "+8801", specs: [["Cardiology", "high"]] });
    const b = mk({ id: "2", phone: "+8801", specs: [["Cardiology", "high"]] });
    const c = mk({ id: "3", phone: "+8802", specs: [["Dermatology", "high"]] });
    const comps = connectedComponents([a, b, c]);
    expect(comps).toHaveLength(2);
    expect(comps.find((g) => g.length === 2)).toBeDefined();
  });
});
