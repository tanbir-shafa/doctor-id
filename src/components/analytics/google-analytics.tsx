"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { GA_MEASUREMENT_ID, analyticsEnabled, pageview } from "@/lib/analytics/gtag";

/**
 * GA4 loader + SPA page_view tracker. Renders nothing (and loads no script)
 * unless NEXT_PUBLIC_GA_MEASUREMENT_ID is set, so it's a clean no-op in dev and
 * until an ID is provisioned.
 *
 * The gtag `config` fires the initial page_view automatically; we fire
 * subsequent client-navigation page_views ourselves (skipping the first effect
 * run so the landing page isn't counted twice). Only `usePathname` is used (no
 * `useSearchParams`), so no Suspense boundary is required.
 */
export function GoogleAnalytics() {
  const pathname = usePathname();
  const isInitial = useRef(true);

  useEffect(() => {
    if (!analyticsEnabled) return;
    if (isInitial.current) {
      isInitial.current = false;
      return;
    }
    pageview(pathname);
  }, [pathname]);

  if (!analyticsEnabled || !GA_MEASUREMENT_ID) return null;

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
