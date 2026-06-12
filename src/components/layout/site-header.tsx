import Link from "next/link";
import { LogOut, LayoutDashboard } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { logoutAction } from "@/server/actions/auth";
import { MobileMenu } from "./mobile-menu";
import { BrandWordmark } from "@/components/layout/brand-wordmark";
import { BrandMark } from "@/components/layout/brand-mark";

/**
 * Top-of-page header for public routes.
 *
 * Session-aware: when the visitor is signed in, the "Sign in" / "Claim"
 * buttons are replaced with "Dashboard" / "Sign out". This is what a returning
 * user sees on the homepage, so we have to mirror their auth state — otherwise
 * the page looks like a logged-out experience even though their session is fine.
 *
 * Mobile (<sm): the inline nav collapses into a hamburger drawer driven by the
 * client `<MobileMenu>` component. The drawer reuses the same links so we keep
 * a single source of truth for nav items.
 */
export async function SiteHeader() {
  const session = await auth();
  const signedIn = Boolean(session?.user?.id);
  const isAdmin = session?.user?.role === "admin";
  const dashboardHref = isAdmin ? "/admin" : "/dashboard";

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <BrandMark className="size-7" />
          <BrandWordmark />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-4 text-sm sm:flex">
          <Link href="/search" className="text-muted-foreground hover:text-foreground">
            Find a doctor
          </Link>

          {signedIn ? (
            <>
              <Link
                href={dashboardHref}
                className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
              >
                <LayoutDashboard className="size-4" aria-hidden="true" />
                Dashboard
              </Link>
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-foreground hover:bg-accent"
                >
                  <LogOut className="size-4" aria-hidden="true" />
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/auth/login" className="text-muted-foreground hover:text-foreground">
                Sign in
              </Link>
              <Link href="/auth/register" className="text-muted-foreground hover:text-foreground">
                Create profile
              </Link>
              <Link
                href="/#claim"
                className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground hover:opacity-90"
              >
                Claim your profile
              </Link>
            </>
          )}
        </nav>

        {/* Mobile menu (sm:hidden) */}
        <MobileMenu
          signedIn={signedIn}
          dashboardHref={dashboardHref}
          userEmail={session?.user?.email ?? null}
        />
      </div>
    </header>
  );
}
