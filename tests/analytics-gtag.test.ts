import { describe, it, expect, vi, afterEach } from "vitest";
import { trackEvent, pageview } from "@/lib/analytics/gtag";

afterEach(() => {
  delete (window as unknown as { gtag?: unknown }).gtag;
});

describe("gtag analytics wrapper", () => {
  it("no-ops safely when gtag.js has not loaded (analytics disabled)", () => {
    expect(() => trackEvent("sign_up")).not.toThrow();
    expect(() => pageview("/cardiology")).not.toThrow();
  });

  it("forwards events to window.gtag when present", () => {
    const spy = vi.fn();
    (window as unknown as { gtag: typeof spy }).gtag = spy;

    trackEvent("sign_up", { method: "phone_otp", flow: "claim" });
    expect(spy).toHaveBeenCalledWith("event", "sign_up", { method: "phone_otp", flow: "claim" });

    pageview("/karim-rahman-cardiologist");
    expect(spy).toHaveBeenCalledWith(
      "event",
      "page_view",
      expect.objectContaining({ page_path: "/karim-rahman-cardiologist" }),
    );
  });
});
