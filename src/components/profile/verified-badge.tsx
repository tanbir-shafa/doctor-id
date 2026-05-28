import { BadgeCheck, ShieldCheck, ShieldQuestion } from "lucide-react";
import { cn } from "@/lib/utils";
import type { VerificationLevel } from "@/types/doctor";

const COPY: Record<VerificationLevel, { label: string; tone: string }> = {
  fully_verified: { label: "Fully verified", tone: "bg-green-100 text-green-900" },
  bmdc_verified: { label: "BMDC verified", tone: "bg-primary/10 text-primary" },
  unverified: { label: "Unverified", tone: "bg-muted text-muted-foreground" },
};

export function VerifiedBadge({ level, className }: { level: VerificationLevel; className?: string }) {
  const meta = COPY[level];
  const Icon =
    level === "fully_verified" ? ShieldCheck : level === "bmdc_verified" ? BadgeCheck : ShieldQuestion;
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
