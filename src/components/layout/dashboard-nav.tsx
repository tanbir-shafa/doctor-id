"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  User,
  MapPin,
  Image as ImageIcon,
  BadgeCheck,
  BarChart3,
  Settings,
  FileText,
  Inbox,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function DashboardNav({ pendingRequestCount = 0 }: { pendingRequestCount?: number }) {
  const pathname = usePathname();
  const badges = { pendingRequestCount };
  return (
    <nav className="sticky top-4 space-y-1" aria-label="Dashboard navigation">
      {NAV.map((item) => {
        const Icon = item.icon;
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        const badge = item.badgeKey ? badges[item.badgeKey] : 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground",
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
  );
}
