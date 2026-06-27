import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/mongoose", () => ({ dbConnect: vi.fn(async () => {}) }));

const findChain = {
  sort: vi.fn().mockReturnThis(),
  skip: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  lean: vi.fn(async () => []),
};
const doctorMock = {
  find: vi.fn(() => findChain),
  countDocuments: vi.fn(async () => 0),
};

vi.mock("@/lib/db/models", () => ({
  Doctor: doctorMock,
  ClaimRequest: { find: vi.fn() },
}));

vi.mock("@/lib/db/models/ClaimRequest", () => ({
  ClaimRequest: { find: vi.fn() },
  VERIFICATION_SLA_MS: 24 * 60 * 60 * 1000,
}));

const { listDoctorsByViews } = await import("@/lib/db/queries/admin");

describe("listDoctorsByViews", () => {
  beforeEach(() => {
    doctorMock.find.mockClear();
    doctorMock.countDocuments.mockReset().mockResolvedValue(0);
    findChain.sort.mockClear();
    findChain.skip.mockClear();
    findChain.limit.mockClear();
    findChain.select.mockClear();
    findChain.lean.mockReset().mockResolvedValue([]);
  });

  it("defaults to all-time sort, page 1, pageSize 20, empty filter", async () => {
    const result = await listDoctorsByViews({});
    expect(doctorMock.find).toHaveBeenCalledWith({});
    expect(findChain.sort).toHaveBeenCalledWith({ profileViews: -1, _id: 1 });
    expect(findChain.skip).toHaveBeenCalledWith(0);
    expect(findChain.limit).toHaveBeenCalledWith(20);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
    expect(result.totalPages).toBe(1);
  });

  it("sorts by the 30-day counter when sort=30d", async () => {
    await listDoctorsByViews({ sort: "30d" });
    expect(findChain.sort).toHaveBeenLastCalledWith({ "metrics.profileViews30d": -1, _id: 1 });
  });

  it("sorts by last-viewed when sort=recent", async () => {
    await listDoctorsByViews({ sort: "recent" });
    expect(findChain.sort).toHaveBeenLastCalledWith({ "metrics.lastViewedAt": -1, _id: 1 });
  });

  it("falls back to all-time sort for an unknown sort value", async () => {
    await listDoctorsByViews({ sort: "bogus" });
    expect(findChain.sort).toHaveBeenLastCalledWith({ profileViews: -1, _id: 1 });
  });

  it("applies a status filter only for a valid enum value", async () => {
    await listDoctorsByViews({ status: "published" });
    expect(doctorMock.find).toHaveBeenLastCalledWith({ status: "published" });

    await listDoctorsByViews({ status: "nonsense" });
    expect(doctorMock.find).toHaveBeenLastCalledWith({});
  });

  it("projects only the columns the table needs", async () => {
    await listDoctorsByViews({});
    expect(findChain.select).toHaveBeenCalledWith("slug name profileViews metrics status isClaimed");
  });

  it("computes skip from page × pageSize and clamps pageSize to [10, 100]", async () => {
    await listDoctorsByViews({ page: 3, pageSize: 20 });
    expect(findChain.skip).toHaveBeenCalledWith(40);

    await listDoctorsByViews({ pageSize: 1 });
    expect(findChain.limit).toHaveBeenLastCalledWith(10);

    await listDoctorsByViews({ pageSize: 10_000 });
    expect(findChain.limit).toHaveBeenLastCalledWith(100);
  });

  it("computes totalPages = ceil(total / pageSize)", async () => {
    doctorMock.countDocuments.mockResolvedValueOnce(151);
    const result = await listDoctorsByViews({ pageSize: 50 });
    expect(result.total).toBe(151);
    expect(result.totalPages).toBe(4);
  });
});
