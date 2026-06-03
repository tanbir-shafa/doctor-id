import Link from "next/link";
import { ChevronRight } from "lucide-react";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

/**
 * AdminLTE-style page header. Title + description on the left, breadcrumb
 * trail on the right. Sits at the top of every admin page body so the
 * chrome is consistent.
 */
export function PageHeader({
  title,
  description,
  breadcrumb = [],
  toolbar,
}: {
  title: string;
  description?: string;
  breadcrumb?: BreadcrumbItem[];
  toolbar?: React.ReactNode;
}) {
  const crumbs: BreadcrumbItem[] = [{ label: "Admin", href: "/admin" }, ...breadcrumb];
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {description ? (
          <p className="mt-0.5 text-sm text-slate-500">{description}</p>
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        {toolbar}
        <nav aria-label="Breadcrumb" className="hidden text-xs text-slate-500 sm:block">
          <ol className="flex flex-wrap items-center gap-1">
            {crumbs.map((c, i) => {
              const last = i === crumbs.length - 1;
              return (
                <li key={`${c.label}-${i}`} className="inline-flex items-center gap-1">
                  {c.href && !last ? (
                    <Link href={c.href} className="hover:text-slate-800 hover:underline">
                      {c.label}
                    </Link>
                  ) : (
                    <span className={last ? "font-medium text-slate-700" : ""}>{c.label}</span>
                  )}
                  {!last ? <ChevronRight className="size-3" aria-hidden="true" /> : null}
                </li>
              );
            })}
          </ol>
        </nav>
      </div>
    </div>
  );
}
