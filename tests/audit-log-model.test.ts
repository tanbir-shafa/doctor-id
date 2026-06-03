// @vitest-environment node
import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { AuditLog } from "@/lib/db/models/AuditLog";

describe("AuditLog model", () => {
  it("validates a minimal admin entry", async () => {
    const doc = new (AuditLog as any)({
      type: "doctor.profile_basic.updated",
      entityType: "Doctor",
      entityId: new mongoose.Types.ObjectId(),
      actorId: new mongoose.Types.ObjectId(),
      actorRole: "admin",
    });
    await expect(doc.validate()).resolves.toBeUndefined();
  });

  it("requires type, entityType, entityId", async () => {
    const doc = new (AuditLog as any)({});
    let err: unknown = null;
    try {
      await doc.validate();
    } catch (e) {
      err = e;
    }
    expect(err).toBeTruthy();
    const e = err as { errors: Record<string, unknown> };
    expect(e.errors.type).toBeTruthy();
    expect(e.errors.entityType).toBeTruthy();
    expect(e.errors.entityId).toBeTruthy();
  });

  it("rejects unknown actorRole values", async () => {
    const doc = new (AuditLog as any)({
      type: "x",
      entityType: "Doctor",
      entityId: new mongoose.Types.ObjectId(),
      actorRole: "bogus",
    });
    let err: unknown = null;
    try {
      await doc.validate();
    } catch (e) {
      err = e;
    }
    expect(err).toBeTruthy();
  });

  it("declares the entity + actor + type lookup indexes", () => {
    const indexes = (AuditLog.schema as unknown as { indexes: () => Array<[Record<string, 1 | -1>, unknown]> }).indexes();
    const shapes = indexes.map(([fields]) => JSON.stringify(fields));
    expect(shapes).toContain(JSON.stringify({ entityType: 1, entityId: 1, createdAt: -1 }));
    expect(shapes).toContain(JSON.stringify({ actorId: 1, createdAt: -1 }));
    expect(shapes).toContain(JSON.stringify({ type: 1, createdAt: -1 }));
  });
});
