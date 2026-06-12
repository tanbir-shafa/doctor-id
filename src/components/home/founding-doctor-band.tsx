import type { ReactNode } from "react";
import Link from "next/link";
import { Award, Search, BadgeCheck, ArrowRight } from "lucide-react";
import { FoundingDoctorBadge } from "@/components/profile/founding-doctor-badge";
import { FOUNDING_DOCTOR_THRESHOLD } from "@/lib/utils/referral";

/**
 * Founding Doctor program — the referral growth loop. A doctor who refers
 * FOUNDING_DOCTOR_THRESHOLD doctors who get verified earns a permanent gold
 * badge + top placement in search. The amber/gold accent distinguishes this
 * reward surface from the teal trust/verification sections.
 *
 * The ৳120,000 figure is an honest *value framing* (≈ ৳12,000/yr of priority ad
 * placement × 10 years), not a guarantee — phrased as "estimated" throughout.
 */
export function FoundingDoctorBand({ foundingCount = 0 }: { foundingCount?: number }) {
  return (
    <section className="border-b border-border bg-amber-50/40">
      <div className="mx-auto max-w-5xl px-4 py-14">
        <div className="mx-auto max-w-2xl text-center">
          <div className="flex justify-center">
            <FoundingDoctorBadge isFounding />
          </div>
          <h2 className="mt-4 text-balance text-2xl font-bold tracking-tight sm:text-3xl">
            Become a Founding Doctor
          </h2>
          <p className="mt-3 text-muted-foreground">
            Refer {FOUNDING_DOCTOR_THRESHOLD} doctors who get verified on Daktar.Link and earn a
            permanent Founding Doctor badge — with benefits worth a lifetime.
            {foundingCount > 0
              ? ` Join ${Intl.NumberFormat("en-IN").format(foundingCount)} founding ${foundingCount === 1 ? "doctor" : "doctors"} already onboard.`
              : ""}
          </p>
        </div>

        <div className="mx-auto mt-8 max-w-xl rounded-xl border border-amber-200 bg-card p-6 text-center">
          <p className="text-4xl font-bold tracking-tight text-amber-700">≈ ৳1,20,000</p>
          <p className="mt-1 text-sm text-muted-foreground">
            estimated lifetime value of permanent top-of-search placement (≈ ৳12,000/yr × 10 years
            of priority ad placement).
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          <Benefit
            icon={<Search className="size-6" aria-hidden="true" />}
            title="Top of every search"
            desc="Founding Doctors rank above all other profiles in search and specialty listings — permanently."
          />
          <Benefit
            icon={<Award className="size-6" aria-hidden="true" />}
            title="Worth ≈ ৳1,20,000"
            desc="That permanent top placement is like 10 years of priority ad spend — yours free, for life."
          />
          <Benefit
            icon={<BadgeCheck className="size-6" aria-hidden="true" />}
            title="A gold badge patients trust"
            desc="A distinct Founding Doctor badge marks you as an early, trusted leader on the platform."
          />
        </div>

        <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-muted-foreground">
          <strong className="text-foreground">How it works:</strong> share your referral link →{" "}
          {FOUNDING_DOCTOR_THRESHOLD} referred doctors get approved → your Founding Doctor badge
          unlocks automatically.
        </p>

        <div className="mt-6 text-center">
          <Link
            href="/dashboard/referrals"
            className="inline-flex items-center gap-1 rounded-md bg-amber-600 px-5 py-2.5 text-sm font-medium text-white hover:opacity-90"
          >
            Get your referral link <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function Benefit({ icon, title, desc }: { icon: ReactNode; title: string; desc: string }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-amber-200 bg-card p-6 text-center">
      <span className="inline-flex size-12 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
        {icon}
      </span>
      <h3 className="mt-4 font-semibold text-foreground">{title}</h3>
      <p className="mt-1.5 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}
