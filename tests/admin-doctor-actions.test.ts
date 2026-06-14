// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Types } from "mongoose";

// Mock the heavy bits before importing the action module.

const authMock = vi.fn();
vi.mock("@/lib/auth/config", () => ({
  auth: () => authMock(),
}));
vi.mock("@/lib/db/mongoose", () => ({ dbConnect: vi.fn(async () => {}) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const fakeDoctor: any = {
  _id: new Types.ObjectId(),
  get(field: string) {
    return (this as any)[field];
  },
  set(field: string, value: unknown) {
    (this as any)[field] = value;
  },
  save: vi.fn(async function (this: any) {
    return this;
  }),
  toObject() {
    return { ...this };
  },
  slug: "dr-test-cardiologist",
  status: "published",
};

const doctorModel = {
  findById: vi.fn(async () => fakeDoctor),
};
vi.mock("@/lib/db/models", () => ({
  Doctor: doctorModel,
  // referenced indirectly by /lib/audit/log
  AuditLog: { create: vi.fn(async () => ({ _id: "log1" })) },
}));

// Bypass real env at import-time in confirm-photo action.
vi.mock("@/lib/env", () => ({ env: () => ({}) }));

// Avoid pulling S3 SDK.
vi.mock("@/lib/s3/presign", () => ({
  presignUpload: vi.fn(async () => ({
    uploadUrl: "https://s3.test/put",
    publicUrl: "https://cdn.test/x.jpg",
    key: "profile/abc/x.jpg",
  })),
}));

// Avoid heavy completeness import side effects.
vi.mock("@/lib/utils/completeness", () => ({
  computeCompleteness: () => ({ score: 50, fields: {} }),
  missingPublishRequirements: () => [],
}));

const { AuditLog } = await import("@/lib/db/models");
const auditCreateMock = (AuditLog as unknown as { create: ReturnType<typeof vi.fn> }).create;

const actions = await import("@/server/actions/admin-doctor");

const VALID_DOCTOR_ID = new Types.ObjectId().toString();

function asAdmin() {
  authMock.mockResolvedValueOnce({
    user: { id: new Types.ObjectId().toString(), role: "admin", email: "ops@daktar.link" },
  });
}
function asDoctor() {
  authMock.mockResolvedValueOnce({
    user: { id: new Types.ObjectId().toString(), role: "doctor", email: "doc@example.com" },
  });
}
function unauthenticated() {
  authMock.mockResolvedValueOnce(null);
}

describe("admin-doctor actions — authorization", () => {
  beforeEach(() => {
    authMock.mockReset();
    fakeDoctor.save.mockClear();
    doctorModel.findById.mockClear();
    auditCreateMock.mockClear();
  });

  it("rejects unauthenticated requests", async () => {
    unauthenticated();
    const form = new FormData();
    form.set("prefix", "Dr.");
    form.set("firstName", "A");
    form.set("lastName", "B");
    form.set("displayName", "Dr. A B");
    const r = await actions.adminUpdateProfileBasicAction(VALID_DOCTOR_ID, form);
    expect(r.ok).toBe(false);
    expect(doctorModel.findById).not.toHaveBeenCalled();
  });

  it("rejects non-admin users", async () => {
    asDoctor();
    const form = new FormData();
    form.set("prefix", "Dr.");
    form.set("firstName", "A");
    form.set("lastName", "B");
    form.set("displayName", "Dr. A B");
    const r = await actions.adminUpdateProfileBasicAction(VALID_DOCTOR_ID, form);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/admin/i);
    expect(doctorModel.findById).not.toHaveBeenCalled();
  });

  it("rejects malformed doctorId without hitting the DB", async () => {
    asAdmin();
    const r = await actions.adminSetPublishStatusAction("not-an-objectid", true);
    expect(r.ok).toBe(false);
    expect(doctorModel.findById).not.toHaveBeenCalled();
  });
});

describe("admin-doctor actions — happy path writes audit log", () => {
  beforeEach(() => {
    authMock.mockReset();
    fakeDoctor.save.mockClear();
    doctorModel.findById.mockClear();
    auditCreateMock.mockClear();
  });

  it("adminSetPublishStatusAction saves and records an audit entry", async () => {
    asAdmin();
    fakeDoctor.status = "draft";
    const r = await actions.adminSetPublishStatusAction(VALID_DOCTOR_ID, true);
    expect(r.ok).toBe(true);
    expect(fakeDoctor.save).toHaveBeenCalledTimes(1);
    expect(fakeDoctor.status).toBe("published");
    expect(auditCreateMock).toHaveBeenCalledTimes(1);
    const entry = auditCreateMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(entry.type).toBe("doctor.published");
    expect(entry.entityType).toBe("Doctor");
    expect(entry.actorRole).toBe("admin");
    expect(entry.actorEmail).toBe("ops@daktar.link");
  });

  it("adminUpdateProfileBasicAction writes audit on success", async () => {
    asAdmin();
    fakeDoctor.name = { prefix: "Dr.", first: "x", last: "y", displayName: "x y" };
    const form = new FormData();
    form.set("prefix", "Dr.");
    form.set("firstName", "Anwar");
    form.set("lastName", "Hossain");
    form.set("displayName", "Dr. Anwar Hossain");

    const r = await actions.adminUpdateProfileBasicAction(VALID_DOCTOR_ID, form);
    expect(r.ok).toBe(true);
    expect(fakeDoctor.save).toHaveBeenCalledTimes(1);
    expect(auditCreateMock).toHaveBeenCalledTimes(1);
    const entry = auditCreateMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(entry.type).toBe("doctor.profile_basic.updated");
  });

  it("adminUpdateProfileBasicAction rejects invalid input without writing", async () => {
    asAdmin();
    const form = new FormData();
    // Missing required firstName/lastName/displayName.
    form.set("prefix", "Dr.");
    const r = await actions.adminUpdateProfileBasicAction(VALID_DOCTOR_ID, form);
    expect(r.ok).toBe(false);
    expect(fakeDoctor.save).not.toHaveBeenCalled();
    expect(auditCreateMock).not.toHaveBeenCalled();
  });
});

describe("admin-doctor actions — founding doctor override", () => {
  beforeEach(() => {
    authMock.mockReset();
    fakeDoctor.save.mockClear();
    doctorModel.findById.mockClear();
    auditCreateMock.mockClear();
    // The fake stores nested set("a.b", v) as a flat dotted key — clear them.
    delete fakeDoctor["foundingDoctor.isFounding"];
    delete fakeDoctor["foundingDoctor.awardedAt"];
  });

  it("grants the badge: sets isFounding, stamps awardedAt, audits", async () => {
    asAdmin();
    fakeDoctor.foundingDoctor = { isFounding: false, qualifiedReferrals: 0, awardedAt: null };
    const form = new FormData();
    form.set("isFounding", "on");
    form.set("reason", "high-value onboarding");

    const r = await actions.adminUpdateFoundingDoctorAction(VALID_DOCTOR_ID, form);

    expect(r.ok).toBe(true);
    expect(fakeDoctor.save).toHaveBeenCalledTimes(1);
    expect(fakeDoctor["foundingDoctor.isFounding"]).toBe(true);
    expect(fakeDoctor["foundingDoctor.awardedAt"]).toBeInstanceOf(Date);
    expect(auditCreateMock).toHaveBeenCalledTimes(1);
    const entry = auditCreateMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(entry.type).toBe("doctor.founding.updated");
    const md = entry.metadata as Record<string, unknown>;
    expect(md.isFounding).toBe(true);
    expect(md.wasFounding).toBe(false);
    expect(md.reason).toBe("high-value onboarding");
  });

  it("revokes the badge: clears isFounding and awardedAt", async () => {
    asAdmin();
    fakeDoctor.foundingDoctor = { isFounding: true, qualifiedReferrals: 7, awardedAt: new Date() };
    const form = new FormData(); // no isFounding flag → revoke

    const r = await actions.adminUpdateFoundingDoctorAction(VALID_DOCTOR_ID, form);

    expect(r.ok).toBe(true);
    expect(fakeDoctor["foundingDoctor.isFounding"]).toBe(false);
    expect(fakeDoctor["foundingDoctor.awardedAt"]).toBeNull();
    expect(auditCreateMock).toHaveBeenCalledTimes(1);
    const entry = auditCreateMock.mock.calls[0]![0] as Record<string, unknown>;
    const md = entry.metadata as Record<string, unknown>;
    expect(md.isFounding).toBe(false);
    expect(md.wasFounding).toBe(true);
    expect(md.qualifiedReferrals).toBe(7);
  });

  it("rejects a non-admin without hitting the DB", async () => {
    asDoctor();
    const form = new FormData();
    form.set("isFounding", "on");
    const r = await actions.adminUpdateFoundingDoctorAction(VALID_DOCTOR_ID, form);
    expect(r.ok).toBe(false);
    expect(doctorModel.findById).not.toHaveBeenCalled();
    expect(fakeDoctor.save).not.toHaveBeenCalled();
  });
});
