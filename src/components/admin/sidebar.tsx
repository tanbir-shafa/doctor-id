"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShieldCheck,
  IdCard,
  Users,
  Tag,
  Building2,
  ChevronRight,
  Sparkles,
  Send,
  Newspaper,
} from "lucide-react";
import { BrandWordmark } from "@/components/layout/brand-wordmark";
import { BrandMark } from "@/components/layout/brand-mark";
import { cn } from "@/lib/utils";

/**
 * AdminLTE-style left sidebar.
 *
 * Section headers + icon+label nav rows + active highlight. The Verification
 * link carries a live badge with the pending-claim count so the operator
 * sees at-a-glance whether anything needs attention.
 *
 * Rendered inside `AdminShell` — the shell owns the open/close state for
 * the mobile drawer; this component is identical desktop vs drawer.
 */
export function AdminSidebar({
  pendingClaimCount,
  pendingIdentityCount,
  pendingEmrCount,
}: {
  pendingClaimCount: number;
  pendingIdentityCount: number;
  pendingEmrCount: number;
}) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col bg-slate-900 text-slate-100">
      {/* Brand */}
      <Link
        href="/admin"
        className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-800 px-4 font-semibold"
      >
        <BrandMark className="size-7 shrink-0" />
        <BrandWordmark className="truncate" />
        <span className="ml-auto rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] uppercase tracking-wider text-rose-200">
          Admin
        </span>
      </Link>

      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-3 text-sm" aria-label="Admin navigation">
        <SectionLabel>Main</SectionLabel>
        <NavItem href="/admin" icon={LayoutDashboard} active={pathname === "/admin"}>
          Overview
        </NavItem>

        <SectionLabel>Verification</SectionLabel>
        <NavItem
          href="/admin/verifications"
          icon={ShieldCheck}
          active={pathname.startsWith("/admin/verifications")}
          badge={pendingClaimCount}
          badgeTone={pendingClaimCount > 0 ? "rose" : "slate"}
        >
          BMDC queue
        </NavItem>
        <NavItem
          href="/admin/account-verifications"
          icon={IdCard}
          active={pathname.startsWith("/admin/account-verifications")}
          badge={pendingIdentityCount}
          badgeTone={pendingIdentityCount > 0 ? "rose" : "slate"}
        >
          Account ID
        </NavItem>
        <NavItem
          href="/admin/emr-queue"
          icon={Sparkles}
          active={pathname.startsWith("/admin/emr-queue")}
          badge={pendingEmrCount}
          badgeTone={pendingEmrCount > 0 ? "rose" : "slate"}
        >
          EMR seats
        </NavItem>

        <SectionLabel>Catalog</SectionLabel>
        <NavItem
          href="/admin/doctors"
          icon={Users}
          active={pathname.startsWith("/admin/doctors")}
        >
          Doctors
        </NavItem>
        <NavItem
          href="/admin/chambers"
          icon={Building2}
          active={pathname.startsWith("/admin/chambers")}
        >
          Chambers
        </NavItem>
        <NavItem
          href="/admin/specialties"
          icon={Tag}
          active={pathname.startsWith("/admin/specialties")}
        >
          Specialties
        </NavItem>

        <SectionLabel>Content</SectionLabel>
        <NavItem
          href="/admin/articles"
          icon={Newspaper}
          active={pathname.startsWith("/admin/articles")}
        >
          Articles
        </NavItem>

        <SectionLabel>Acquisition</SectionLabel>
        <NavItem
          href="/admin/outbound"
          icon={Send}
          active={pathname.startsWith("/admin/outbound")}
        >
          Outbound
        </NavItem>
      </nav>

      <div className="border-t border-slate-800 p-3 text-xs text-slate-400">
        <p>© Shafa Care Ltd</p>
        <p className="mt-0.5 opacity-70">Admin · v0.1</p>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
      {children}
    </div>
  );
}

function NavItem({
  href,
  icon: Icon,
  active,
  badge,
  badgeTone = "slate",
  children,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  badge?: number;
  badgeTone?: "rose" | "slate";
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-2 rounded-md px-3 py-2 font-medium transition-colors",
        active
          ? "bg-primary/15 text-white"
          : "text-slate-300 hover:bg-slate-800/70 hover:text-white",
      )}
    >
      <Icon className="size-4" />
      <span className="flex-1">{children}</span>
      {badge !== undefined && badge > 0 ? (
        <span
          className={cn(
            "inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold",
            badgeTone === "rose" ? "bg-rose-500 text-white" : "bg-slate-700 text-slate-200",
          )}
        >
          {badge}
        </span>
      ) : (
        <ChevronRight
          className={cn(
            "size-3 opacity-0 transition-opacity",
            active ? "opacity-100" : "group-hover:opacity-60",
          )}
        />
      )}
    </Link>
  );
}
