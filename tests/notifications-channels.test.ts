// @vitest-environment node
import { describe, it, expect } from "vitest";
import { selectChannels } from "@/lib/notifications/doctor";

describe("selectChannels — which channels a verification notice goes to", () => {
  it("sends SMS whenever a phone is present", () => {
    expect(selectChannels({ phone: "+8801712345678" }).sms).toBe("+8801712345678");
  });

  it("omits SMS when there is no phone", () => {
    expect(selectChannels({ phone: null }).sms).toBeUndefined();
    expect(selectChannels({ phone: "  " }).sms).toBeUndefined();
  });

  it("sends email only when the email is verified", () => {
    const verified = selectChannels({
      email: "doc@example.com",
      emailVerified: new Date(),
    });
    expect(verified.email).toBe("doc@example.com");

    const unverified = selectChannels({ email: "doc@example.com", emailVerified: null });
    expect(unverified.email).toBeUndefined();
  });

  it("never emails the synthetic @phone.daktar.link placeholder, even if 'verified'", () => {
    const out = selectChannels({
      email: "8801712345678@phone.daktar.link",
      emailVerified: new Date(),
    });
    expect(out.email).toBeUndefined();
  });

  it("lowercases/trims the email and skips a blank one", () => {
    expect(selectChannels({ email: "  Doc@Example.com ", emailVerified: new Date() }).email).toBe(
      "doc@example.com",
    );
    expect(selectChannels({ email: "", emailVerified: new Date() }).email).toBeUndefined();
  });

  it("can return both channels together", () => {
    const out = selectChannels({
      phone: "+8801712345678",
      email: "doc@example.com",
      emailVerified: new Date(),
    });
    expect(out).toEqual({ sms: "+8801712345678", email: "doc@example.com" });
  });
});
