import Link from "next/link";
import { X } from "lucide-react";

type SearchParams = Record<string, string | string[] | undefined>;

/** Params that count as "filters" (excludes sort, page, view). */
const FILTER_KEYS = ["q", "specialty", "city", "verificationLevel", "gender", "language"] as const;

const VERIFICATION_LABELS: Record<string, string> = {
  fully_verified: "Fully verified",
  bmdc_verified: "BMDC verified",
  unverified: "Unverified",
};
const GENDER_LABELS: Record<string, string> = {
  male: "Male",
  female: "Female",
  other: "Other",
};
const KEY_PREFIX: Partial<Record<(typeof FILTER_KEYS)[number], string>> = {
  q: "Search",
  city: "City",
  language: "Speaks",
};

function value(sp: SearchParams, key: string): string | undefined {
  const v = sp[key];
  return typeof v === "string" && v.trim() ? v : undefined;
}

/**
 * How many filters are currently applied — drives the mobile filter-icon badge.
 * Pass `excludeQuery` to ignore the search term (which has its own always-visible
 * field on mobile), so the badge counts only the filters hidden behind the icon.
 */
export function countActiveFilters(sp: SearchParams, opts?: { excludeQuery?: boolean }): number {
  return FILTER_KEYS.filter((k) => {
    if (opts?.excludeQuery && k === "q") return false;
    return value(sp, k);
  }).length;
}

function chipText(key: (typeof FILTER_KEYS)[number], val: string): string {
  const label =
    key === "verificationLevel"
      ? (VERIFICATION_LABELS[val] ?? val)
      : key === "gender"
        ? (GENDER_LABELS[val] ?? val)
        : val;
  const prefix = KEY_PREFIX[key];
  return prefix ? `${prefix}: ${label}` : label;
}

/** URL with one filter removed (and pagination reset), preserving the rest. */
function hrefWithout(sp: SearchParams, removeKey: string): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k === removeKey || k === "page") continue;
    if (typeof v === "string" && v) params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `/search?${qs}` : "/search";
}

/**
 * Shows the search query and filters currently applied, as removable chips.
 * Each chip links to the same search with that filter cleared; "Clear all"
 * drops every filter but keeps the chosen layout (`view`). Renders nothing
 * when no filters are active. Server-rendered — the chips are plain links.
 */
export function ActiveFilters({ sp }: { sp: SearchParams }) {
  const active = FILTER_KEYS.map((key) => ({ key, val: value(sp, key) })).filter(
    (f): f is { key: (typeof FILTER_KEYS)[number]; val: string } => Boolean(f.val),
  );
  if (active.length === 0) return null;

  const clearAll = (() => {
    const params = new URLSearchParams();
    if (typeof sp.view === "string" && sp.view) params.set("view", sp.view);
    const qs = params.toString();
    return qs ? `/search?${qs}` : "/search";
  })();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground">Applied:</span>
      {active.map(({ key, val }) => (
        <Link
          key={key}
          href={hrefWithout(sp, key)}
          className="group inline-flex max-w-[16rem] items-center gap-1 rounded-full border border-border bg-card py-1 pl-2.5 pr-1.5 text-xs text-foreground transition-colors hover:border-primary hover:bg-accent"
          aria-label={`Remove filter ${chipText(key, val)}`}
        >
          <span className="truncate">{chipText(key, val)}</span>
          <X
            className="size-3.5 shrink-0 text-muted-foreground group-hover:text-primary"
            aria-hidden="true"
          />
        </Link>
      ))}
      <Link href={clearAll} className="text-xs font-medium text-primary hover:underline">
        Clear all
      </Link>
    </div>
  );
}
