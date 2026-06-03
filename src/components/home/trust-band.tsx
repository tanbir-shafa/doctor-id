import type { ReactNode } from "react";
import Link from "next/link";
import { ShieldCheck, BadgeCheck, ShieldQuestion } from "lucide-react";

/**
 * Trust band — our defensible differentiator. In a market with tens of
 * thousands of unregistered practitioners, BMDC verification (NOT patient
 * reviews) is the trust signal a real doctor is proud to display.
 */
export function TrustBand() {
  return (
    <section className="border-b border-border bg-background">
      <div className="mx-auto max-w-5xl px-4 py-14">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-balance text-2xl font-bold tracking-tight sm:text-3xl">
            Patients can&apos;t tell the real doctors from the fakes. Be the one they trust.
          </h2>
          <p className="mt-3 text-muted-foreground">
            Bangladesh has thousands of unregistered practitioners. The BMDC-verified badge
            on your profile sets you apart — reviewed by a real person, within 24 hours, free.
          </p>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          <Tier
            icon={<ShieldQuestion className="size-5" aria-hidden="true" />}
            tone="bg-muted text-muted-foreground"
            title="Unverified"
            desc="A claimed profile, not yet checked. Patients can see it, but with no trust mark."
          />
          <Tier
            icon={<BadgeCheck className="size-5" aria-hidden="true" />}
            tone="bg-primary/10 text-primary"
            title="BMDC verified"
            desc="Your BMDC registration is confirmed — the badge patients look for."
          />
          <Tier
            icon={<ShieldCheck className="size-5" aria-hidden="true" />}
            tone="bg-green-100 text-green-900"
            title="Fully verified"
            desc="BMDC and identity confirmed — the highest trust tier, ranked first in search."
          />
        </div>
        <div className="mt-8 text-center">
          <Link
            href="/#claim"
            className="inline-flex items-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Get your verified badge — free
          </Link>
        </div>
      </div>
    </section>
  );
}

function Tier({
  icon,
  tone,
  title,
  desc,
}: {
  icon: ReactNode;
  tone: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <span className={`inline-flex size-10 items-center justify-center rounded-full ${tone}`}>
        {icon}
      </span>
      <h3 className="mt-3 font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}
