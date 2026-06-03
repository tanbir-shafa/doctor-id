import { describe, it, expect } from "vitest";
import {
  renderTemplate,
  segmentCount,
  hasUnresolvedPlaceholders,
  OUTBOUND_TEMPLATES,
} from "@/lib/outbound/templates";

describe("renderTemplate", () => {
  it("substitutes mustache placeholders", () => {
    expect(renderTemplate("Hi {{firstName}}!", { firstName: "Karim" })).toBe("Hi Karim!");
  });

  it("supports multiple placeholders", () => {
    expect(
      renderTemplate("Dr. {{firstName}} {{lastName}} - claim {{slug}}", {
        firstName: "Karim",
        lastName: "Rahman",
        slug: "dr-karim-rahman",
      }),
    ).toBe("Dr. Karim Rahman - claim dr-karim-rahman");
  });

  it("leaves unknown placeholders alone (caller can validate)", () => {
    expect(renderTemplate("Hi {{firstName}}, {{missing}}!", { firstName: "K" })).toBe(
      "Hi K, {{missing}}!",
    );
  });
});

describe("segmentCount", () => {
  it("packs ASCII at 160 chars/segment", () => {
    expect(segmentCount("a".repeat(159))).toEqual({ unicode: false, segments: 1 });
    expect(segmentCount("a".repeat(161))).toEqual({ unicode: false, segments: 2 });
  });

  it("flags Unicode (Bangla) bodies and packs at 70/segment", () => {
    expect(segmentCount("ক".repeat(69))).toEqual({ unicode: true, segments: 1 });
    expect(segmentCount("ক".repeat(71))).toEqual({ unicode: true, segments: 2 });
  });

  it("treats empty as 0 segments", () => {
    expect(segmentCount("")).toEqual({ unicode: false, segments: 0 });
  });
});

describe("hasUnresolvedPlaceholders", () => {
  it("detects leftover placeholders", () => {
    expect(hasUnresolvedPlaceholders("Hi {{name}}!")).toBe(true);
  });
  it("returns false when fully rendered", () => {
    expect(hasUnresolvedPlaceholders("Hi Karim!")).toBe(false);
  });
});

describe("OUTBOUND_TEMPLATES catalog", () => {
  it("ships the two starter A.8 templates", () => {
    expect(OUTBOUND_TEMPLATES["en-claim-rx-pad"]).toBeDefined();
    expect(OUTBOUND_TEMPLATES["bn-claim-rx-pad"]).toBeDefined();
  });

  it("marks broadcast templates as non-personalized (so they batch)", () => {
    expect(OUTBOUND_TEMPLATES["en-claim-rx-pad"]?.personalized).toBe(false);
    expect(OUTBOUND_TEMPLATES["bn-claim-rx-pad"]?.personalized).toBe(false);
  });

  it("flags the personal variant as personalized (1-per-call)", () => {
    expect(OUTBOUND_TEMPLATES["en-claim-rx-pad-personal"]?.personalized).toBe(true);
  });

  it("each starter body stays under 3 SMS segments (cost ceiling)", () => {
    // ASCII templates should fit in 1–2; Unicode (Bangla) reasonably gets 3
    // because 70-char Unicode segments are tight. Past 3 we're paying too
    // much per send and need to trim copy.
    for (const tpl of Object.values(OUTBOUND_TEMPLATES)) {
      const { segments } = segmentCount(tpl.body);
      expect(segments).toBeLessThanOrEqual(3);
    }
  });
});
