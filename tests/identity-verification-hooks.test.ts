// @vitest-environment node
import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { IdentityVerificationRequest } from "@/lib/db/models/IdentityVerificationRequest";
import { VERIFICATION_SLA_MS } from "@/lib/sla";

/**
 * Mirrors tests/claim-request-hooks.test.ts — guards the pre-validate /
 * pre-save SLA hooks on the new model against the "next is not a function"
 * regression (async hook style, no `next` callback).
 */
describe("IdentityVerificationRequest hooks", () => {
  function makeDoc() {
    return new (IdentityVerificationRequest as any)({
      doctorId: new mongoose.Types.ObjectId(),
      requestedBy: new mongoose.Types.ObjectId(),
      legalName: { first: "Abdul", last: "Karim" },
      idDocumentType: "nid",
      status: "pending",
    });
  }

  it("assigns slaExpiresAt = now + 24h on validate()", async () => {
    const doc = makeDoc();
    expect(doc.slaExpiresAt).toBeFalsy();
    await doc.validate();
    expect(doc.slaExpiresAt).toBeInstanceOf(Date);
    const remaining = doc.slaExpiresAt.getTime() - Date.now();
    expect(Math.abs(remaining - VERIFICATION_SLA_MS)).toBeLessThan(1000);
  });

  it("pre-validate is idempotent — re-validating doesn't overwrite the stamp", async () => {
    const doc = makeDoc();
    await doc.validate();
    const first = doc.slaExpiresAt.getTime();
    await new Promise((r) => setTimeout(r, 5));
    await doc.validate();
    expect(doc.slaExpiresAt.getTime()).toBe(first);
  });
});
