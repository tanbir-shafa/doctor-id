import Link from "next/link";
import { List, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DoctorCardView } from "./doctor-card";

/**
 * Desktop-only List/Grid switch for the search results. Renders as two links
 * that preserve every active search param and only flip `view`, so the choice
 * is shareable and needs no client JS — consistent with the GET-form filters.
 * Hidden below `sm`, where results are always the single-column tile layout.
 */
export function ViewToggle({
  current,
  params,
}: {
  current: DoctorCardView;
  params: Record<string, string | string[] | undefined>;
}) {
  const hrefFor = (view: DoctorCardView) => {
    const sp = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === "string" && value) sp.set(key, value);
    }
    sp.set("view", view);
    return `/search?${sp.toString()}`;
  };

  const options: { view: DoctorCardView; label: string; Icon: typeof List }[] = [
    { view: "list", label: "List", Icon: List },
    { view: "grid", label: "Grid", Icon: LayoutGrid },
  ];

  return (
    <div
      className="hidden shrink-0 items-center gap-0.5 rounded-md border border-border p-0.5 sm:inline-flex"
      role="group"
      aria-label="Result layout"
    >
      {options.map(({ view, label, Icon }) => {
        const active = current === view;
        return (
          <Link
            key={view}
            href={hrefFor(view)}
            aria-pressed={active}
            className={cn(
              "inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-sm font-medium transition-colors",
              active
                ? "bg-accent text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </div>
  );
}
