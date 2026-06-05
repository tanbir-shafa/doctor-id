import { Award } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Founding Doctor badge — a referral-reward pill, a SEPARATE axis from the
 * verification tick (never conflate the two). Earned when a doctor refers 5+
 * doctors who get approved. Gold/amber tone sets it apart from the teal/sky
 * verification badges.
 *
 * Renders nothing unless `isFounding`, so call sites can drop it in
 * unconditionally beside the verified badge.
 */
export function FoundingDoctorBadge({
  isFounding,
  className,
}: {
  isFounding?: boolean | null;
  className?: string;
}) {
  if (!isFounding) return null;
  return (
    <span
      title="Founding Doctor — an early member who brought 5+ verified doctors to doctor.id.bd"
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800",
        className,
      )}
    >
      <Award className="size-3.5" aria-hidden="true" />
      Founding Doctor
    </span>
  );
}
