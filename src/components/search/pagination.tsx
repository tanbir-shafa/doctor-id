import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Server-renderable pagination. Generates href URLs by spreading the current
 * search params + replacing `page`. No client JS — the buttons are real links
 * so crawlers follow them and the page is bookmarkable.
 */
export function Pagination({
  page,
  totalPages,
  searchParams,
}: {
  page: number;
  totalPages: number;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  if (totalPages <= 1) return null;

  function hrefForPage(target: number): string {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      if (v === undefined) continue;
      if (Array.isArray(v)) v.forEach((x) => sp.append(k, x));
      else sp.set(k, v);
    }
    sp.set("page", String(target));
    return `?${sp.toString()}`;
  }

  // Compact pagination: prev, 1, … (window) … last, next
  const window: number[] = [];
  const around = 1;
  for (let i = Math.max(2, page - around); i <= Math.min(totalPages - 1, page + around); i++) {
    window.push(i);
  }

  function Item({ label, target, isCurrent }: { label: string | number; target?: number; isCurrent?: boolean }) {
    const base =
      "inline-flex h-9 min-w-9 items-center justify-center rounded-md border border-border px-3 text-sm";
    if (!target || isCurrent) {
      return (
        <span aria-current={isCurrent ? "page" : undefined} className={cn(base, isCurrent ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
          {label}
        </span>
      );
    }
    return (
      <Link href={hrefForPage(target)} className={cn(base, "hover:bg-accent")}>
        {label}
      </Link>
    );
  }

  return (
    <nav aria-label="Pagination" className="mt-8 flex flex-wrap items-center justify-center gap-1">
      <Item label="Prev" target={page > 1 ? page - 1 : undefined} />
      <Item label={1} target={1} isCurrent={page === 1} />
      {window[0] > 2 ? <Item label="…" /> : null}
      {window.map((p) => (
        <Item key={p} label={p} target={p} isCurrent={p === page} />
      ))}
      {window.length > 0 && window[window.length - 1]! < totalPages - 1 ? <Item label="…" /> : null}
      {totalPages > 1 ? <Item label={totalPages} target={totalPages} isCurrent={page === totalPages} /> : null}
      <Item label="Next" target={page < totalPages ? page + 1 : undefined} />
    </nav>
  );
}
