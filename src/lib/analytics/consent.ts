/**
 * Cookie-consent state for non-essential analytics (Google Analytics).
 *
 * Strictly-necessary cookies (Turnstile, the consent cookie itself) do not need
 * consent. GA is gated: <GoogleAnalytics/> loads gtag.js ONLY when the stored
 * choice is "granted", so no analytics cookie/script exists until the visitor
 * accepts — matching the Privacy Policy. The choice is kept in a first-party
 * cookie so it survives reloads; changes broadcast a window event so the GA
 * loader reacts without a full page reload.
 */

export type ConsentValue = "granted" | "denied";

export const CONSENT_COOKIE = "dl_consent";
/** Fired (with `detail: ConsentValue`) when the choice is set. GA loader listens. */
export const CONSENT_EVENT = "dl-consent";
/** Fired when the footer "Cookie preferences" control asks the banner to reappear. */
export const CONSENT_REOPEN_EVENT = "dl-consent-reopen";

const MAX_AGE_SECONDS = 60 * 60 * 24 * 180; // 180 days

export function readConsent(): ConsentValue | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)dl_consent=(granted|denied)/);
  return m ? (m[1] as ConsentValue) : null;
}

export function writeConsent(value: ConsentValue): void {
  if (typeof document === "undefined") return;
  const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${value}; Max-Age=${MAX_AGE_SECONDS}; Path=/; SameSite=Lax${secure}`;
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: value }));
}

/** Re-open the consent banner so a visitor can change a previous choice. */
export function reopenConsent(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CONSENT_REOPEN_EVENT));
}
