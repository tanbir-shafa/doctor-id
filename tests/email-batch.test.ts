// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Unit tests for the bulk email facade (src/lib/email/client.ts). The
 * single-send `sendEmail` and the budget limiter are mocked at the module
 * boundary so these stay DB-/network-less. Mirrors tests/sms-batch.test.ts +
 * tests/email-ses.test.ts.
 */

// Defined inside vi.hoisted so the (hoisted) vi.mock factory can reference it.
const h = vi.hoisted(() => {
  class SuppressedRecipientError extends Error {
    readonly code = "SUPPRESSED" as const;
    constructor(email: string) {
      super(`Recipient ${email} is on the suppression list`);
      this.name = "SuppressedRecipientError";
    }
  }
  return {
    SuppressedRecipientError,
    sendEmail: vi.fn(),
    budgetLimit: vi.fn(async () => ({ success: true, limit: 1, remaining: 1, reset: 0 })),
    inFlight: 0,
    maxInFlight: 0,
  };
});

vi.mock("@/lib/email/ses", () => ({
  sendEmail: h.sendEmail,
  SuppressedRecipientError: h.SuppressedRecipientError,
}));

vi.mock("@/lib/redis/ratelimit", () => ({
  globalEmailBudgetLimiter: { limit: h.budgetLimit },
}));

import { sendEmailBatch } from "@/lib/email/client";

function msgs(...tos: string[]) {
  return tos.map((to) => ({ to, subject: `Hi ${to}`, body: `<p>${to}</p>` }));
}

beforeEach(() => {
  h.sendEmail.mockReset();
  h.budgetLimit.mockReset();
  h.budgetLimit.mockResolvedValue({ success: true, limit: 1, remaining: 1, reset: 0 });
  h.inFlight = 0;
  h.maxInFlight = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("sendEmailBatch", () => {
  it("dev no-op (sendEmail resolves {}) → all rows sent, order preserved", async () => {
    h.sendEmail.mockResolvedValue({});
    const res = await sendEmailBatch(msgs("a@x.com", "b@x.com", "c@x.com"));
    expect(res.map((r) => r.to)).toEqual(["a@x.com", "b@x.com", "c@x.com"]);
    expect(res.every((r) => r.sent)).toBe(true);
    expect(res.every((r) => r.messageId === undefined)).toBe(true);
  });

  it("maps messageId through and preserves input order under concurrency", async () => {
    h.sendEmail.mockImplementation(async (input: { email: string }) => ({
      messageId: `mid-${input.email}`,
    }));
    const res = await sendEmailBatch(msgs("a@x.com", "b@x.com", "c@x.com"), { concurrency: 3 });
    expect(res.map((r) => r.messageId)).toEqual(["mid-a@x.com", "mid-b@x.com", "mid-c@x.com"]);
  });

  it("a SuppressedRecipientError marks that row suppressed and the batch continues", async () => {
    h.sendEmail.mockImplementation(async (input: { email: string }) => {
      if (input.email === "blocked@x.com") throw new h.SuppressedRecipientError(input.email);
      return { messageId: `mid-${input.email}` };
    });
    const res = await sendEmailBatch(msgs("a@x.com", "blocked@x.com", "c@x.com"));
    expect(res[0]).toMatchObject({ sent: true });
    expect(res[1]).toMatchObject({ sent: false, suppressed: true, errorMessage: "SUPPRESSED" });
    expect(res[2]).toMatchObject({ sent: true });
  });

  it("a generic error fails that row but continues by default", async () => {
    h.sendEmail.mockImplementation(async (input: { email: string }) => {
      if (input.email === "bad@x.com") throw new Error("SES 554");
      return { messageId: "mid" };
    });
    const res = await sendEmailBatch(msgs("a@x.com", "bad@x.com", "c@x.com"));
    expect(res[0].sent).toBe(true);
    expect(res[1]).toMatchObject({ sent: false, errorMessage: "SES 554" });
    expect(res[1].suppressed).toBeUndefined();
    expect(res[2].sent).toBe(true);
  });

  it("stopOnFailure halts the run after a hard failure (concurrency 1)", async () => {
    h.sendEmail.mockImplementation(async (input: { email: string }) => {
      if (input.email === "bad@x.com") throw new Error("boom");
      return { messageId: "mid" };
    });
    const res = await sendEmailBatch(msgs("a@x.com", "bad@x.com", "c@x.com", "d@x.com"), {
      concurrency: 1,
      stopOnFailure: true,
    });
    expect(res[0].sent).toBe(true);
    expect(res[1].sent).toBe(false);
    // Aborted before reaching c/d — never attempted, left as sent:false.
    expect(res[2].sent).toBe(false);
    expect(res[3].sent).toBe(false);
    expect(h.sendEmail).toHaveBeenCalledTimes(2);
  });

  it("respects the concurrency cap", async () => {
    h.sendEmail.mockImplementation(async () => {
      h.inFlight++;
      h.maxInFlight = Math.max(h.maxInFlight, h.inFlight);
      await new Promise((r) => setTimeout(r, 5));
      h.inFlight--;
      return { messageId: "mid" };
    });
    await sendEmailBatch(msgs(...Array.from({ length: 10 }, (_, i) => `u${i}@x.com`)), {
      concurrency: 3,
    });
    expect(h.maxInFlight).toBeLessThanOrEqual(3);
    expect(h.maxInFlight).toBeGreaterThan(1); // proves it actually ran in parallel
  });

  it("when the budget limiter trips, remaining rows are marked EMAIL_BUDGET and not sent", async () => {
    h.budgetLimit.mockResolvedValue({ success: false, limit: 1, remaining: 0, reset: 0 });
    h.sendEmail.mockResolvedValue({ messageId: "mid" });
    const res = await sendEmailBatch(msgs("a@x.com", "b@x.com"), { concurrency: 1 });
    expect(res.every((r) => r.sent === false && r.errorMessage === "EMAIL_BUDGET")).toBe(true);
    expect(h.sendEmail).not.toHaveBeenCalled();
  });
});
