import { describe, it, expect } from "vitest";
import { buildBadgeSnippets } from "@/lib/seo/embed-badge";

const base = {
  profileUrl: "https://daktar.link/karim-rahman-cardiologist",
  displayName: "Dr. Karim Rahman",
};

describe("embed-badge — backlink snippets", () => {
  it("every variant is a followed anchor pointing at the profile", () => {
    const snippets = buildBadgeSnippets({ ...base, verified: true });
    expect(snippets.length).toBeGreaterThanOrEqual(2);
    for (const s of snippets) {
      expect(s.html).toContain(`href="${base.profileUrl}"`);
      expect(s.html).toContain("<a ");
      expect(s.html).not.toContain('rel="nofollow"'); // backlink must pass equity
    }
    // the name badge carries the doctor's name in the anchor text (best for SEO)
    expect(snippets[0]!.html).toContain("Dr. Karim Rahman");
  });

  it('only claims "Verified" when the doctor is fully verified', () => {
    const verified = buildBadgeSnippets({ ...base, verified: true });
    expect(verified[0]!.html).toContain("Verified on Daktar.Link");

    const unverified = buildBadgeSnippets({ ...base, verified: false });
    expect(unverified[0]!.html).not.toContain("Verified");
    expect(unverified[0]!.html).toContain("on Daktar.Link");
    // no tick svg when unverified
    expect(unverified[0]!.html).not.toContain("<svg");
    expect(verified[0]!.html).toContain("<svg");
  });

  it("escapes the display name to avoid breaking the snippet", () => {
    const evil = buildBadgeSnippets({
      ...base,
      displayName: 'Dr "X" <script>',
      verified: false,
    });
    expect(evil[0]!.html).not.toContain("<script>");
    expect(evil[0]!.html).toContain("&lt;script&gt;");
    expect(evil[0]!.html).toContain("&quot;X&quot;");
  });

  it("offers a light + dark variant", () => {
    const snippets = buildBadgeSnippets({ ...base, verified: true });
    const ids = snippets.map((s) => s.id);
    expect(ids).toContain("name-light");
    expect(ids).toContain("name-dark");
    expect(snippets.find((s) => s.id === "name-dark")!.html).toContain("#0f172a");
  });
});
