"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, ExternalLink, CheckCircle2, X } from "lucide-react";
import { declineEmrAction } from "@/server/actions/emr";

/**
 * Free EMR bundle status banner. Three states:
 *
 *   pending — "we're setting it up", with an inline "Not interested?" link
 *   ready   — green confirmation pointing at the email we sent credentials to
 *   (declined — banner hidden by the parent)
 *
 * The parent server component fetches the user's `emr` subdoc and only
 * renders this when status is pending/ready, so we don't need to handle
 * declined here.
 */
export function EmrBanner({
  seatStatus,
  accountEmail,
}: {
  seatStatus: "pending" | "ready";
  accountEmail: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function decline() {
    setError(null);
    startTransition(async () => {
      const r = await declineEmrAction();
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  if (seatStatus === "ready") {
    return (
      <aside className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        <div className="flex flex-wrap items-start gap-2">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div className="flex-1 space-y-1">
            <p className="font-semibold">Your free Shafa EMR account is ready.</p>
            <p>
              We sent your login to{" "}
              <strong>{accountEmail ?? "your email"}</strong>. Need help? WhatsApp support at{" "}
              <a className="underline" href="https://wa.me/8801700000000" target="_blank" rel="noopener noreferrer">
                +880 1700-000000
              </a>
              .
            </p>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="rounded-lg border border-primary/40 bg-primary/5 px-4 py-3 text-sm text-foreground">
      <div className="flex flex-wrap items-start gap-2">
        <Sparkles className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="flex-1 space-y-1">
          <p className="font-semibold">Your free Shafa EMR account is being set up.</p>
          <p className="text-muted-foreground">
            We&apos;ll email login credentials within 48 hours. Free for 6 months — no card
            required.
          </p>
          <p>
            <a
              href="https://shafacare.com/emr"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              Learn what Shafa EMR does <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          </p>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>
        <button
          type="button"
          onClick={decline}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Decline the free EMR seat"
        >
          <X className="size-3.5" aria-hidden="true" />
          {pending ? "…" : "Not interested"}
        </button>
      </div>
    </aside>
  );
}
