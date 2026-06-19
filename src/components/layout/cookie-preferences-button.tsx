"use client";

import { analyticsEnabled } from "@/lib/analytics/gtag";
import { reopenConsent } from "@/lib/analytics/consent";

/**
 * Footer control that re-opens the cookie-consent banner so a visitor can change
 * a previous choice. Hidden when analytics isn't configured (nothing to manage).
 */
export function CookiePreferencesButton() {
  if (!analyticsEnabled) return null;
  return (
    <button type="button" onClick={reopenConsent} className="hover:text-foreground">
      Cookie preferences
    </button>
  );
}
