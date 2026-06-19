"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { GA_MEASUREMENT_ID, analyticsEnabled, pageview } from "@/lib/analytics/gtag";
import { readConsent, CONSENT_EVENT } from "@/lib/analytics/consent";

function subscribeConsent(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CONSENT_EVENT, callback);
  return () => window.removeEventListener(CONSENT_EVENT, callback);
}

/**
 * GA4 loader + SPA page_view tracker. Loads gtag.js ONLY when analytics is
 * configured (NEXT_PUBLIC_GA_MEASUREMENT_ID set) AND the visitor has consented
 * (cookie-consent banner → "granted"), so no analytics cookie/script exists
 * before consent. Consent is read via useSyncExternalStore so a change (Accept
 * in the banner) flips GA on live, with no reload and no hydration mismatch.
 * The gtag `config` fires the initial page_view; we fire subsequent
 * client-navigation page_views ourselves, skipping the first effect run to avoid
 * a double count. Only `usePathname` is used (no `useSearchParams`), so no
 * Suspense is required.
 */
export function GoogleAnalytics() {
  const pathname = usePathname();
  const isInitial = useRef(true);
  const consent = useSyncExternalStore(subscribeConsent, readConsent, () => null);

  const active = analyticsEnabled && consent === "granted";

  useEffect(() => {
    if (!active) return;
    if (isInitial.current) {
      isInitial.current = false;
      return;
    }
    pageview(pathname);
  }, [pathname, active]);

  if (!active || !GA_MEASUREMENT_ID) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_MEASUREMENT_ID}');`}
      </Script>
    </>
  );
}
