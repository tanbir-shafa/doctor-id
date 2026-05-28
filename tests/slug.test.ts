import { describe, it, expect } from "vitest";
import { generateSlug, slugify } from "@/lib/utils/slug";

describe("generateSlug", () => {
  it("strips honorifics and produces a clean kebab-case slug", () => {
    expect(generateSlug({ displayName: "Dr. Karim Rahman", primarySpecialty: "Cardiology" }))
      .toBe("karim-rahman-cardiologist");
  });

  it("falls back to slugified specialty when no specialty noun is known", () => {
    expect(generateSlug({ displayName: "Fatema Akhter", primarySpecialty: "Sleep Medicine" }))
      .toBe("fatema-akhter-sleep-medicine");
  });

  it("appends a disambiguator suffix when supplied", () => {
    expect(generateSlug({ displayName: "Karim Rahman", primarySpecialty: "Cardiology", disambiguator: "4521" }))
      .toBe("karim-rahman-cardiologist-4521");
  });

  it("works without a specialty", () => {
    expect(generateSlug({ displayName: "Tasnim Ahmed" })).toBe("tasnim-ahmed");
  });

  it("slugify drops punctuation and collapses whitespace", () => {
    expect(slugify("Apollo Hospitals & Diagnostics — Dhanmondi")).toBe("apollo-hospitals-and-diagnostics-dhanmondi");
  });
});
