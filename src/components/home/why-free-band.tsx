import type { ReactNode } from "react";
import Link from "next/link";
import { HeartHandshake, Check } from "lucide-react";

/**
 * Closing objection-handler. BD doctors are rightly wary of "free" platforms
 * that monetize them later — so we name the business model plainly, and add the
 * free 3-month Shafa EMR seat as the bridge to Shafa Care's actual product
 * (the reason this directory exists).
 */
export function WhyFreeBand() {
  return (
    <section className="bg-background">
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <span className="inline-flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <HeartHandshake className="size-6" aria-hidden="true" />
        </span>
        <h2 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">Why is this free?</h2>
        <p className="mt-3 text-muted-foreground">
          Daktar.Link is built by Shafa Care. The directory is our gift to the profession —
          we grow when Bangladesh&apos;s doctors do. Claim your profile free, and get 3 months
          of Shafa EMR free too. No card required.
        </p>
        <ul className="mx-auto mt-6 flex max-w-md flex-col gap-2 text-left text-sm">
          <Point>Free verified public profile — yours to keep</Point>
          <Point>Reviewed within 24 hours by a real person</Point>
          <Point>3 months of Shafa EMR, free — no card, no catch</Point>
        </ul>
        <div className="mt-8">
          <Link
            href="/#claim"
            className="inline-flex items-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Claim your profile — free
          </Link>
        </div>
      </div>
    </section>
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
