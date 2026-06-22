import { describe, it, expect } from "vitest";
import {
  buildPhysicianJsonLd,
  buildChamberJsonLd,
  buildOrganizationJsonLd,
  buildWebSiteJsonLd,
  buildBreadcrumbJsonLd,
  buildFaqJsonLd,
  buildItemListJsonLd,
  buildArticleJsonLd,
  pruneJsonLd,
} from "@/lib/seo/jsonld";
import type { DoctorDocLike } from "@/types/doctor";

const baseDoc: DoctorDocLike = {
  ownerType: "doctor",
  ownerId: "u1",
  slug: "karim-rahman-cardiologist",
  bmdcNumber: "12345",
  bmdcVerified: true,
  nidVerified: false,
  verificationLevel: "bmdc_verified",
  name: { prefix: "Dr.", first: "Karim", last: "Rahman", displayName: "Karim Rahman" },
  photo: { url: "https://x/y.jpg", s3Key: "k" },
  languages: ["Bangla", "English"],
  specialties: [{ name: "Cardiology", isPrimary: true }],
  qualifications: [{ degree: "MBBS", institution: "DMC", year: 2010, country: "BD" }],
  experience: [],
  chambers: [
    {
      name: "Apollo",
      address: "100 Road",
      area: "Bashundhara",
      district: "Dhaka",
      division: "Dhaka",
      coordinates: { lat: 23.81, lng: 90.42 },
      phone: "+8801711000000",
      schedule: [{ day: "sat", startTime: "17:00", endTime: "21:00", available: true }],
      isPrimary: true,
    },
  ],
  registrations: [],
  contact: {},
  profileCompletenessScore: 0,
  profileViews: 0,
  isClaimed: true,
  status: "published",
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("Schema.org JSON-LD builders", () => {
  it("Physician graph carries BMDC propertyValue + specialty array", () => {
    const ld = buildPhysicianJsonLd(baseDoc) as Record<string, unknown>;
    expect(ld["@type"]).toBe("Physician");
    expect(ld["@id"]).toContain("/karim-rahman-cardiologist");
    expect(ld.medicalSpecialty).toEqual(["Cardiology"]);
    expect(ld.identifier).toMatchObject({ propertyID: "BMDC", value: "12345" });
  });

  it("Physician graph adds sameAs (normalized + deduped), alumniOf, and dateModified", () => {
    const doc: DoctorDocLike = {
      ...baseDoc,
      contact: { website: "drkarim.com" },
      socialLinks: {
        facebook: "https://facebook.com/drkarim",
        linkedin: "linkedin.com/in/drkarim", // schemeless → coerced to https
        youtube: "@drkarim", // not a URL → dropped
      },
      qualifications: [
        { degree: "MBBS", institution: "Dhaka Medical College", year: 2010, country: "BD" },
        { degree: "FCPS", institution: "Dhaka Medical College", year: 2015, country: "BD" }, // dup
        { degree: "MD", institution: "BSMMU", year: 2018, country: "BD" },
      ],
      updatedAt: "2026-06-19T10:00:00.000Z",
    };
    const ld = buildPhysicianJsonLd(doc) as Record<string, unknown>;

    const sameAs = ld.sameAs as string[];
    expect(sameAs).toContain("https://facebook.com/drkarim");
    expect(sameAs).toContain("https://linkedin.com/in/drkarim");
    expect(sameAs).toContain("https://drkarim.com/");
    expect(sameAs.some((u) => u.includes("@drkarim"))).toBe(false); // garbage dropped

    const alumniOf = ld.alumniOf as Record<string, unknown>[];
    expect(alumniOf).toHaveLength(2); // deduped
    expect(alumniOf[0]).toMatchObject({
      "@type": "EducationalOrganization",
      name: "Dhaka Medical College",
    });
    expect(alumniOf.map((a) => a.name)).toContain("BSMMU");

    expect(ld.dateModified).toBe("2026-06-19T10:00:00.000Z");
  });

  it("Physician graph omits sameAs/alumniOf entirely when there's no data (post-prune)", () => {
    const ld = pruneJsonLd(
      buildPhysicianJsonLd({ ...baseDoc, qualifications: [], socialLinks: undefined, contact: {} }),
    ) as Record<string, unknown>;
    expect(ld.sameAs).toBeUndefined();
    expect(ld.alumniOf).toBeUndefined();
  });

  it("Chamber graph emits MedicalBusiness with PostalAddress + OpeningHoursSpecification", () => {
    const [ld] = buildChamberJsonLd(baseDoc).map((x) => x as Record<string, unknown>);
    expect(ld!["@type"]).toBe("MedicalBusiness");
    expect((ld!.address as Record<string, unknown>).addressLocality).toBe("Bashundhara");
    expect(Array.isArray(ld!.openingHoursSpecification)).toBe(true);
  });

  it("Organization + WebSite expose @id, SearchAction, and a publisher link", () => {
    const org = buildOrganizationJsonLd();
    expect(org["@type"]).toBe("Organization");
    expect(String(org["@id"])).toContain("#organization");

    const site = buildWebSiteJsonLd();
    expect(site["@type"]).toBe("WebSite");
    const action = site.potentialAction as Record<string, unknown>;
    expect(action["@type"]).toBe("SearchAction");
    expect(String((action.target as Record<string, unknown>).urlTemplate)).toContain(
      "/search?q={search_term_string}",
    );
    expect((site.publisher as Record<string, unknown>)["@id"]).toBe(org["@id"]);
  });

  it("BreadcrumbList numbers ListItems from 1 in order", () => {
    const bc = buildBreadcrumbJsonLd([
      { name: "Home", url: "https://x/" },
      { name: "Cardiology doctors", url: "https://x/cardiology" },
      { name: "Dr. Karim Rahman", url: "https://x/karim-rahman-cardiologist" },
    ]);
    expect(bc["@type"]).toBe("BreadcrumbList");
    const items = bc.itemListElement as Record<string, unknown>[];
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ position: 1, name: "Home" });
    expect(items[2]).toMatchObject({ position: 3, item: "https://x/karim-rahman-cardiologist" });
  });

  it("FAQPage wraps each question with an acceptedAnswer", () => {
    const ld = buildFaqJsonLd([
      { question: "Where does Dr. X practise?", answer: "Dhaka." },
      { question: "Is Dr. X verified?", answer: "Yes." },
    ]);
    expect(ld["@type"]).toBe("FAQPage");
    const main = ld.mainEntity as Record<string, unknown>[];
    expect(main).toHaveLength(2);
    expect(main[0]).toMatchObject({ "@type": "Question", name: "Where does Dr. X practise?" });
    expect((main[0]!.acceptedAnswer as Record<string, unknown>).text).toBe("Dhaka.");
  });

  it("ItemList numbers ListItems from startPosition and points at profile URLs", () => {
    const ld = buildItemListJsonLd({
      items: [
        { slug: "a-cardiologist", name: "Dr A" },
        { slug: "b-cardiologist", name: "Dr B" },
      ],
      startPosition: 21,
      name: "Cardiology doctors in Dhaka",
    });
    expect(ld["@type"]).toBe("ItemList");
    expect(ld.name).toBe("Cardiology doctors in Dhaka");
    const items = ld.itemListElement as Record<string, unknown>[];
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ "@type": "ListItem", position: 21, name: "Dr A" });
    expect(String(items[0]!.url)).toContain("/a-cardiologist");
    expect(items[1]!.position).toBe(22);
  });

  it("Article graph carries headline, author, publisher + ISO dates", () => {
    const ld = buildArticleJsonLd({
      title: "Understanding High Blood Pressure",
      slug: "understanding-high-blood-pressure",
      excerpt: "What the numbers mean and when to worry.",
      authorName: "Dr. A Rahman",
      publishedAt: "2026-06-20T00:00:00.000Z",
      updatedAt: "2026-06-21T00:00:00.000Z",
    });
    expect(ld["@type"]).toEqual(["MedicalWebPage", "Article"]);
    expect(String(ld["@id"])).toContain("/guides/understanding-high-blood-pressure");
    expect(String(ld.headline)).toContain("High Blood Pressure");
    expect((ld.author as Record<string, unknown>).name).toBe("Dr. A Rahman");
    expect((ld.publisher as Record<string, unknown>)["@type"]).toBe("Organization");
    expect(ld.datePublished).toBe("2026-06-20T00:00:00.000Z");
    expect(ld.dateModified).toBe("2026-06-21T00:00:00.000Z");
    expect(ld.inLanguage).toBe("en-BD");
    // Patient audience is always emitted (YMYL signal).
    expect((ld.audience as Record<string, unknown>).audienceType).toBe("Patient");
  });

  it("Article emits reviewedBy + lastReviewed + citation + specialty when provided", () => {
    const ld = pruneJsonLd(
      buildArticleJsonLd({
        title: "Understanding High Blood Pressure",
        slug: "understanding-high-blood-pressure",
        reviewerName: "Dr. Ayesha Rahman",
        reviewerCredential: "MBBS, FCPS (Medicine) · BMDC 12345",
        reviewerProfileUrl: "daktar.link/ayesha-rahman-cardiologist",
        reviewedAt: "2026-06-21T00:00:00.000Z",
        specialties: ["Cardiology", "Medicine"],
        citations: [
          { label: "WHO — Hypertension", url: "https://www.who.int/x", publisher: "WHO" },
          { label: "no url dropped", url: "" },
        ],
      }),
    );
    const reviewedBy = ld.reviewedBy as Record<string, unknown>;
    expect(reviewedBy.name).toBe("Dr. Ayesha Rahman");
    expect(reviewedBy.jobTitle).toContain("FCPS");
    expect(String(reviewedBy.url)).toContain("https://daktar.link/ayesha-rahman-cardiologist");
    expect(ld.lastReviewed).toBe("2026-06-21T00:00:00.000Z");
    expect(ld.specialty).toEqual(["Cardiology", "Medicine"]);
    const citation = ld.citation as Record<string, unknown>[];
    expect(citation).toHaveLength(1); // the url-less entry is filtered out
    expect(citation[0].name).toBe("WHO — Hypertension");
    expect((citation[0].publisher as Record<string, unknown>).name).toBe("WHO");
  });

  it("Article omits review/citation fields when not provided (pruned)", () => {
    const ld = pruneJsonLd(buildArticleJsonLd({ title: "x", slug: "s" }));
    expect(ld.reviewedBy).toBeUndefined();
    expect(ld.lastReviewed).toBeUndefined();
    expect(ld.citation).toBeUndefined();
    expect(ld.specialty).toBeUndefined();
  });

  it("Article locale:bn emits the /bn/guides URL + inLanguage bn", () => {
    const ld = buildArticleJsonLd({ title: "উচ্চ রক্তচাপ", slug: "high-blood-pressure", locale: "bn" });
    expect(String(ld["@id"])).toContain("/bn/guides/high-blood-pressure");
    expect(ld.inLanguage).toBe("bn");
    // default (no locale) stays English at /guides
    const en = buildArticleJsonLd({ title: "x", slug: "high-blood-pressure" });
    expect(String(en["@id"])).toContain("/guides/high-blood-pressure");
    expect(String(en["@id"])).not.toContain("/bn/");
    expect(en.inLanguage).toBe("en-BD");
  });

  it("Article headline caps at 110 chars; author + dateModified fall back", () => {
    const ld = buildArticleJsonLd({ title: "x".repeat(200), slug: "s", publishedAt: "2026-06-20T00:00:00.000Z" });
    expect((ld.headline as string).length).toBeLessThanOrEqual(110);
    expect((ld.author as Record<string, unknown>).name).toBe("Daktar.Link Editorial");
    expect(ld.dateModified).toBe("2026-06-20T00:00:00.000Z"); // falls back to publishedAt
  });

  it("pruneJsonLd strips undefined and empty arrays without mangling valid values", () => {
    const cleaned = pruneJsonLd({
      keep: "yes",
      drop: undefined,
      empty: [],
      arr: [1, 2],
      nested: { keep: "x", drop: undefined },
    });
    expect(cleaned).toEqual({ keep: "yes", arr: [1, 2], nested: { keep: "x" } });
  });
});
