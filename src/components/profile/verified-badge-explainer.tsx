"use client";

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { VerifiedBadge } from "./verified-badge";
import type { VerificationLevel } from "@/types/doctor";

/**
 * Clickable wrapper around <VerifiedBadge> for the PUBLIC profile. Tapping the
 * badge opens a small popover explaining, in plain language, what this profile's
 * verification badge means — including the two-axis breakdown (BMDC registration
 * + government-ID identity) and why the blue "Verified" tick needs both.
 *
 * Client-only (interactivity); the badge itself stays a static presentational
 * atom reused elsewhere. Built with local state + a click-outside catcher to
 * match the existing menu pattern — no popover dependency added.
 */
interface Explanation {
  title: string;
  summary: string;
  bmdc: boolean;
  identity: boolean;
}

const EXPLAIN: Record<VerificationLevel, Explanation> = {
  fully_verified: {
    title: "Verified profile",
    summary:
      "doctor.id.bd has confirmed both this doctor's professional registration and their identity.",
    bmdc: true,
    identity: true,
  },
  bmdc_verified: {
    title: "BMDC verified",
    summary:
      "This doctor's Bangladesh Medical & Dental Council (BMDC) registration has been confirmed.",
    bmdc: true,
    identity: false,
  },
  identity_verified: {
    title: "Identity verified",
    summary: "This person's government-issued photo ID has been confirmed.",
    bmdc: false,
    identity: true,
  },
  unverified: {
    title: "Not verified yet",
    summary: "doctor.id.bd hasn't verified this profile yet.",
    bmdc: false,
    identity: false,
  },
};

export function VerifiedBadgeExplainer({
  level,
  className,
}: {
  level: VerificationLevel;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const meta = EXPLAIN[level];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Verification: ${meta.title}. Tap to learn what it means.`}
        className="cursor-pointer rounded-full transition hover:ring-2 hover:ring-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <VerifiedBadge level={level} className={className} />
      </button>

      {open ? (
        <>
          {/* Click-outside catcher (transparent, full-screen). */}
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-label={`${meta.title} — what this badge means`}
            className="absolute left-0 top-full z-50 mt-2 w-72 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-lg"
          >
            <p className="text-sm font-semibold">{meta.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{meta.summary}</p>
            <ul className="mt-3 space-y-1.5 text-xs">
              <ChecklistItem
                ok={meta.bmdc}
                okText="BMDC registration verified"
                noText="BMDC registration not verified"
              />
              <ChecklistItem
                ok={meta.identity}
                okText="Government ID identity verified"
                noText="Identity not verified"
              />
            </ul>
            <p className="mt-3 border-t border-border pt-2 text-[11px] text-muted-foreground">
              {level === "fully_verified"
                ? "This is the highest trust level on doctor.id.bd."
                : "The blue Verified tick is granted once both checks pass."}
            </p>
          </div>
        </>
      ) : null}
    </span>
  );
}

function ChecklistItem({
  ok,
  okText,
  noText,
}: {
  ok: boolean;
  okText: string;
  noText: string;
}) {
  return (
    <li className="flex items-center gap-2">
      {ok ? (
        <Check className="size-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
      ) : (
        <X className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      )}
      <span className={cn(ok ? "text-foreground" : "text-muted-foreground")}>
        {ok ? okText : noText}
      </span>
    </li>
  );
}
