"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { analyticsEnabled } from "@/lib/analytics/gtag";
import {
  readConsent,
  writeConsent,
  CONSENT_EVENT,
  CONSENT_REOPEN_EVENT,
  type ConsentValue,
} from "@/lib/analytics/consent";

function subscribeConsent(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CONSENT_EVENT, callback);
  return () => window.removeEventListener(CONSENT_EVENT, callback);
}

/**
 * Cookie-consent banner. Renders only when analytics is configured
 * (NEXT_PUBLIC_GA_MEASUREMENT_ID set) AND there's no stored choice yet — when
 * there's nothing non-essential to consent to, there's no banner. Accept/Decline
 * persists the choice (which <GoogleAnalytics/> reacts to); the footer "Cookie
 * preferences" control re-opens it via CONSENT_REOPEN_EVENT.
 */
export function CookieConsentBanner() {
  const consent = useSyncExternalStore(subscribeConsent, readConsent, () => null);
  const [reopened, setReopened] = useState(false);

  useEffect(() => {
    const onReopen = () => setReopened(true);
    window.addEventListener(CONSENT_REOPEN_EVENT, onReopen);
    return () => window.removeEventListener(CONSENT_REOPEN_EVENT, onReopen);
  }, []);

  function decide(value: ConsentValue) {
    writeConsent(value);
    setReopened(false);
  }

  if (!analyticsEnabled) return null;
  if (consent !== null && !reopened) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80"
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="text-sm text-muted-foreground">
          We use analytics cookies to understand how the site is used. They load only if you accept,
          and not at all if you decline. See our{" "}
          <Link href="/privacy" className="font-medium text-foreground underline underline-offset-2">
            Privacy Policy
          </Link>
          .
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => decide("denied")}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={() => decide("granted")}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
