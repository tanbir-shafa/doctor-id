import Image from "next/image";
import Link from "next/link";
import { Gift, Calendar, Users, FileText, ArrowRight } from "lucide-react";

/**
 * EMR reward band — the under-hero acquisition hook. Frames 3 months of Shafa
 * EMR as the reward a doctor unlocks by claiming their profile (Shafa Care's
 * actual product is the reason this directory exists — see WhyFreeBand). Bold
 * deep-teal surface so it reads as a highlight directly beneath the hero; the
 * dashboard screenshot's transparent background sits on the teal.
 *
 * Deliberately NOT a "free EMR" giveaway pitch — every lead-in (badge,
 * headline, CTA) is framed as an earned reward for the claim action.
 */
export function EmrRewardBand() {
  return (
    <section className="border-b border-border bg-primary text-primary-foreground">
      <div className="mx-auto max-w-5xl px-4 py-14">
        <div className="grid items-center gap-10 md:grid-cols-2">
          <div className="order-2 md:order-1">
            <Image
              src="/emr-dashboard-mac-16-inch-front.png"
              alt="Shafa EMR dashboard shown on a laptop"
              width={4340}
              height={2860}
              sizes="(min-width: 768px) 48vw, 100vw"
              className="h-auto w-full"
              priority={false}
            />
          </div>
          <div className="order-1 md:order-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white">
              <Gift className="size-3.5" aria-hidden="true" />
              Your reward for claiming your profile
            </span>
            <h2 className="mt-4 text-balance text-2xl font-bold tracking-tight sm:text-3xl">
              Claim your profile, unlock Shafa EMR
            </h2>
            <p className="mt-3 text-primary-foreground/85">
              Go paperless: manage every appointment, patient and prescription in one dashboard.
              New doctors who claim a profile get 3 months free — no card, no catch.
            </p>
            <ul className="mt-5 flex flex-col gap-2.5 text-sm">
              <Feature icon={<Calendar className="size-4" aria-hidden="true" />}>
                Appointments &amp; schedule
              </Feature>
              <Feature icon={<Users className="size-4" aria-hidden="true" />}>
                Patient records &amp; history
              </Feature>
              <Feature icon={<FileText className="size-4" aria-hidden="true" />}>
                Prescriptions &amp; analytics
              </Feature>
            </ul>
            <div className="mt-7">
              <Link
                href="/auth/register"
                className="inline-flex items-center gap-1 rounded-md bg-white px-5 py-2.5 text-sm font-medium text-primary hover:opacity-90"
              >
                Create your profile <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Feature({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2.5 text-primary-foreground">
      <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-white/15 text-white">
        {icon}
      </span>
      {children}
    </li>
  );
}
