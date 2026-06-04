// @vitest-environment node
/**
 * Body-grouped batching is the heart of the outbound campaign optimization.
 * These tests pin the input/output contract of `sendSmsBatch` against a stubbed
 * fetch:
 *   - Dev mode (no creds) returns sent:true rows so the script can flow.
 *   - SSL: same-body cohorts → one /send-sms/bulk call (chunked at 100);
 *     unique/personalized bodies → /send-sms/dynamic; per-recipient failures
 *     come from smsinfo[]; a failed chunk halts the campaign.
 *   - MDL fallback still chunks a shared body at 20 per GET call.
 *
 * NOTE: env() memoizes _serverEnv on first call, so every test that flips creds
 * must `vi.resetModules()` and dynamically `import()` the client in a fresh
 * module registry.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("sendSmsBatch — dev (no creds)", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.resetModules();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("returns sent:true rows even without creds (lets the script flow)", async () => {
    const { sendSmsBatch } = await import("@/lib/sms/client");
    const out = await sendSmsBatch([
      { to: "+8801711000001", body: "Hello" },
      { to: "+8801711000002", body: "Hello" },
    ]);
    expect(out).toHaveLength(2);
    expect(out.every((r) => r.sent === true)).toBe(true);
    expect(new Set(out.map((r) => r.batchId)).size).toBe(1);
  });

  it("preserves input order across grouped/chunked output", async () => {
    const { sendSmsBatch } = await import("@/lib/sms/client");
    const msgs = [
      { to: "+8801711000001", body: "A" },
      { to: "+8801711000002", body: "B" },
      { to: "+8801711000003", body: "A" },
    ];
    const out = await sendSmsBatch(msgs);
    expect(out.map((r) => r.to)).toEqual(msgs.map((m) => m.to));
    expect(out.map((r) => r.body)).toEqual(msgs.map((m) => m.body));
  });
});

describe("sendSmsBatch — SSL Wireless v3 (configured)", () => {
  let originalFetch: typeof globalThis.fetch;
  let originalEnv: typeof process.env;
  let calls: Array<{ url: string; method?: string; body: Record<string, unknown> }>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalEnv = process.env;
    calls = [];
    process.env = {
      ...originalEnv,
      SMS_PROVIDER: "ssl",
      SSL_SMS_API_TOKEN: "tok-123",
      SSL_SMS_SID: "BRANDNAME",
      SSL_SMS_API_BASE_URL: "https://smsplus.sslwireless.com/api/v3",
    };
    // Default mock: echo every msisdn back as SUCCESS.
    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      calls.push({ url: String(url), method: init?.method, body });
      const msisdns: string[] = Array.isArray(body.msisdn)
        ? body.msisdn
        : Array.isArray(body.sms)
          ? body.sms.map((s: { msisdn: string }) => s.msisdn)
          : [body.msisdn];
      const smsinfo = msisdns.map((m, i) => ({ sms_status: "SUCCESS", msisdn: m, reference_id: `REF${i}` }));
      return new Response(JSON.stringify({ status: "SUCCESS", status_code: 200, smsinfo }), { status: 200 });
    });
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.resetModules();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("sends a shared-body cohort via /send-sms/bulk in one call (< 100)", async () => {
    const { sendSmsBatch } = await import("@/lib/sms/client");
    const msgs = Array.from({ length: 45 }, (_, i) => ({
      to: `+880171100${String(i).padStart(4, "0")}`,
      body: "Identical body",
    }));
    const out = await sendSmsBatch(msgs);

    expect(out).toHaveLength(45);
    expect(out.every((r) => r.sent)).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.url.endsWith("/send-sms/bulk")).toBe(true);
    expect(calls[0]!.body.msisdn).toHaveLength(45);
    expect(calls[0]!.body.sms).toBe("Identical body");
    expect((calls[0]!.body.batch_csms_id as string).length).toBeLessThanOrEqual(20);
  });

  it("chunks a 150-recipient shared-body cohort into 100 + 50", async () => {
    const { sendSmsBatch } = await import("@/lib/sms/client");
    const msgs = Array.from({ length: 150 }, (_, i) => ({
      to: `+88017${String(i).padStart(8, "0")}`,
      body: "Same",
    }));
    const out = await sendSmsBatch(msgs);

    expect(out).toHaveLength(150);
    expect(out.every((r) => r.sent)).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.body.msisdn).toHaveLength(100);
    expect(calls[1]!.body.msisdn).toHaveLength(50);
    for (const c of calls) expect(c.url.endsWith("/send-sms/bulk")).toBe(true);
  });

  it("routes unique/personalized bodies to /send-sms/dynamic, preserving order", async () => {
    const { sendSmsBatch } = await import("@/lib/sms/client");
    const msgs = [
      { to: "+8801711000001", body: "Hi Alice" },
      { to: "+8801711000002", body: "Hi Bob" },
      { to: "+8801711000003", body: "Hi Carol" },
      { to: "+8801711000004", body: "Hi Dave" },
    ];
    const out = await sendSmsBatch(msgs);

    expect(out).toHaveLength(4);
    expect(out.every((r) => r.sent)).toBe(true);
    expect(out.map((r) => r.to)).toEqual(msgs.map((m) => m.to));

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url.endsWith("/send-sms/dynamic")).toBe(true);
    const items = calls[0]!.body.sms as Array<{ msisdn: string; text: string; csms_id: string }>;
    expect(items).toHaveLength(4);
    expect(items.map((s) => s.text)).toEqual(msgs.map((m) => m.body));
    for (const item of items) {
      expect(typeof item.msisdn).toBe("string");
      expect(item.csms_id.length).toBeLessThanOrEqual(20);
    }
  });

  it("does not mix bodies inside a bulk chunk", async () => {
    const { sendSmsBatch } = await import("@/lib/sms/client");
    const out = await sendSmsBatch([
      { to: "+8801711000001", body: "A" },
      { to: "+8801711000002", body: "B" },
      { to: "+8801711000003", body: "A" },
      { to: "+8801711000004", body: "B" },
    ]);

    expect(out).toHaveLength(4);
    expect(out.every((r) => r.sent)).toBe(true);
    expect(calls).toHaveLength(2); // A (×2) and B (×2) → two bulk calls
    for (const c of calls) {
      expect(c.url.endsWith("/send-sms/bulk")).toBe(true);
      expect(typeof c.body.sms).toBe("string"); // one body per bulk call
    }
    expect(calls.map((c) => c.body.sms).sort()).toEqual(["A", "B"]);
  });

  it("marks only the failed recipient when smsinfo reports a per-number failure", async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      const smsinfo = (body.msisdn as string[]).map((m, i) => ({
        sms_status: i === 1 ? "INVALID" : "SUCCESS",
        status_message: i === 1 ? "Invalid number" : "ok",
        msisdn: m,
        reference_id: `REF${i}`,
      }));
      return new Response(JSON.stringify({ status: "SUCCESS", status_code: 200, smsinfo }), { status: 200 });
    });

    const { sendSmsBatch } = await import("@/lib/sms/client");
    const out = await sendSmsBatch([
      { to: "+8801711000001", body: "Shared" },
      { to: "+8801711000002", body: "Shared" },
      { to: "+8801711000003", body: "Shared" },
    ]);

    expect(out[0]!.sent).toBe(true);
    expect(out[1]!.sent).toBe(false);
    expect(out[1]!.errorMessage).toBeTruthy();
    expect(out[2]!.sent).toBe(true);
  });

  it("halts the campaign on the first failed chunk (stopOnFailure default)", async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      callCount++;
      const body = JSON.parse(String(init?.body));
      if (body.sms === "A") {
        return new Response(
          JSON.stringify({ status: "FAILED", status_code: 4002, error_message: "boom" }),
          { status: 200 },
        );
      }
      const smsinfo = (body.msisdn as string[]).map((m) => ({ sms_status: "SUCCESS", msisdn: m }));
      return new Response(JSON.stringify({ status: "SUCCESS", status_code: 200, smsinfo }), { status: 200 });
    });

    const { sendSmsBatch } = await import("@/lib/sms/client");
    const out = await sendSmsBatch([
      { to: "+8801711000001", body: "A" },
      { to: "+8801711000002", body: "A" },
      { to: "+8801711000003", body: "B" },
      { to: "+8801711000004", body: "B" },
    ]);

    expect(out).toHaveLength(4);
    expect(out[0]!.sent).toBe(false);
    expect(out[1]!.sent).toBe(false);
    expect(out[0]!.errorMessage).toBeTruthy();
    expect(out[2]!.sent).toBe(false); // B chunk never attempted
    expect(out[3]!.sent).toBe(false);
    expect(callCount).toBe(1);
  });
});

describe("sendSmsBatch — MDL fallback (SMS_PROVIDER=mdl)", () => {
  let originalFetch: typeof globalThis.fetch;
  let originalEnv: typeof process.env;
  let calls: Array<{ recipients: string[]; body: string }>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalEnv = process.env;
    calls = [];
    process.env = {
      ...originalEnv,
      SMS_PROVIDER: "mdl",
      MDL_SMS_API_BASE_URL: "https://mdl.example.com/sendsms",
      MDL_SMS_API_KEY: "test-key",
      MDL_SMS_API_SENDER_ID: "DoctorID",
    };
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      const parsed = new URL(String(url));
      calls.push({
        recipients: (parsed.searchParams.get("contactNumbers") ?? "").split(","),
        body: parsed.searchParams.get("textBody") ?? "",
      });
      return new Response(JSON.stringify({ status: "OK" }), { status: 200 });
    });
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.resetModules();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("chunks a shared body at 20 per GET call", async () => {
    const { sendSmsBatch } = await import("@/lib/sms/client");
    const msgs = Array.from({ length: 45 }, (_, i) => ({
      to: `+880171100${String(i).padStart(4, "0")}`,
      body: "Same",
    }));
    const out = await sendSmsBatch(msgs);

    expect(out).toHaveLength(45);
    expect(out.every((r) => r.sent)).toBe(true);
    expect(calls).toHaveLength(3); // 20 + 20 + 5
    expect(calls[0]!.recipients).toHaveLength(20);
    expect(calls[2]!.recipients).toHaveLength(5);
    for (const c of calls) expect(c.body).toBe("Same");
  });
});
