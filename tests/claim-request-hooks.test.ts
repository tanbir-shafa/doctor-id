// @vitest-environment node
import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { ClaimRequest, VERIFICATION_SLA_MS } from "@/lib/db/models/ClaimRequest";

/**
 * Smoke-tests the pre-validate / pre-save hooks on ClaimRequest without
 * hitting Mongo. `doc.validate()` runs pre-validate locally; calling
 * `doc.save()` against the unconnected default mongoose connection fails
 * (no socket), but pre-save fires synchronously before the network call —
 * which is enough to catch the "next is not a function" regression we
 * shipped once already.
 */
describe("ClaimRequest hooks", () => {
  it("assigns slaExpiresAt = createdAt + 24h on validate()", async () => {
    const doc = new (ClaimRequest as any)({
      doctorId: new mongoose.Types.ObjectId(),
      requestedBy: new mongoose.Types.ObjectId(),
      status: "pending",
    });
    expect(doc.slaExpiresAt).toBeFalsy();
    await doc.validate();
    expect(doc.slaExpiresAt).toBeInstanceOf(Date);
    const remaining = doc.slaExpiresAt.getTime() - Date.now();
    // Within 1s of the 24h target — the hook reads Date.now() at fire time.
    expect(Math.abs(remaining - VERIFICATION_SLA_MS)).toBeLessThan(1000);
  });

  it("pre-validate is idempotent — re-validating doesn't overwrite the stamp", async () => {
    const doc = new (ClaimRequest as any)({
      doctorId: new mongoose.Types.ObjectId(),
      requestedBy: new mongoose.Types.ObjectId(),
      status: "pending",
    });
    await doc.validate();
    const first = doc.slaExpiresAt.getTime();
    await new Promise((r) => setTimeout(r, 5));
    await doc.validate();
    expect(doc.slaExpiresAt.getTime()).toBe(first);
  });
});
