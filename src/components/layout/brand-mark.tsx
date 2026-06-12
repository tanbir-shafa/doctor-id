/**
 * The Daktar.Link "D" app-mark — a medical cross cut into a D on a teal tile.
 *
 * Identical artwork to `src/app/icon.svg` (favicon / apple-icon), so the mark
 * stays consistent across the browser tab and any in-app placement. Pure
 * presentational SVG (no hooks) → usable from both server and client
 * components. Size it with `className` (e.g. `size-16`); the viewBox scales.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="dl-mark-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#15a9ad" />
          <stop offset="1" stopColor="#0b7882" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill="url(#dl-mark-grad)" />
      <path
        fill="#ffffff"
        fillRule="evenodd"
        d="M18 15 L31 15 C42 15 49 22.5 49 32 C49 41.5 42 49 31 49 L18 49 Z M28 25 H34 V29 H38 V35 H34 V39 H28 V35 H24 V29 H28 Z"
      />
    </svg>
  );
}
