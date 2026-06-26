import { describe, it, expect } from "vitest";
import {
  bmdcApprovedTemplate,
  bmdcRejectedTemplate,
  identityApprovedTemplate,
  identityRejectedTemplate,
} from "@/lib/email/templates";

const DASH = "https://daktar.link/dashboard/profile";
const PROFILE = "https://daktar.link/karim-rahman-cardiologist";

describe("verification notification email templates", () => {
  it("bmdcApproved: subject + dashboard CTA + escaped name", () => {
    const t = bmdcApprovedTemplate({ name: "Dr. Karim", dashboardUrl: DASH });
    expect(t.subject).toBe("Your Daktar.Link profile is approved");
    expect(t.html.startsWith("<!doctype html>")).toBe(true);
    expect(t.html).toContain("Dr. Karim");
    expect(t.html).toContain(`href="${DASH}"`);
    expect(t.text).toContain(DASH);
  });

  it("identityApproved: links to the public profile", () => {
    const t = identityApprovedTemplate({ name: "Dr. Karim", profileUrl: PROFILE });
    expect(t.subject).toBe("Your Daktar.Link identity is verified");
    expect(t.html).toContain(`href="${PROFILE}"`);
    expect(t.html).toContain("verified badge");
  });

  it("bmdcRejected: includes reviewer notes when present", () => {
    const t = bmdcRejectedTemplate({
      name: "Dr. Karim",
      notes: "BMDC certificate was unreadable.",
      dashboardUrl: DASH,
    });
    expect(t.subject).toContain("Action needed");
    expect(t.html).toContain("Reviewer notes");
    expect(t.html).toContain("BMDC certificate was unreadable.");
    expect(t.text).toContain("BMDC certificate was unreadable.");
  });

  it("identityRejected: omits the notes block when notes are absent", () => {
    const t = identityRejectedTemplate({ name: "Dr. Karim", notes: null, dashboardUrl: DASH });
    expect(t.html).not.toContain("Reviewer notes");
    expect(t.html).toContain(`href="${DASH}"`);
  });

  it("HTML-escapes the doctor name + notes so they can't inject markup", () => {
    const t = bmdcRejectedTemplate({
      name: "<script>alert(1)</script>",
      notes: "<b>bad</b>",
      dashboardUrl: DASH,
    });
    expect(t.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(t.html).not.toContain("<script>alert(1)");
    expect(t.html).toContain("&lt;b&gt;bad&lt;/b&gt;");
  });
});
