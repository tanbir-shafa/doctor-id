"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Mobile presentation for the search filter form.
 *
 * On mobile (<sm) the **search field stays visible at all times**, with a
 * compact filter icon beside it; tapping the icon reveals the rest of the
 * filters (specialty, city, verification, gender, sort). On desktop the icon is
 * hidden and everything is shown inline — desktop is unchanged.
 *
 * Both wrappers use `sm:contents`, so on desktop they flatten away and their
 * children (the search input and the selects) become direct items of the
 * form's grid exactly as before. The form stays server-rendered: the input is
 * passed as `searchInput` and the selects/submit as `children`.
 */
export function SearchFilters({
  activeCount,
  searchInput,
  children,
}: {
  activeCount: number;
  searchInput: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Always-visible search row (flattens into the grid on desktop). */}
      <div className="flex gap-2 sm:contents">
        {searchInput}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label="Filters"
          className={cn(
            "relative flex size-10 shrink-0 items-center justify-center rounded-md border bg-background transition-colors sm:hidden",
            open ? "border-primary text-primary" : "border-input text-muted-foreground",
          )}
        >
          <SlidersHorizontal className="size-5" aria-hidden="true" />
          {activeCount > 0 ? (
            <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground">
              {activeCount}
            </span>
          ) : null}
        </button>
      </div>

      {/* Filter options: collapsed on mobile until the icon is tapped; always
          shown (flattened into the grid) on desktop. */}
      <div className={cn("sm:contents", open ? "contents" : "hidden")}>{children}</div>
    </>
  );
}
