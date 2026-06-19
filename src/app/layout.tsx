import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { publicEnv } from "@/lib/env";
import { buildOrganizationJsonLd, buildWebSiteJsonLd, pruneJsonLd } from "@/lib/seo/jsonld";
import { GoogleAnalytics } from "@/components/analytics/google-analytics";
import { CookieConsentBanner } from "@/components/analytics/cookie-consent-banner";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.NEXT_PUBLIC_APP_URL),
  title: {
    default: "Daktar.Link — Bangladesh's verified doctor directory",
    template: "%s · Daktar.Link",
  },
  description:
    "Find verified specialist doctors across Bangladesh. Chambers, schedules, qualifications, and direct contact — all in one verified profile.",
  applicationName: "Daktar.Link",
  authors: [{ name: "Shafa Care Ltd", url: "https://shafa.care" }],
  openGraph: {
    type: "website",
    siteName: "Daktar.Link",
    locale: "en_BD",
  },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true },
  // Search Console / Bing Webmaster ownership tags. No-op until the tokens are
  // set (see lib/env.ts). The sitemap is already advertised in robots.txt.
  verification: {
    google: publicEnv.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || undefined,
    other: publicEnv.NEXT_PUBLIC_BING_SITE_VERIFICATION
      ? { "msvalidate.01": publicEnv.NEXT_PUBLIC_BING_SITE_VERIFICATION }
      : undefined,
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <GoogleAnalytics />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(pruneJsonLd(buildOrganizationJsonLd())) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(pruneJsonLd(buildWebSiteJsonLd())) }}
        />
        {children}
        <CookieConsentBanner />
      </body>
    </html>
  );
}
