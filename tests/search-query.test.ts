import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Mongo connection so the test runs without a DB.
vi.mock("@/lib/db/mongoose", () => ({ dbConnect: vi.fn(async () => {}) }));

// We spy on the Doctor model's query methods to capture what filter is built.
const findChain = {
  find: vi.fn(),
  sort: vi.fn().mockReturnThis(),
  skip: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  lean: vi.fn(async () => []),
};
const doctorMock = {
  find: vi.fn((filter, projection) => {
    findChain.find.mockReturnValueOnce(filter);
    void projection;
    return findChain;
  }),
  countDocuments: vi.fn(async () => 0),
  distinct: vi.fn(async () => []),
};

vi.mock("@/lib/db/models", () => ({
  Doctor: doctorMock,
}));

// Import AFTER mocks so the module uses them.
const { searchDoctors } = await import("@/lib/db/queries/doctors");

describe("searchDoctors filter construction", () => {
  beforeEach(() => {
    findChain.find.mockReset();
    doctorMock.find.mockClear();
    doctorMock.countDocuments.mockClear();
    findChain.lean.mockResolvedValue([]);
  });

  it("does NOT add a text filter when q is empty", async () => {
    await searchDoctors({});
    const filter = doctorMock.find.mock.calls[0]![0] as Record<string, unknown>;
    expect(filter).toEqual({ status: "published" });
  });

  it("builds an $and-of-$or regex filter — one token per $and clause", async () => {
    await searchDoctors({ q: "tanbir" });
    const filter = doctorMock.find.mock.calls[0]![0] as { $and: Array<{ $or: unknown[] }> };
    expect(filter.$and).toBeDefined();
    expect(filter.$and).toHaveLength(1);
    expect(filter.$and[0]!.$or).toHaveLength(9); // 9 searchable fields
  });

  it("a regex token matches name.displayName case-insensitively (substring)", async () => {
    await searchDoctors({ q: "tanbir" });
    const filter = doctorMock.find.mock.calls[0]![0] as {
      $and: Array<{ $or: Array<{ "name.displayName"?: RegExp }> }>;
    };
    const displayClause = filter.$and[0]!.$or.find((c) => c["name.displayName"]);
    expect(displayClause).toBeDefined();
    expect(displayClause!["name.displayName"]).toBeInstanceOf(RegExp);
    expect("Md Tanbir Hossen").toMatch(displayClause!["name.displayName"] as RegExp);
    expect("Karim Rahman").not.toMatch(displayClause!["name.displayName"] as RegExp);
  });

  it("multi-word query requires every token to match (one $and clause per token)", async () => {
    await searchDoctors({ q: "Md Tanbir" });
    const filter = doctorMock.find.mock.calls[0]![0] as { $and: Array<{ $or: unknown[] }> };
    expect(filter.$and).toHaveLength(2);
  });

  it("escapes regex special characters so user input cannot inject a pattern", async () => {
    await searchDoctors({ q: "a.b*" });
    const filter = doctorMock.find.mock.calls[0]![0] as {
      $and: Array<{ $or: Array<{ "name.displayName"?: RegExp }> }>;
    };
    const clause = filter.$and[0]!.$or.find((c) => c["name.displayName"])!;
    const re = clause["name.displayName"] as RegExp;
    // Should match the literal "a.b*" but not other 3-char strings via the wildcard.
    expect("a.b*").toMatch(re);
    expect("axb").not.toMatch(re);
  });
});
