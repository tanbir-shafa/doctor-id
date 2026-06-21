import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  BadgeCheck,
  Search,
  FileText,
  Globe,
  CalendarCheck,
  BarChart3,
  Languages,
  Stethoscope,
  Check,
} from "lucide-react";
import { buildBreadcrumbJsonLd, pruneJsonLd } from "@/lib/seo/jsonld";
import { publicEnv } from "@/lib/env";

const REGISTER = "/auth/register";

export const metadata: Metadata = {
  title: "For doctors — your free verified profile",
  description:
    "Claim your free, BMDC-verified public profile on Daktar.Link. Rank for your own name, share a verified link, take appointment requests, and get 3 months of Shafa EMR free.",
  alternates: { canonical: `${publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/for-doctors` },
};

const PERKS: { icon: typeof Search; title: string; body: string }[] = [
  {
    icon: Search,
    title: "Rank for your own name",
    body: "When a patient searches your name, they find your real, accurate profile — not a scraped or outdated listing on someone else's site.",
  },
  {
    icon: BadgeCheck,
    title: "The blue Verified tick",
    body: "Verify your BMDC registration and identity once. The blue tick tells patients your profile is genuine — the trust signal that wins the click.",
  },
  {
    icon: FileText,
    title: "Free prescription pad",
    body: "A printable A5 pad with your name, BMDC number, chambers and a QR code to your profile. Every prescription you hand out points patients back to you.",
  },
  {
    icon: Globe,
    title: "Add-to-website badge",
    body: "Drop a verified badge on your clinic or personal site that links straight to your profile — one more way patients (and search engines) find you.",
  },
  {
    icon: CalendarCheck,
    title: "Appointment requests",
    body: "Let patients request an appointment from your profile (opt-in). You stay in control of your phone number and your schedule.",
  },
  {
    icon: BarChart3,
    title: "See your reach",
    body: "Simple analytics show how many patients viewed your profile, so you know the listing is working for you.",
  },
  {
    icon: Languages,
    title: "Found in Bangla too",
    body: "Your listing is discoverable in both English and Bangla, so patients searching either way can find you.",
  },
  {
    icon: Stethoscope,
    title: "3 months of Shafa EMR, free",
    body: "As a thank-you, get 3 months of Shafa Care's EMR free — no card, no catch. Keep it if it helps your practice.",
  },
];

const STEPS: { n: number; title: string; body: string }[] = [
  {
    n: 1,
    title: "Register in minutes",
    body: "Enter your BMDC number and phone, confirm with an OTP, and take a quick live selfie so we know it's really you.",
  },
  {
    n: 2,
    title: "We verify you",
    body: "A real person reviews your details — usually within 24 hours — and matches them to public BMDC records.",
  },
  {
    n: 3,
    title: "Publish & get found",
    body: "Complete your profile and publish. Patients searching for your name or your specialty start finding you.",
  },
];

export default function ForDoctorsPage() {
  const base = publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const breadcrumbLd = pruneJsonLd(
    buildBreadcrumbJsonLd([
      { name: "Home", url: `${base}/` },
      { name: "For doctors", url: `${base}/for-doctors` },
    ]),
  );

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />

      {/* Hero */}
      <section className="border-b border-border bg-muted/30">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:py-20">
          <p className="text-sm font-medium uppercase tracking-wider text-primary">For doctors</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Your verified public profile — free, and yours to keep
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            Daktar.Link is the verified, authentic directory of Bangladesh&apos;s doctors. Claim your
            profile so patients searching online find the real you — with your credentials, chambers
            and schedule, exactly as you want them shown.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={REGISTER}
              className="inline-flex items-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Register or claim your profile — free
            </Link>
            <Link
              href="/how-verification-works"
              className="inline-flex items-center rounded-md border border-border px-6 py-3 text-sm font-medium text-foreground hover:bg-accent"
            >
              How verification works
            </Link>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            No card required. Already listed? Registering lets you claim and correct your existing
            profile.
          </p>
        </div>
      </section>

      {/* Perks */}
      <section className="bg-background">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
            What you get
          </h2>
          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {PERKS.map((p) => {
              const Icon = p.icon;
              return (
                <div key={p.title} className="rounded-xl border border-border bg-card p-5">
                  <span className="inline-flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-3 font-semibold text-foreground">{p.title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{p.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-y border-border bg-muted/30">
        <div className="mx-auto max-w-5xl px-4 py-16">
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
            How it works
          </h2>
          <ol className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="text-center">
                <span className="inline-flex size-10 items-center justify-center rounded-full bg-primary text-base font-bold text-primary-foreground">
                  {s.n}
                </span>
                <h3 className="mt-4 font-semibold text-foreground">{s.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Why free + final CTA */}
      <section className="bg-background">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Why is it free?</h2>
          <p className="mt-3 text-muted-foreground">
            Daktar.Link is built by Shafa Care Ltd. The directory is our contribution to the
            profession — we grow when Bangladesh&apos;s doctors do. Your profile stays free; the
            3-month Shafa EMR offer is our way of introducing you to the product we&apos;re building.
          </p>
          <ul className="mx-auto mt-6 flex max-w-md flex-col gap-2 text-left text-sm">
            <Point>Free verified public profile — yours to keep</Point>
            <Point>Reviewed within 24 hours by a real person</Point>
            <Point>You control your contact details and appointment settings</Point>
          </ul>
          <div className="mt-8">
            <Link
              href={REGISTER}
              className="inline-flex items-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Register or claim your profile — free
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

function Point({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Check className="mt-0.5 size-4 shrink-0 text-green-600" aria-hidden="true" />
      <span className="text-foreground">{children}</span>
    </li>
  );
}
