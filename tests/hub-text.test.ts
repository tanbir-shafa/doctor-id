import { describe, it, expect } from "vitest";
import {
  buildHubIntro,
  buildHubNearbyBlurb,
  buildHubEmptyState,
  buildHubFaq,
  buildDistrictHubIntro,
  buildDistrictNearbyBlurb,
  buildDistrictHubEmptyState,
  buildDistrictHubFaq,
  buildIntentIntro,
  buildIntentFaq,
  BEST_METHODOLOGY_DISCLOSURE,
  BEST_METHODOLOGY_DISCLOSURE_BN,
  HUB_WHY_DAKTAR_NOTE,
  HUB_WHY_DAKTAR_NOTE_BN,
  type HubCopyInput,
  type DistrictHubCopyInput,
  type IntentCopyInput,
} from "@/lib/seo/hub-text";

const A: HubCopyInput = { specialty: "Cardiology", count: 247 };
const B: HubCopyInput = { specialty: "Cardiology", district: "Gazipur", division: "Dhaka", count: 12 };

describe("hub-text — intro paragraph", () => {
  it("specialty hub (A) intro mentions the specialty + count, omits any district", () => {
    const intro = buildHubIntro(A);
    expect(intro).toContain("cardiology");
    expect(intro).toContain("247");
    expect(intro).toContain("Bangladesh");
    expect(intro.length).toBeGreaterThan(120);
  });

  it("specialty×district hub (B) intro mentions the district + specialty + count", () => {
    const intro = buildHubIntro(B);
    expect(intro).toContain("Gazipur");
    expect(intro).toContain("cardiology");
    expect(intro).toContain("12");
  });

  it("is deterministic per URL but varies across pages", () => {
    expect(buildHubIntro(B)).toBe(buildHubIntro(B)); // stable
    const keys = ["Cardiology", "Dermatology", "Neurology", "Gynecology", "Pediatrics", "Urology"];
    const intros = new Set(keys.map((s) => buildHubIntro({ specialty: s, count: 50 })));
    expect(intros.size).toBeGreaterThan(1); // not all the same variant
  });

  it("pluralises the count and drops the number when there is no supply", () => {
    expect(buildHubIntro({ specialty: "Cardiology", district: "Bhola", division: "Barishal", count: 1 })).toContain(
      "1 cardiology doctor",
    );
    const zero = buildHubIntro({ specialty: "Cardiology", district: "Bhola", division: "Barishal", count: 0 });
    expect(zero).not.toMatch(/\b0 cardiology/);
    expect(zero).toContain("cardiology doctors");
  });

  it("collapses the division clause when the district shares its division name", () => {
    // Force the B2 variant (the only one that uses placePhrase) via variantKey search.
    const sameName = buildHubIntro({ specialty: "Medicine", district: "Dhaka", division: "Dhaka", count: 9, variantKey: "x-medicine-dhaka" });
    // Whatever variant is picked, "Dhaka, Dhaka division" must never appear.
    expect(sameName).not.toContain("Dhaka, Dhaka division");
  });
});

describe("hub-text — supporting copy", () => {
  it("nearby blurb lists sibling districts, or null when none", () => {
    expect(buildHubNearbyBlurb({ ...B, nearbyDistricts: ["Dhaka", "Narayanganj", "Tangail"] })).toBe(
      "Also browse cardiology doctors in Dhaka, Narayanganj and Tangail.",
    );
    expect(buildHubNearbyBlurb(B)).toBeNull();
    expect(buildHubNearbyBlurb({ ...B, nearbyDistricts: [] })).toBeNull();
  });

  it("empty-state copy differs for district vs national and points to the parent hub", () => {
    expect(buildHubEmptyState(B)).toContain("Gazipur");
    expect(buildHubEmptyState(B)).toContain("across Bangladesh");
    expect(buildHubEmptyState(A)).not.toContain("Gazipur");
  });

  it("why-note states the BMDC + blue-tick framing accurately", () => {
    expect(HUB_WHY_DAKTAR_NOTE).toContain("BMDC");
    expect(HUB_WHY_DAKTAR_NOTE).toContain("blue Verified tick");
  });
});

describe("hub-text — hub FAQ", () => {
  it("district FAQ asks district-scoped questions with non-empty answers", () => {
    const faq = buildHubFaq(B);
    expect(faq).toHaveLength(4);
    expect(faq[0]!.question).toContain("Gazipur");
    expect(faq.every((f) => f.answer.trim().length > 0)).toBe(true);
    // count-aware first answer
    expect(faq[0]!.answer).toContain("12 cardiology doctors");
  });

  it("district FAQ's count question degrades gracefully with zero supply", () => {
    const faq = buildHubFaq({ ...B, count: 0 });
    expect(faq[0]!.answer).toContain("don't have");
    expect(faq[0]!.answer).not.toMatch(/\b0 cardiology/);
  });

  it("national FAQ omits a district and stays accurate on verification", () => {
    const faq = buildHubFaq(A);
    expect(faq).toHaveLength(4);
    expect(faq.some((f) => f.question.includes("Bangladesh"))).toBe(true);
    expect(faq.some((f) => /Gazipur/.test(f.question) || /Gazipur/.test(f.answer))).toBe(false);
    const verif = faq.find((f) => /BMDC-verified/.test(f.question));
    expect(verif!.answer).toContain("blue Verified tick");
  });
});

describe("hub-text — district-only hub (page type C)", () => {
  const D: DistrictHubCopyInput = {
    district: "Gazipur",
    division: "Dhaka",
    count: 80,
    topSpecialties: ["Medicine", "Cardiology", "Gynecology"],
  };

  it("intro mentions the district, count and a few specialties; deterministic per URL", () => {
    const intro = buildDistrictHubIntro(D);
    expect(intro).toContain("Gazipur");
    expect(intro).toContain("80 doctors");
    expect(intro).toMatch(/Medicine|Cardiology|Gynecology/);
    expect(buildDistrictHubIntro(D)).toBe(intro); // stable
  });

  it("intro degrades gracefully with no specialties and no supply", () => {
    const intro = buildDistrictHubIntro({ district: "Bandarban", division: "Chattogram", count: 0 });
    expect(intro).toContain("Bandarban");
    expect(intro).toContain("range of specialties");
    expect(intro).not.toMatch(/\b0 doctor/);
  });

  it("collapses the division clause when district shares its division name", () => {
    const intro = buildDistrictHubIntro({ district: "Sylhet", division: "Sylhet", count: 40, variantKey: "k1" });
    expect(intro).not.toContain("Sylhet, Sylhet division");
  });

  it("nearby blurb + empty state are district-scoped", () => {
    expect(buildDistrictNearbyBlurb({ ...D, nearbyDistricts: ["Dhaka", "Narayanganj"] })).toBe(
      "Also browse doctors in Dhaka and Narayanganj.",
    );
    expect(buildDistrictNearbyBlurb(D)).toBeNull();
    expect(buildDistrictHubEmptyState(D)).toContain("Gazipur");
  });

  it("district FAQ has 4 entries, count-aware, with verification framing", () => {
    const faq = buildDistrictHubFaq(D);
    expect(faq).toHaveLength(4);
    expect(faq[0]!.answer).toContain("80 doctors");
    expect(faq[1]!.answer).toMatch(/Medicine|Cardiology/);
    expect(faq.find((f) => /verified/.test(f.question))!.answer).toContain("blue Verified tick");
    const zero = buildDistrictHubFaq({ ...D, count: 0, topSpecialties: [] });
    expect(zero[0]!.answer).toContain("don't have");
  });
});

describe("hub-text — intent pages (page type D)", () => {
  const female: IntentCopyInput = {
    intent: "female",
    specialty: "Gynecology",
    district: "Dhaka",
    division: "Dhaka",
    count: 18,
  };
  const best: IntentCopyInput = {
    intent: "best",
    specialty: "Cardiology",
    district: "Chattogram",
    division: "Chattogram",
    count: 25,
  };

  it("female intro emphasises female doctors + place + count", () => {
    const intro = buildIntentIntro(female);
    expect(intro).toMatch(/female gynecology doctor/i);
    expect(intro).toContain("Dhaka");
    expect(intro).toContain("18 female gynecology doctors");
  });

  it("female intro works nationally (no district)", () => {
    const intro = buildIntentIntro({ intent: "female", specialty: "Gynecology", count: 0 });
    expect(intro).toContain("in Bangladesh");
    expect(intro).toContain("female gynecology doctors"); // count-neutral when zero
    expect(intro).not.toMatch(/\b0 female/);
  });

  it("best/top intro uses 'top', never the bare superlative, and stays count-neutral", () => {
    const intro = buildIntentIntro(best);
    expect(intro.toLowerCase()).toContain("cardiology doctors");
    expect(intro.toLowerCase()).toMatch(/\btop\b/); // "top" or "top-ranked", whichever variant
    expect(intro).not.toMatch(/\bthe best\b/i);
  });

  it("best disclosure is the approved task-10 wording (no clinical-quality claim)", () => {
    expect(BEST_METHODOLOGY_DISCLOSURE).toContain("verification status");
    expect(BEST_METHODOLOGY_DISCLOSURE).toContain("cannot be paid for");
    expect(BEST_METHODOLOGY_DISCLOSURE).toMatch(/not a judgement of clinical quality/i);
  });

  it("best FAQ explains the ranking + that it can't be bought", () => {
    const faq = buildIntentFaq(best);
    expect(faq[0]!.question.toLowerCase()).toContain("top cardiology doctors");
    expect(faq[0]!.answer).toContain("Chattogram");
    expect(faq.some((f) => /pay to rank/i.test(f.question))).toBe(true);
    expect(faq.find((f) => /pay to rank/i.test(f.question))!.answer).toMatch(/cannot be bought/i);
  });

  it("female FAQ is count-aware and degrades with zero supply", () => {
    expect(buildIntentFaq(female)[0]!.answer).toContain("18 female gynecology doctors");
    const zero = buildIntentFaq({ ...female, count: 0 });
    expect(zero[0]!.answer).toContain("don't have");
  });
});

describe("hub-text — Bangla (bn) locale", () => {
  const bnRe = /[ঀ-৿]/; // Bengali Unicode block

  it("hub intro returns Bangla + the count; en path unchanged without locale", () => {
    const bn = buildHubIntro({ specialty: "Cardiology", district: "Dhaka", division: "Dhaka", count: 12, locale: "bn" });
    expect(bn).toMatch(bnRe);
    expect(bn).toContain("12");

    const en = buildHubIntro({ specialty: "Cardiology", district: "Dhaka", division: "Dhaka", count: 12 });
    expect(en).not.toMatch(bnRe);
    expect(en).toContain("cardiology");
  });

  it("district + intent intros return Bangla; best uses শীর্ষ ('top')", () => {
    expect(
      buildDistrictHubIntro({ district: "Gazipur", division: "Dhaka", count: 80, topSpecialties: ["Medicine"], locale: "bn" }),
    ).toMatch(bnRe);
    expect(buildIntentIntro({ intent: "female", specialty: "Gynecology", district: "Dhaka", count: 9, locale: "bn" })).toMatch(bnRe);
    expect(buildIntentIntro({ intent: "best", specialty: "Cardiology", count: 20, locale: "bn" })).toContain("শীর্ষ");
  });

  it("bn FAQ questions are Bangla with non-empty answers", () => {
    for (const faq of [
      buildHubFaq({ specialty: "Cardiology", district: "Dhaka", count: 5, locale: "bn" }),
      buildDistrictHubFaq({ district: "Dhaka", count: 5, locale: "bn" }),
      buildIntentFaq({ intent: "best", specialty: "Cardiology", district: "Dhaka", count: 5, locale: "bn" }),
    ]) {
      expect(faq.length).toBeGreaterThan(0);
      expect(faq.every((f) => bnRe.test(f.question) && f.answer.trim().length > 0)).toBe(true);
    }
  });

  it("bn disclosure preserves the legal meaning (clinical-quality + can't-pay)", () => {
    expect(BEST_METHODOLOGY_DISCLOSURE_BN).toContain("চিকিৎসার মান"); // clinical quality
    expect(BEST_METHODOLOGY_DISCLOSURE_BN).toContain("অর্থের বিনিময়ে"); // cannot be paid for
    expect(HUB_WHY_DAKTAR_NOTE_BN).toContain("BMDC");
    expect(BEST_METHODOLOGY_DISCLOSURE_BN).not.toBe(BEST_METHODOLOGY_DISCLOSURE);
  });

  it("en output is unaffected by the bn layer", () => {
    expect(buildIntentFaq({ intent: "best", specialty: "Cardiology", district: "Dhaka", count: 5 })[0]!.question).not.toMatch(
      bnRe,
    );
  });
});
