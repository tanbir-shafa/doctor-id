import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * AdminLTE-style "small box" stat tile.
 *
 *   ┌───────────────────────┐
 *   │   value     Icon      │
 *   │   label               │
 *   ├───────────────────────┤
 *   │ More info  →          │   ← optional footer link
 *   └───────────────────────┘
 *
 * Use the colored variants for top-of-page KPIs. Each variant pairs a tile
 * background with a slightly darker footer + a high-contrast icon.
 */
type Tone = "primary" | "emerald" | "amber" | "rose" | "slate";

const TONE_BG: Record<Tone, string> = {
  primary: "bg-primary text-primary-foreground",
  emerald: "bg-emerald-600 text-white",
  amber: "bg-amber-500 text-white",
  rose: "bg-rose-600 text-white",
  slate: "bg-slate-700 text-white",
};
const TONE_FOOTER: Record<Tone, string> = {
  primary: "bg-primary/90 hover:bg-primary",
  emerald: "bg-emerald-700 hover:bg-emerald-800",
  amber: "bg-amber-600 hover:bg-amber-700",
  rose: "bg-rose-700 hover:bg-rose-800",
  slate: "bg-slate-800 hover:bg-slate-900",
};

export function StatBox({
  value,
  label,
  icon: Icon,
  tone = "slate",
  href,
  hrefLabel = "More info",
}: {
  value: string | number;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: Tone;
  href?: string;
  hrefLabel?: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg shadow-sm">
      <div className={cn("flex items-start justify-between p-4", TONE_BG[tone])}>
        <div>
          <div className="text-3xl font-bold leading-tight tabular-nums">{value}</div>
          <div className="mt-1 text-sm opacity-90">{label}</div>
        </div>
        <Icon className="size-10 opacity-60" aria-hidden="true" />
      </div>
      {href ? (
        <Link
          href={href}
          className={cn(
            "flex items-center justify-between px-4 py-2 text-xs font-medium text-white/90 transition-colors",
            TONE_FOOTER[tone],
          )}
        >
          <span>{hrefLabel}</span>
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}
