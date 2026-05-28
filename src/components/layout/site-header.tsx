import Link from "next/link";
import { Stethoscope } from "lucide-react";

export function SiteHeader() {
  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <Stethoscope className="size-5 text-primary" aria-hidden="true" />
          <span>doctor.id.bd</span>
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/search" className="text-muted-foreground hover:text-foreground">
            Find a doctor
          </Link>
          <Link href="/auth/login" className="text-muted-foreground hover:text-foreground">
            Sign in
          </Link>
          <Link
            href="/auth/register"
            className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground hover:opacity-90"
          >
            Claim your profile
          </Link>
        </nav>
      </div>
    </header>
  );
}
