"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, LogOut, LayoutDashboard, Search, User as UserIcon, UserPlus } from "lucide-react";
import { logoutAction } from "@/server/actions/auth";

/**
 * Hamburger menu for the public site header. Mirrors the desktop nav links
 * but in a slide-out drawer. Auto-closes when the route changes so a Link
 * navigation doesn't leave the drawer hanging open.
 *
 * The drawer is portaled inline (no separate Portal component yet) — it's
 * just a fixed-position overlay above the rest of the page. Good enough for
 * the public surface; the dashboard drawer is its own component.
 */
export function MobileMenu({
  signedIn,
  dashboardHref,
  userEmail,
}: {
  signedIn: boolean;
  dashboardHref: string;
  userEmail: string | null;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the drawer when the route changes — without this, a Link nav
  // leaves the overlay visible on the new page.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
  }, [pathname]);

  // Prevent scrolling the body when the drawer is open.
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
        className="inline-flex size-9 items-center justify-center rounded-md border border-border text-foreground sm:hidden"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
      >
        <Menu className="size-5" aria-hidden="true" />
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 sm:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-0 flex h-full w-72 max-w-[80vw] flex-col bg-background shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="font-semibold">Menu</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex size-8 items-center justify-center rounded-md hover:bg-accent"
                aria-label="Close menu"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>

            <nav className="flex-1 space-y-1 p-3 text-sm">
              <DrawerLink href="/search" icon={Search}>
                Find a doctor
              </DrawerLink>

              {signedIn ? (
                <>
                  <DrawerLink href={dashboardHref} icon={LayoutDashboard}>
                    Dashboard
                  </DrawerLink>
                  {userEmail ? (
                    <p className="px-3 py-2 text-xs text-muted-foreground">
                      Signed in as <strong className="text-foreground">{userEmail}</strong>
                    </p>
                  ) : null}
                  <form action={logoutAction} className="px-1">
                    <button
                      type="submit"
                      className="flex w-full items-center gap-2 rounded-md border border-border px-3 py-2 text-left font-medium hover:bg-accent"
                    >
                      <LogOut className="size-4" aria-hidden="true" />
                      Sign out
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <DrawerLink href="/auth/login" icon={UserIcon}>
                    Sign in
                  </DrawerLink>
                  <DrawerLink href="/auth/register" icon={UserPlus}>
                    Create profile
                  </DrawerLink>
                  <Link
                    href="/search"
                    className="mt-2 block rounded-md bg-primary px-3 py-2 text-center font-medium text-primary-foreground hover:opacity-90"
                  >
                    Claim your profile
                  </Link>
                </>
              )}
            </nav>
          </div>
        </div>
      ) : null}
    </>
  );
}

function DrawerLink({
  href,
  icon: Icon,
  children,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-md px-3 py-2 text-foreground hover:bg-accent"
    >
      <Icon className="size-4" aria-hidden />
      {children}
    </Link>
  );
}
