// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Types } from "mongoose";

// Mock the heavy bits before importing the action module (same approach as
// admin-doctor-actions.test.ts).
const authMock = vi.fn();
vi.mock("@/lib/auth/config", () => ({ auth: () => authMock() }));
vi.mock("@/lib/db/mongoose", () => ({ dbConnect: vi.fn(async () => {}) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => ({ get: () => null })) }));
vi.mock("@/lib/redis/ratelimit", () => ({
  profileViewRateLimiter: { limit: vi.fn(async () => ({ success: true })) },
}));

// Control completeness so we can assert the single next-action nudge selection
// (highest-weight unfinished section).
vi.mock("@/lib/utils/completeness", () => ({
  computeCompleteness: () => ({
    score: 70,
    sections: [
      { key: "bio", label: "Bio", weight: 5, done: false },
      { key: "chambers", label: "Chambers", weight: 15, done: false },
      { key: "name", label: "Name", weight: 10, done: true },
    ],
  }),
}));

const fakeDoctor = {
  _id: new Types.ObjectId(),
  toObject() {
    return {
      name: { first: "Karim", last: "Rahman", displayName: "Dr. Karim Rahman" },
      slug: "dr-karim-rahman-cardiologist",
      status: "published",
      profileViews: 1234,
    };
  },
};

const doctorModel = {
  findOne: vi.fn(async (): Promise<typeof fakeDoctor | null> => fakeDoctor),
};
const profileViewModel = { countDocuments: vi.fn(async () => 42) };
const appointmentModel = { countDocuments: vi.fn(async () => 3) };
const userModel = {
  findById: vi.fn(() => ({
    select: () => ({ lean: async () => ({ emr: { seatStatus: "pending" } }) }),
  })),
};

vi.mock("@/lib/db/models", () => ({
  Doctor: doctorModel,
  ProfileView: profileViewModel,
  AppointmentRequest: appointmentModel,
  User: userModel,
}));

const { loadHomeScoreboardAction } = await import("@/server/actions/doctor");

function asDoctor() {
  authMock.mockResolvedValueOnce({ user: { id: new Types.ObjectId().toString(), role: "doctor" } });
}
function unauthenticated() {
  authMock.mockResolvedValueOnce(null);
}

describe("loadHomeScoreboardAction", () => {
  beforeEach(() => {
    authMock.mockReset();
    doctorModel.findOne.mockClear();
    profileViewModel.countDocuments.mockClear();
    appointmentModel.countDocuments.mockClear();
  });

  it("returns ok:false for anonymous visitors without touching the DB", async () => {
    unauthenticated();
    const r = await loadHomeScoreboardAction();
    expect(r.ok).toBe(false);
    expect(doctorModel.findOne).not.toHaveBeenCalled();
  });

  it("returns ok:false for a logged-in account with no doctor profile (e.g. an admin)", async () => {
    asDoctor();
    doctorModel.findOne.mockResolvedValueOnce(null);
    const r = await loadHomeScoreboardAction();
    expect(r.ok).toBe(false);
  });

  it("returns the scoreboard shape for a logged-in doctor", async () => {
    asDoctor();
    const r = await loadHomeScoreboardAction();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data?.firstName).toBe("Karim");
    expect(r.data?.slug).toBe("dr-karim-rahman-cardiologist");
    expect(r.data?.published).toBe(true);
    expect(r.data?.views30d).toBe(42);
    expect(r.data?.viewsAllTime).toBe(1234);
    expect(r.data?.pendingRequests).toBe(3);
    expect(r.data?.completeness).toBe(70);
    // Highest-weight unfinished section wins the single nudge.
    expect(r.data?.nextAction).toEqual({ label: "Chambers", weight: 15 });
    expect(r.data?.emrSeatStatus).toBe("pending");
  });
});
