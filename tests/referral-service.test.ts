// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Types } from "mongoose";

vi.mock("@/lib/db/mongoose", () => ({ dbConnect: vi.fn(async () => {}) }));
vi.mock("@/lib/utils/bmdc", () => ({ normalizeBmdc: (s: string) => s }));

// Chainable findOne().select().lean() stand-in.
function leanQuery(result: unknown) {
  const q: any = {
    select() {
      return q;
    },
    sort() {
      return q;
    },
    populate() {
      return q;
    },
    lean() {
      return Promise.resolve(result);
    },
  };
  return q;
}

const doctorModel: any = { findOne: vi.fn(), findById: vi.fn() };
const referralModel: any = {
  create: vi.fn(async () => ({ _id: new Types.ObjectId() })),
  findOneAndUpdate: vi.fn(),
  countDocuments: vi.fn(),
};
vi.mock("@/lib/db/models", () => ({ Doctor: doctorModel, Referral: referralModel }));

const { resolveReferrer, recordReferral, qualifyReferralAndRecompute } = await import(
  "@/lib/referral/service"
);

// A fake hydrated Doctor with nested get/set + save spy.
function makeReferrer(foundingDoctor?: Record<string, unknown>) {
  const store: any = { slug: "dr-ref", foundingDoctor };
  return {
    _id: new Types.ObjectId(),
    _store: store,
    get(path: string) {
      return path.split(".").reduce<any>((o, k) => (o == null ? o : o[k]), store);
    },
    set(path: string, val: unknown) {
      const keys = path.split(".");
      let o = store;
      for (let i = 0; i < keys.length - 1; i++) {
        o[keys[i]] = o[keys[i]] ?? {};
        o = o[keys[i]];
      }
      o[keys[keys.length - 1]] = val;
    },
    save: vi.fn(async function (this: unknown) {
      return this;
    }),
  };
}

beforeEach(() => {
  doctorModel.findOne.mockReset();
  doctorModel.findById.mockReset();
  referralModel.create.mockReset();
  referralModel.create.mockResolvedValue({ _id: new Types.ObjectId() });
  referralModel.findOneAndUpdate.mockReset();
  referralModel.countDocuments.mockReset();
});

describe("resolveReferrer", () => {
  it("resolves a code by slug", async () => {
    const rid = new Types.ObjectId();
    const uid = new Types.ObjectId();
    doctorModel.findOne.mockReturnValueOnce(
      leanQuery({ _id: rid, userId: uid, slug: "dr-x", name: { displayName: "Dr. X" } }),
    );
    const r = await resolveReferrer("dr-x");
    expect(r).toEqual({
      doctorId: String(rid),
      userId: String(uid),
      slug: "dr-x",
      displayName: "Dr. X",
    });
  });

  it("resolves a code by BMDC number when the slug misses", async () => {
    const rid = new Types.ObjectId();
    const uid = new Types.ObjectId();
    doctorModel.findOne
      .mockReturnValueOnce(leanQuery(null)) // slug miss
      .mockReturnValueOnce(
        leanQuery({ _id: rid, userId: uid, slug: "dr-y", name: { displayName: "Dr. Y" } }),
      ); // BMDC hit
    const r = await resolveReferrer("12345");
    expect(r).toEqual({
      doctorId: String(rid),
      userId: String(uid),
      slug: "dr-y",
      displayName: "Dr. Y",
    });
    expect(doctorModel.findOne).toHaveBeenCalledTimes(2);
  });

  it("returns null for an empty code without hitting the DB", async () => {
    expect(await resolveReferrer("")).toBeNull();
    expect(doctorModel.findOne).not.toHaveBeenCalled();
  });

  it("returns null when nothing matches by slug or BMDC", async () => {
    doctorModel.findOne.mockReturnValueOnce(leanQuery(null)).mockReturnValueOnce(leanQuery(null));
    expect(await resolveReferrer("nope")).toBeNull();
  });

  it("returns null for an unclaimed referrer (no bound userId)", async () => {
    doctorModel.findOne.mockReturnValueOnce(
      leanQuery({ _id: new Types.ObjectId(), userId: null, slug: "seed" }),
    );
    expect(await resolveReferrer("seed")).toBeNull();
  });
});

describe("recordReferral", () => {
  it("creates a pending referral", async () => {
    await recordReferral({
      referrer: { doctorId: "A", userId: "ua" },
      referredDoctorId: "B",
      referredUserId: "ub",
      via: "register",
      source: "link",
    });
    expect(referralModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        referrerDoctorId: "A",
        referredDoctorId: "B",
        status: "pending",
        via: "register",
        source: "link",
      }),
    );
  });

  it("blocks self-referral by user", async () => {
    await recordReferral({
      referrer: { doctorId: "A", userId: "u" },
      referredDoctorId: "B",
      referredUserId: "u",
      via: "register",
    });
    expect(referralModel.create).not.toHaveBeenCalled();
  });

  it("blocks self-referral by doctor", async () => {
    await recordReferral({
      referrer: { doctorId: "A", userId: "ua" },
      referredDoctorId: "A",
      referredUserId: "ub",
      via: "register",
    });
    expect(referralModel.create).not.toHaveBeenCalled();
  });

  it("swallows a duplicate-key error (first-touch dedup)", async () => {
    referralModel.create.mockRejectedValueOnce(Object.assign(new Error("dup"), { code: 11000 }));
    await expect(
      recordReferral({
        referrer: { doctorId: "A", userId: "ua" },
        referredDoctorId: "B",
        referredUserId: "ub",
        via: "claim",
      }),
    ).resolves.toBeUndefined();
  });
});

describe("qualifyReferralAndRecompute", () => {
  it("flips pending → qualified and awards the badge at the 5th", async () => {
    referralModel.findOneAndUpdate.mockResolvedValueOnce({ get: () => "RID" });
    referralModel.countDocuments.mockResolvedValueOnce(5);
    const referrer = makeReferrer();
    doctorModel.findById.mockResolvedValueOnce(referrer);

    const res = await qualifyReferralAndRecompute("B");

    expect(res).toEqual({ awarded: true, referrerSlug: "dr-ref" });
    expect(referrer._store.foundingDoctor.isFounding).toBe(true);
    expect(referrer._store.foundingDoctor.qualifiedReferrals).toBe(5);
    expect(referrer._store.foundingDoctor.awardedAt).toBeInstanceOf(Date);
    expect(referrer.save).toHaveBeenCalled();
  });

  it("updates the count but does not award below the threshold", async () => {
    referralModel.findOneAndUpdate.mockResolvedValueOnce({ get: () => "RID" });
    referralModel.countDocuments.mockResolvedValueOnce(3);
    const referrer = makeReferrer();
    doctorModel.findById.mockResolvedValueOnce(referrer);

    const res = await qualifyReferralAndRecompute("B");

    expect(res.awarded).toBe(false);
    expect(referrer._store.foundingDoctor.qualifiedReferrals).toBe(3);
    expect(referrer._store.foundingDoctor.isFounding).toBeUndefined();
  });

  it("is idempotent + permanent for an already-founding referrer", async () => {
    referralModel.findOneAndUpdate.mockResolvedValueOnce({ get: () => "RID" });
    referralModel.countDocuments.mockResolvedValueOnce(7);
    const referrer = makeReferrer({ isFounding: true, qualifiedReferrals: 5, awardedAt: new Date() });
    doctorModel.findById.mockResolvedValueOnce(referrer);

    const res = await qualifyReferralAndRecompute("B");

    expect(res.awarded).toBe(false); // not NEWLY awarded
    expect(referrer._store.foundingDoctor.isFounding).toBe(true); // still founding
    expect(referrer._store.foundingDoctor.qualifiedReferrals).toBe(7); // count refreshed
  });

  it("is a no-op when there is no pending referral", async () => {
    referralModel.findOneAndUpdate.mockResolvedValueOnce(null);
    const res = await qualifyReferralAndRecompute("B");
    expect(res).toEqual({ awarded: false, referrerSlug: null });
    expect(doctorModel.findById).not.toHaveBeenCalled();
  });
});
