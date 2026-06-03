import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/mongoose", () => ({ dbConnect: vi.fn(async () => {}) }));

const findChain = {
  sort: vi.fn().mockReturnThis(),
  skip: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  lean: vi.fn(async () => []),
};
const doctorMock = {
  find: vi.fn(() => findChain),
  countDocuments: vi.fn(async () => 0),
};

vi.mock("@/lib/db/models", () => ({
  Doctor: doctorMock,
  // Other models referenced by queries/admin.ts at import time:
  ClaimRequest: { find: vi.fn() },
}));

vi.mock("@/lib/db/models/ClaimRequest", () => ({
  ClaimRequest: { find: vi.fn() },
  VERIFICATION_SLA_MS: 24 * 60 * 60 * 1000,
}));

const { listDoctorsForAdmin } = await import("@/lib/db/queries/admin");

describe("listDoctorsForAdmin", () => {
  beforeEach(() => {
    doctorMock.find.mockClear();
    doctorMock.countDocuments.mockReset().mockResolvedValue(0);
    findChain.sort.mockClear();
    findChain.skip.mockClear();
    findChain.limit.mockClear();
    findChain.lean.mockReset().mockResolvedValue([]);
  });

  it("defaults to page 1 with pageSize 20 and an empty filter", async () => {
    const result = await listDoctorsForAdmin({});
    expect(doctorMock.find).toHaveBeenCalledWith({});
    expect(findChain.skip).toHaveBeenCalledWith(0);
    expect(findChain.limit).toHaveBeenCalledWith(20);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
    expect(result.totalPages).toBe(1); // minimum 1 even with 0 rows
  });

  it("computes skip from page × pageSize", async () => {
    await listDoctorsForAdmin({ page: 3, pageSize: 20 });
    expect(findChain.skip).toHaveBeenCalledWith(40);
    expect(findChain.limit).toHaveBeenCalledWith(20);
  });

  it("clamps pageSize to [10, 100]", async () => {
    await listDoctorsForAdmin({ pageSize: 1 });
    expect(findChain.limit).toHaveBeenLastCalledWith(10);

    await listDoctorsForAdmin({ pageSize: 10_000 });
    expect(findChain.limit).toHaveBeenLastCalledWith(100);
  });

  it("clamps page to a minimum of 1", async () => {
    await listDoctorsForAdmin({ page: -5 });
    expect(findChain.skip).toHaveBeenCalledWith(0);
  });

  it("computes totalPages = ceil(total / pageSize)", async () => {
    doctorMock.countDocuments.mockResolvedValueOnce(151);
    const result = await listDoctorsForAdmin({ pageSize: 50 });
    expect(result.total).toBe(151);
    expect(result.totalPages).toBe(4); // 151 / 50 = 3.02 → 4
    expect(result.pageSize).toBe(50);
  });

  it("adds a $text filter only when q has content", async () => {
    await listDoctorsForAdmin({ q: "   " });
    expect(doctorMock.find).toHaveBeenLastCalledWith({});

    await listDoctorsForAdmin({ q: "tanbir" });
    expect(doctorMock.find).toHaveBeenLastCalledWith({ $text: { $search: "tanbir" } });
  });

  it("maps status and claimed flags into the filter", async () => {
    await listDoctorsForAdmin({ status: "published", claimed: "true" });
    expect(doctorMock.find).toHaveBeenLastCalledWith({
      status: "published",
      isClaimed: true,
    });

    await listDoctorsForAdmin({ claimed: "false" });
    expect(doctorMock.find).toHaveBeenLastCalledWith({ isClaimed: false });
  });

  it("filters by specialty with a case-insensitive exact-match regex", async () => {
    await listDoctorsForAdmin({ specialty: "Cardiology" });
    const calls = doctorMock.find.mock.calls as unknown as Array<[Record<string, unknown>]>;
    const filter = calls[calls.length - 1]![0] as { "specialties.name": RegExp };
    expect(filter["specialties.name"]).toBeInstanceOf(RegExp);
    expect(filter["specialties.name"].source).toBe("^Cardiology$");
    expect(filter["specialties.name"].flags).toContain("i");
    // Sanity-check the match: an exact (case-insensitive) hit, not a substring.
    expect(filter["specialties.name"].test("cardiology")).toBe(true);
    expect(filter["specialties.name"].test("Pediatric Cardiology")).toBe(false);
  });

  it("escapes regex metacharacters in the specialty value", async () => {
    await listDoctorsForAdmin({ specialty: "Ear, Nose & Throat (ENT)" });
    const calls = doctorMock.find.mock.calls as unknown as Array<[Record<string, unknown>]>;
    const filter = calls[calls.length - 1]![0] as { "specialties.name": RegExp };
    // The parens / dot etc. must be escaped, so they match literals not groups.
    expect(filter["specialties.name"].test("Ear, Nose & Throat (ENT)")).toBe(true);
  });

  it("ignores an empty / whitespace specialty value", async () => {
    await listDoctorsForAdmin({ specialty: "   " });
    expect(doctorMock.find).toHaveBeenLastCalledWith({});
  });
});
