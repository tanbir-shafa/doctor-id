import { BadgeCheck, ShieldCheck, IdCard, ShieldQuestion } from "lucide-react";
import { cn } from "@/lib/utils";
import type { VerificationLevel } from "@/types/doctor";

const COPY: Record<VerificationLevel, { label: string; tone: string }> = {
  // The "blue tick" — earned only when BOTH BMDC and account/identity are verified.
  fully_verified: { label: "Verified", tone: "bg-sky-100 text-sky-700" },
  bmdc_verified: { label: "BMDC verified", tone: "bg-primary/10 text-primary" },
  identity_verified: { label: "Identity verified", tone: "bg-emerald-100 text-emerald-900" },
  unverified: { label: "Unverified", tone: "bg-muted text-muted-foreground" },
};

const ICONS: Record<VerificationLevel, typeof BadgeCheck> = {
  fully_verified: BadgeCheck,
  bmdc_verified: ShieldCheck,
  identity_verified: IdCard,
  unverified: ShieldQuestion,
};

export function VerifiedBadge({ level, className }: { level: VerificationLevel; className?: string }) {
  const meta = COPY[level];
  const Icon = ICONS[level];
  return (
    <span
      title={meta.label}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        meta.tone,
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {meta.label}
    </span>
  );
}
