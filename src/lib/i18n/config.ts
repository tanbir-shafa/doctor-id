/**
 * Locale configuration + pure URL helpers for the bilingual (en/bn) layer.
 *
 * URL strategy (bilingual-ux-seo.md D1): English is the default and stays
 * **unprefixed** (`/cardiology`); Bangla lives under **`/bn`** (`/bn/cardiology`).
 * These helpers are pure + DB-less so they're unit-testable and safe in any
 * boundary. They do NOT wire next-intl routing — that (middleware + proxy
 * composition) is the runtime migration in task 43, verified live before merge.
 */

export const LOCALES = ["en", "bn"] as const;
export type AppLocale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: AppLocale = "en";

export function isAppLocale(value: string): value is AppLocale {
  return (LOCALES as readonly string[]).includes(value);
}

/** Prefix a default-locale path for `locale` ("/x" → "/bn/x"); en stays unprefixed. */
export function localizedPath(locale: AppLocale, path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  if (locale === DEFAULT_LOCALE) return clean;
  return clean === "/" ? `/${locale}` : `/${locale}${clean}`;
}

/** Split a path into its locale + the default-locale (unprefixed) path. */
export function parseLocalePath(path: string): { locale: AppLocale; path: string } {
  const m = /^\/(bn)(\/.*)?$/.exec(path);
  if (m) return { locale: m[1] as AppLocale, path: m[2] && m[2].length > 0 ? m[2] : "/" };
  return { locale: DEFAULT_LOCALE, path: path || "/" };
}

/**
 * Reciprocal `hreflang` map for Next's `metadata.alternates.languages`, given
 * the English (default-locale, unprefixed) path. Next resolves these against
 * `metadataBase` into absolute URLs. Both locales list both alternates +
 * `x-default` (en) — reciprocity is required or Google ignores the pairing.
 */
export function hreflangAlternates(enPath: string): Record<string, string> {
  const en = enPath.startsWith("/") ? enPath : `/${enPath}`;
  return {
    "en-BD": en,
    "bn-BD": localizedPath("bn", en),
    "x-default": en,
  };
}
