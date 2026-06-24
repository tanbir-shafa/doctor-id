import { describe, it, expect } from "vitest";
import {
  OUTBOUND_EMAIL_TEMPLATES,
  renderEmailTemplate,
  type EmailTemplateContext,
} from "@/lib/outbound/email-templates";

const tpl = OUTBOUND_EMAIL_TEMPLATES["email-en-claim"]!;

function ctx(over: Partial<EmailTemplateContext> = {}): EmailTemplateContext {
  return {
    displayName: "Dr. Karim Rahman",
    firstName: "Karim",
    initials: "KR",
    primarySpecialty: "Cardiology",
    otherSpecialties: "Internal Medicine",
    designation: "Senior Consultant",
    institute: "Square Hospitals Ltd",
    locationLabel: "Dhanmondi, Dhaka",
    experienceLabel: "18+ years experience",
    bmdcLabel: "BMDC Reg. A-42137",
    viewsLabel: "12,480 views this month",
    about: "Dr. Karim Rahman is a Cardiology specialist based in Dhaka.",
    qualifications: [
      { degree: "MBBS", detail: "Dhaka Medical College (2004)" },
      { degree: "FCPS (Cardiology)", detail: "BCPS (2011)" },
    ],
    experiences: [{ role: "Senior Consultant, Cardiology", detail: "Square Hospitals Ltd · 2016 – present" }],
    chamber: {
      name: "Popular Diagnostic Centre",
      isPrimary: true,
      address: "House 16, Road 2, Dhanmondi, Dhaka",
      phone: "+880 2 9661491",
      fee: "1,000 BDT",
      schedule: [
        { label: "Sat", time: "5–9 PM", open: true },
        { label: "Sun", time: "Closed", open: false },
        { label: "Mon", time: "5–9 PM", open: true },
        { label: "Tue", time: "Closed", open: false },
        { label: "Wed", time: "5–9 PM", open: true },
        { label: "Thu", time: "Closed", open: false },
        { label: "Fri", time: "Closed", open: false },
      ],
    },
    focusAreas: ["Interventional cardiology", "Heart failure"],
    languages: ["Bangla", "English"],
    claimUrl: "https://daktar.link/auth/register?slug=karim-rahman-cardiologist",
    unsubscribeUrl: "https://daktar.link/api/unsubscribe?token=abc.def",
    ...over,
  };
}

describe("renderEmailTemplate (profile-page card layout)", () => {
  it("puts the first name in the subject", () => {
    const { subject } = renderEmailTemplate(tpl, ctx());
    expect(subject).toBe("Dr. Karim, your Daktar.Link profile is ready to claim");
  });

  it("renders a full HTML document with the brand header + footer", () => {
    const { html } = renderEmailTemplate(tpl, ctx());
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("Daktar.Link");
    expect(html).toContain("Shafa Care Ltd");
  });

  it("renders the profile-page sections from context", () => {
    const { html } = renderEmailTemplate(tpl, ctx());
    expect(html).toContain("Dr. Karim Rahman");
    expect(html).toContain("Unclaimed profile");
    expect(html).toContain("Cardiology");
    expect(html).toContain("18+ years experience");
    expect(html).toContain("About");
    expect(html).toContain("Qualifications");
    expect(html).toContain("MBBS");
    expect(html).toContain("Experience");
    expect(html).toContain("Chambers &amp; schedule");
    expect(html).toContain("Popular Diagnostic Centre");
    expect(html).toContain("Primary");
    expect(html).toContain("5–9 PM");
    expect(html).toContain("Closed");
    expect(html).toContain("Areas of focus");
    expect(html).toContain("Interventional cardiology");
    expect(html).toContain("Languages");
    expect(html).toContain("Bangla");
  });

  it("shows the amber claim banner with the deep link, never the dead /claim URL", () => {
    const { html } = renderEmailTemplate(tpl, ctx());
    expect(html).toContain("Are you <strong");
    expect(html).toContain("Claim this profile");
    expect(html).toContain('href="https://daktar.link/auth/register?slug=karim-rahman-cardiologist"');
    expect(html).not.toContain("daktar.link/claim");
    expect(html).toContain("https://daktar.link/api/unsubscribe?token=abc.def");
  });

  it("HTML-escapes doctor-derived values so a name/field can't inject markup", () => {
    const { html } = renderEmailTemplate(
      tpl,
      ctx({ displayName: "<script>alert(1)</script>", focusAreas: ["<b>x</b>"] }),
    );
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });

  it("omits optional cards when their data is absent", () => {
    const { html } = renderEmailTemplate(
      tpl,
      ctx({ chamber: null, qualifications: [], experiences: [], focusAreas: [], languages: [], about: "" }),
    );
    expect(html).not.toContain("Chambers &amp; schedule");
    expect(html).not.toContain("Qualifications");
    expect(html).not.toContain("Areas of focus");
    // Header + claim banner still render.
    expect(html).toContain("Dr. Karim Rahman");
    expect(html).toContain("Claim this profile");
  });

  it("produces no leftover mustache placeholders", () => {
    const { subject, html } = renderEmailTemplate(tpl, ctx());
    expect(subject).not.toContain("{{");
    expect(html).not.toContain("{{");
  });
});
