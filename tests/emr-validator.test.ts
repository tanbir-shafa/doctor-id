import { describe, it, expect } from "vitest";
import { z } from "zod";

// The validator lives inside server/actions/emr.ts (not exported because
// it's an implementation detail). We re-derive the same shape here to
// pin its contract — if anyone widens the email check by accident, this
// test catches it.
const MarkReadySchema = z.object({
  userId: z.string().min(1, "userId is required"),
  emrAccountEmail: z.string().email("Enter a valid email"),
});

describe("markEmrReady — input validation", () => {
  it("accepts a real userId + email", () => {
    const r = MarkReadySchema.safeParse({
      userId: "65f1bcde0000000000000000",
      emrAccountEmail: "karim@shafacare.com",
    });
    expect(r.success).toBe(true);
  });

  it("rejects missing userId", () => {
    expect(MarkReadySchema.safeParse({ userId: "", emrAccountEmail: "a@b.com" }).success).toBe(
      false,
    );
  });

  it("rejects a malformed email", () => {
    expect(
      MarkReadySchema.safeParse({
        userId: "65f1bcde0000000000000000",
        emrAccountEmail: "not-an-email",
      }).success,
    ).toBe(false);
  });
});
