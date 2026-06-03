import type { ReactNode } from "react";
import Link from "next/link";
import { FileText, QrCode, Share2, ArrowRight } from "lucide-react";

/**
 * "Every prescription is your billboard." Reframes the platform from a listing
 * into a free marketing toolkit — the Rx pad, QR business card, and WhatsApp
 * card are all already shipped; here we sell them as the payoff for claiming,
 * and the viral loop (patient scans QR → lands on profile → refers) starts.
 */
export function BillboardShowcase() {
  return (
    <section className="border-b border-border bg-background">
      <div className="mx-auto max-w-5xl px-4 py-14">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-balance text-2xl font-bold tracking-tight sm:text-3xl">
            Every prescription you write becomes your billboard
          </h2>
          <p className="mt-3 text-muted-foreground">
            Claim your profile and get a free toolkit that turns each patient visit into the
            next. Print it, hand it out, share it where your patients already are.
          </p>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          <Asset
            icon={<FileText className="size-6" aria-hidden="true" />}
            title="Prescription pad (PDF)"
            desc="A free A5 pad with your name, BMDC#, chambers, and a QR code to your profile. Patients scan it and find you again."
          />
          <Asset
            icon={<QrCode className="size-6" aria-hidden="true" />}
            title="QR business card"
            desc="A print-ready card for your chamber desk and visiting cards. Every scan lands a patient on your profile."
          />
          <Asset
            icon={<Share2 className="size-6" aria-hidden="true" />}
            title="WhatsApp & Facebook card"
            desc="A square share card for your WhatsApp Status and Facebook page — built for the channels you already use."
          />
        </div>
        <div className="mt-8 text-center">
          <Link
            href="/#claim"
            className="inline-flex items-center gap-1 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Get your free toolkit <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function Asset({ icon, title, desc }: { icon: ReactNode; title: string; desc: string }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-border bg-card p-6 text-center">
      <span className="inline-flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
        {icon}
      </span>
      <h3 className="mt-4 font-semibold text-foreground">{title}</h3>
      <p className="mt-1.5 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}
