/**
 * Homepage. Step 5 replaces this with the real hero + specialty grid + stats.
 * Kept lean during Step 1 so the smoke test (npm run dev → 200) just works.
 */
import Link from "next/link";

export default function HomePage() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16">
      <div className="text-center">
        <p className="text-sm font-medium uppercase tracking-wider text-primary">
          Bangladesh's verified doctor directory
        </p>
        <h1 className="mt-3 text-balance text-4xl font-bold tracking-tight sm:text-5xl">
          Find a doctor you can trust.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-balance text-muted-foreground">
          Verified specialists across Bangladesh — chambers, schedules, qualifications, contact.
          One profile, shareable everywhere.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link
            href="/search"
            className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Browse doctors
          </Link>
          <Link
            href="/auth/register"
            className="rounded-md border border-border px-5 py-2.5 text-sm font-medium hover:bg-accent"
          >
            Are you a doctor? Claim your profile
          </Link>
        </div>
      </div>
    </section>
  );
}
