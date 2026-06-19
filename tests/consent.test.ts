import { describe, it, expect, vi } from "vitest";
import { readConsent, writeConsent, CONSENT_EVENT } from "@/lib/analytics/consent";

describe("cookie consent", () => {
  it("stores the choice in a cookie and broadcasts the change", () => {
    expect(readConsent()).toBeNull();

    const spy = vi.fn();
    window.addEventListener(CONSENT_EVENT, spy);

    writeConsent("granted");
    expect(readConsent()).toBe("granted");
    expect((spy.mock.calls[0]![0] as CustomEvent).detail).toBe("granted");

    writeConsent("denied");
    expect(readConsent()).toBe("denied");

    window.removeEventListener(CONSENT_EVENT, spy);
  });
});
