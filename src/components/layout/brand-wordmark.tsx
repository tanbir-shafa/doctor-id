/**
 * The Daktar.Link wordmark — the product's text logo.
 *
 * Renders the brand name with the `.Link` suffix in the primary (teal) accent
 * so the header reads as a designed wordmark rather than plain text. Pure
 * presentational; pairs with the `BrandMark` "D" glyph in the header chrome.
 * The same app-mark backs the favicon / apple-icon (`src/app/icon.svg`).
 */
export function BrandWordmark({ className }: { className?: string }) {
  return (
    <span className={className}>
      Daktar<span className="text-primary">.Link</span>
    </span>
  );
}
