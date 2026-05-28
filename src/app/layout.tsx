import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { publicEnv } from "@/lib/env";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.NEXT_PUBLIC_APP_URL),
  title: {
    default: "doctor.id.bd — Bangladesh's verified doctor directory",
    template: "%s · doctor.id.bd",
  },
  description:
    "Find verified specialist doctors across Bangladesh. Chambers, schedules, qualifications, and direct contact — all in one verified profile.",
  applicationName: "doctor.id.bd",
  authors: [{ name: "Shafa Care Ltd", url: "https://shafa.care" }],
  openGraph: {
    type: "website",
    siteName: "doctor.id.bd",
    locale: "en_BD",
  },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">{children}</body>
    </html>
  );
}
