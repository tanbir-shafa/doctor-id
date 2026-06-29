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
 * GA4 loader + SPA page_view tracker. Opt-out model: gtag.js loads as soon as
 * analytics is configured (NEXT_PUBLIC_GA_MEASUREMENT_ID set), BEFORE any banner
 * interaction — it stops only if the visitor explicitly chose "denied". Consent
 * is read via useSyncExternalStore so a later Decline flips GA off live, with no
 * reload and no hydration mismatch. The gtag `config` fires the initial
 * page_view; we fire subsequent client-navigation page_views ourselves, skipping
 * the first effect run to avoid a double count. Only `usePathname` is used (no
 * `useSearchParams`), so no Suspense is required.
 *
 * The admin portal (`/admin/*`) is excluded entirely — it's an internal
 * authenticated tool, not a marketing surface, so we neither load gtag.js nor
 * emit page_views there.
 *
 * The server/initial-hydration snapshot is "denied" (not the real value): during
 * SSR and the first client render we can't read the cookie reliably, and since
 * `null !== "denied"` would otherwise let gtag mount for a visitor who actually
 * declined — and once next/script injects gtag, unmounting can't remove it — we
 * default to NOT loading until the post-hydration client snapshot reports the
 * true cookie value. useSyncExternalStore is built for this server/client
 * snapshot divergence (it re-renders after hydration, no mismatch warning).
 */
export function GoogleAnalytics() {
  const pathname = usePathname();
  const isInitial = useRef(true);
  const consent = useSyncExternalStore(subscribeConsent, readConsent, () => "denied" as const);

  const isAdmin = pathname?.startsWith("/admin") ?? false;
  const active = analyticsEnabled && consent !== "denied" && !isAdmin;

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
