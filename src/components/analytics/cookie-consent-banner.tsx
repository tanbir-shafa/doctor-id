"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
 * Cookie notice (opt-out model). Renders only when analytics is configured
 * (NEXT_PUBLIC_GA_MEASUREMENT_ID set) AND there's no stored choice yet. Analytics
 * already runs by default (see <GoogleAnalytics/>); this is a low-key notice that
 * lets a visitor opt OUT. "Decline" persists "denied" (which stops GA), "Got it"
 * persists "granted" so the notice doesn't reappear. The footer "Cookie
 * preferences" control re-opens it via CONSENT_REOPEN_EVENT.
 *
 * Intentionally unobtrusive: a small bottom-corner card, not a full-width bar.
 */
export function CookieConsentBanner() {
  const pathname = usePathname();
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
  // No analytics runs on the admin portal, so there's nothing to consent to there.
  if (pathname?.startsWith("/admin")) return null;
  if (consent !== null && !reopened) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie notice"
      className="fixed bottom-3 left-3 z-40 max-w-xs rounded-lg border border-border bg-card/90 p-3 text-xs shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/70"
    >
      <p className="text-muted-foreground">
        We use analytics cookies to understand how the site is used. You can opt out anytime — see
        our{" "}
        <Link href="/privacy" className="font-medium text-foreground underline underline-offset-2">
          Privacy Policy
        </Link>
        .
      </p>
      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => decide("denied")}
          className="rounded-md px-2.5 py-1 font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Decline
        </button>
        <button
          type="button"
          onClick={() => decide("granted")}
          className="rounded-md bg-primary px-2.5 py-1 font-medium text-primary-foreground hover:opacity-90"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
