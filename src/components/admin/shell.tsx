"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X, LogOut, User } from "lucide-react";
import { AdminSidebar } from "./sidebar";
import { logoutAction } from "@/server/actions/auth";

/**
 * AdminLTE-style shell:
 *   - Fixed sidebar on `lg:` (250px), off-canvas drawer on `<lg`
 *   - White topbar with mobile hamburger + page title slot + user dropdown
 *   - Slate-100 page background
 *   - Footer strip
 *
 * Owns the mobile-drawer open state (resets on route change + locks body
 * scroll while open).
 */
export function AdminShell({
  children,
  userEmail,
  pendingClaimCount,
  pendingIdentityCount,
  pendingEmrCount,
}: {
  children: React.ReactNode;
  userEmail: string;
  pendingClaimCount: number;
  pendingIdentityCount: number;
  pendingEmrCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
    setUserMenuOpen(false);
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
    <div className="min-h-screen bg-slate-100">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">
        <AdminSidebar
          pendingClaimCount={pendingClaimCount}
          pendingIdentityCount={pendingIdentityCount}
          pendingEmrCount={pendingEmrCount}
        />
      </aside>

      {/* Mobile drawer */}
      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-64 shadow-xl">
            <AdminSidebar
              pendingClaimCount={pendingClaimCount}
              pendingIdentityCount={pendingIdentityCount}
              pendingEmrCount={pendingEmrCount}
            />
          </aside>
        </div>
      ) : null}

      <div className="flex min-h-screen flex-col lg:pl-64">
        {/* Topbar */}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-slate-200 bg-white px-3 shadow-sm lg:px-6">
          <button
            type="button"
            className="inline-flex size-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open admin menu"
          >
            <Menu className="size-5" aria-hidden="true" />
          </button>
          <span className="text-sm font-medium text-slate-700 lg:hidden">Admin</span>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setUserMenuOpen((v) => !v)}
              className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
              aria-haspopup="menu"
              aria-expanded={userMenuOpen}
            >
              <User className="size-4 text-slate-500" aria-hidden="true" />
              <span className="hidden max-w-[180px] truncate sm:inline">{userEmail}</span>
              <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-rose-700">
                Admin
              </span>
            </button>
            {userMenuOpen ? (
              <div className="absolute right-3 top-12 z-30 w-56 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg lg:right-6">
                <div className="border-b border-slate-100 px-3 py-2 text-xs text-slate-500">
                  Signed in as <strong className="text-slate-800">{userEmail}</strong>
                </div>
                <form action={logoutAction}>
                  <button
                    type="submit"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    <LogOut className="size-4" aria-hidden="true" />
                    Sign out
                  </button>
                </form>
              </div>
            ) : null}
            {userMenuOpen ? (
              <button
                type="button"
                aria-hidden="true"
                tabIndex={-1}
                className="fixed inset-0 z-20 cursor-default"
                onClick={() => setUserMenuOpen(false)}
              />
            ) : null}
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 px-3 py-4 lg:px-6 lg:py-6">{children}</main>

        {/* Footer */}
        <footer className="border-t border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>© Shafa Care Ltd · doctor.id.bd admin</span>
            <span className="text-slate-400">v0.1 · Sprint A</span>
          </div>
        </footer>
      </div>

      {/* Close mobile drawer button (separate from overlay so screen readers can find it) */}
      {open ? (
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close menu"
          className="fixed left-[230px] top-3 z-50 inline-flex size-9 items-center justify-center rounded-md bg-white text-slate-700 shadow lg:hidden"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
