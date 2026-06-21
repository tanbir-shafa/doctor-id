/**
 * "Add to your website" embed badge (SEO task 36 — the off-page / backlink loop).
 *
 * A doctor pastes one of these snippets on their own clinic/personal site. Each
 * is a real, **followed** `<a>` linking back to their public `/[slug]` profile —
 * a backlink to both the profile and the daktar.link domain that no competitor
 * can buy. We deliberately use a plain inline-styled HTML anchor (not an
 * `<iframe>` or a script) so the link passes equity and renders on any site
 * without their CSS.
 *
 * Accuracy (legal posture): the word "Verified" only appears when the doctor is
 * fully verified (blue tick). Otherwise the copy is a neutral "on Daktar.Link".
 *
 * Pure + deterministic so it's unit-testable and safe in any boundary.
 */

export interface BadgeSnippet {
  id: string;
  label: string;
  description: string;
  /** The ready-to-paste HTML. */
  html: string;
}

export interface BadgeInput {
  /** Absolute URL of the doctor's public profile. */
  profileUrl: string;
  /** The doctor's display name (e.g. "Dr. Karim Rahman"). */
  displayName: string;
  /** True only when fully verified (blue tick) — gates the word "Verified". */
  verified: boolean;
}

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

/** Blue verified seal (circle + check). `mono` renders it white for dark pills. */
function tickSvg(mono = false): string {
  const circle = mono ? "#ffffff" : "#2563eb";
  const check = mono ? "#0f172a" : "#ffffff";
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="flex:none"><circle cx="12" cy="12" r="10" fill="${circle}"/><path d="M7.5 12.5l3 3 6-6.5" stroke="${check}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function pill(profileUrl: string, inner: string, style: string): string {
  return `<a href="${escapeHtml(profileUrl)}" target="_blank" rel="noopener" style="${style}">${inner}</a>`;
}

const LIGHT = `display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border:1px solid #e2e8f0;border-radius:9999px;background:#ffffff;color:#0f172a;font:600 14px/1.2 ${FONT};text-decoration:none;box-shadow:0 1px 2px rgba(15,23,42,0.08)`;
const DARK = `display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border:1px solid #1e293b;border-radius:9999px;background:#0f172a;color:#f8fafc;font:600 14px/1.2 ${FONT};text-decoration:none`;

/**
 * The embeddable badge variants for a doctor. Order = recommended first.
 * `verified` controls whether the tick + the word "Verified" appear.
 */
export function buildBadgeSnippets(input: BadgeInput): BadgeSnippet[] {
  const name = escapeHtml(input.displayName);
  const tag = input.verified ? "Verified on Daktar.Link" : "on Daktar.Link";
  const namePart = input.verified ? `${name} · Verified on Daktar.Link` : `${name} on Daktar.Link`;

  return [
    {
      id: "name-light",
      label: "Name badge (recommended)",
      description:
        "Best for SEO — the link text includes your name, which strengthens searches for you.",
      html: pill(input.profileUrl, `${input.verified ? tickSvg() : ""}<span>${namePart}</span>`, LIGHT),
    },
    {
      id: "compact-light",
      label: "Compact badge",
      description: "A small seal for footers or sidebars.",
      html: pill(input.profileUrl, `${input.verified ? tickSvg() : ""}<span>${tag}</span>`, LIGHT),
    },
    {
      id: "name-dark",
      label: "Name badge — dark",
      description: "For dark backgrounds.",
      html: pill(input.profileUrl, `${input.verified ? tickSvg(true) : ""}<span>${namePart}</span>`, DARK),
    },
  ];
}
