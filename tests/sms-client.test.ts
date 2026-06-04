// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendSms, estimateSegments } from "@/lib/sms/client";

describe("estimateSegments", () => {
  it("packs ASCII bodies at 160 chars per segment", () => {
    expect(estimateSegments("a".repeat(159), false)).toBe(1);
    expect(estimateSegments("a".repeat(161), false)).toBe(2);
    expect(estimateSegments("", false)).toBe(0);
  });

  it("packs Unicode bodies at 70 chars per segment", () => {
    expect(estimateSegments("ক".repeat(69), true)).toBe(1);
    expect(estimateSegments("ক".repeat(71), true)).toBe(2);
  });
});

describe("sendSms — dev no-op", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns sent:false when no SMS provider is configured", async () => {
    // vitest.setup.ts boots with no SSL/MDL vars; the default provider (ssl)
    // is unconfigured (trigger is "token+sid absent"), so the no-op path fires.
    const r = await sendSms({ to: "+8801711000000", body: "Hello" });
    expect(r.sent).toBe(false);
    expect(r.segments).toBe(1);
  });

  it("detects Unicode and reports more segments", async () => {
    const r = await sendSms({ to: "+8801711000000", body: "ক".repeat(75) });
    expect(r.sent).toBe(false);
    expect(r.segments).toBe(2);
  });
});

describe("sendSms — SSL Wireless v3 (configured)", () => {
  let originalFetch: typeof globalThis.fetch;
  let originalEnv: typeof process.env;
  let lastCall: { url: string; method?: string; body: Record<string, unknown> } | null;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalEnv = process.env;
    lastCall = null;
    process.env = {
      ...originalEnv,
      SMS_PROVIDER: "ssl",
      SSL_SMS_API_TOKEN: "tok-123",
      SSL_SMS_SID: "BRANDNAME",
      SSL_SMS_API_BASE_URL: "https://smsplus.sslwireless.com/api/v3",
    };
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.resetModules(); // env() memoizes — re-import the client in a fresh registry.
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("POSTs the v3 JSON body to /send-sms and maps reference_id → messageId", async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      lastCall = {
        url: String(url),
        method: init?.method,
        body: JSON.parse(String(init?.body)),
      };
      return new Response(
        JSON.stringify({
          status: "SUCCESS",
          status_code: 200,
          error_message: "",
          smsinfo: [{ sms_status: "SUCCESS", msisdn: "8801711000000", reference_id: "REF123" }],
        }),
        { status: 200 },
      );
    });

    const { sendSms } = await import("@/lib/sms/client");
    const r = await sendSms({ to: "+8801711000000", body: "Your code is 123456" });

    expect(r.sent).toBe(true);
    expect(r.messageId).toBe("REF123");
    expect(r.segments).toBe(1);

    expect(lastCall!.method).toBe("POST");
    expect(lastCall!.url.endsWith("/send-sms")).toBe(true);
    expect(lastCall!.body.api_token).toBe("tok-123");
    expect(lastCall!.body.sid).toBe("BRANDNAME");
    expect(lastCall!.body.msisdn).toBe("8801711000000"); // de-plussed
    expect(lastCall!.body.sms).toBe("Your code is 123456");
    expect(typeof lastCall!.body.csms_id).toBe("string");
    expect((lastCall!.body.csms_id as string).length).toBeLessThanOrEqual(20);
  });

  it("treats a top-level FAILED response as not sent", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ status: "FAILED", status_code: 4001, error_message: "IP not whitelisted" }),
        { status: 200 },
      ),
    );
    const { sendSms } = await import("@/lib/sms/client");
    const r = await sendSms({ to: "+8801711000000", body: "Hello" });
    expect(r.sent).toBe(false);
  });

  it("treats a BLOCKED smsinfo row as not sent even when status is SUCCESS", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "SUCCESS",
          status_code: 200,
          smsinfo: [{ sms_status: "BLOCKED", status_message: "number blocked", msisdn: "8801711000000" }],
        }),
        { status: 200 },
      ),
    );
    const { sendSms } = await import("@/lib/sms/client");
    const r = await sendSms({ to: "+8801711000000", body: "Hello" });
    expect(r.sent).toBe(false);
  });

  it("treats a non-2xx HTTP response as not sent", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("nope", { status: 500 }));
    const { sendSms } = await import("@/lib/sms/client");
    const r = await sendSms({ to: "+8801711000000", body: "Hello" });
    expect(r.sent).toBe(false);
  });
});
