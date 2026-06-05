"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Menu,
  X,
  LayoutDashboard,
  User,
  MapPin,
  Image as ImageIcon,
  BadgeCheck,
  BarChart3,
  Settings,
  LogOut,
  Stethoscope,
  FileText,
  Inbox,
  Gift,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/server/actions/auth";

const NAV: Array<{
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
  badgeKey?: "pendingRequestCount";
}> = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/profile", label: "Profile", icon: User },
  { href: "/dashboard/chambers", label: "Chambers", icon: MapPin },
  { href: "/dashboard/photos", label: "Photos", icon: ImageIcon },
  { href: "/dashboard/prescription-pad", label: "Prescription pad", icon: FileText },
  { href: "/dashboard/requests", label: "Requests", icon: Inbox, badgeKey: "pendingRequestCount" },
  { href: "/dashboard/verification", label: "Verification", icon: BadgeCheck },
  { href: "/dashboard/referrals", label: "Refer & earn", icon: Gift },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

/**
 * Hamburger drawer for the doctor dashboard. The sidebar `<DashboardNav>` is
 * `lg:block` only — without this trigger, mobile users on `/dashboard/*` had
 * no way to navigate between sections.
 *
 * Identical link set to `<DashboardNav>` so the two stay in sync; if the
 * dashboard grows another section, update NAV here too. (Could refactor to
 * a shared constant later — keeping the duplication tiny for now keeps the
 * server/client boundary clean.)
 */
export function DashboardMobileNav({
  userEmail,
  pendingRequestCount = 0,
}: {
  userEmail: string;
  pendingRequestCount?: number;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const badges = { pendingRequestCount };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="inline-flex size-9 items-center justify-center rounded-md border border-border lg:hidden"
        onClick={() => setOpen(true)}
        aria-label="Open dashboard menu"
        aria-expanded={open}
      >
        <Menu className="size-5" aria-hidden="true" />
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-0 flex h-full w-72 max-w-[80vw] flex-col bg-background shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <Link href="/" className="inline-flex items-center gap-2 font-semibold">
                <Stethoscope className="size-5 text-primary" aria-hidden="true" />
                doctor.id.bd
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex size-8 items-center justify-center rounded-md hover:bg-accent"
                aria-label="Close menu"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>

            <nav className="flex-1 space-y-1 p-3" aria-label="Dashboard navigation">
              {NAV.map((item) => {
                const Icon = item.icon;
                const active = item.exact
                  ? pathname === item.href
                  : pathname.startsWith(item.href);
                const badge = item.badgeKey ? badges[item.badgeKey] : 0;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    <span className="flex-1">{item.label}</span>
                    {badge && badge > 0 ? (
                      <span
                        className={cn(
                          "inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold",
                          active ? "bg-primary text-primary-foreground" : "bg-rose-500 text-white",
                        )}
                      >
                        {badge}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </nav>

            <div className="space-y-2 border-t border-border p-3 text-sm">
              <p className="px-3 text-xs text-muted-foreground">
                Signed in as <strong className="text-foreground">{userEmail}</strong>
              </p>
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="flex w-full items-center gap-2 rounded-md border border-border px-3 py-2 hover:bg-accent"
                >
                  <LogOut className="size-4" aria-hidden="true" />
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
