/**
 * Google Analytics 4 — thin, SSR-safe wrapper.
 *
 * The gtag.js script is loaded by <GoogleAnalytics/> only when
 * NEXT_PUBLIC_GA_MEASUREMENT_ID is set (no-op otherwise, mirroring our
 * SES/SMS/Turnstile integrations). These helpers just forward to `window.gtag`
 * when it exists, so call sites stay clean and are safe both before the script
 * has loaded and when analytics is disabled entirely.
 */

import { publicEnv } from "@/lib/env";

export const GA_MEASUREMENT_ID = publicEnv.NEXT_PUBLIC_GA_MEASUREMENT_ID;
export const analyticsEnabled = Boolean(GA_MEASUREMENT_ID);

/** Conversion + funnel events we deliberately track. */
export type AnalyticsEvent =
  | "sign_up" // GA4 recommended — doctor registration completed
  | "login" // GA4 recommended — doctor signed in
  | "otp_requested" // OTP/SMS send initiated (register / login / claim)
  | "claim_start" // a profile-claim flow began
  | "appointment_request"; // public appointment request submitted

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/** Fire a GA4 event. Safe no-op until gtag.js has loaded / when disabled. */
export function trackEvent(name: AnalyticsEvent, params: Record<string, unknown> = {}): void {
  if (typeof window === "undefined") return;
  window.gtag?.("event", name, params);
}

/** Manual SPA page_view (App Router doesn't auto-fire on client navigations). */
export function pageview(path: string): void {
  if (typeof window === "undefined") return;
  window.gtag?.("event", "page_view", {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
  });
}
