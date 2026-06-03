"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Search, ArrowRight, Loader2, UserPlus } from "lucide-react";
import { VerifiedBadge } from "@/components/profile/verified-badge";
import type { VerificationLevel } from "@/types/doctor";

/**
 * Claim-mirror hero — the big bet. A doctor searches their own name and finds
 * the profile we already ingested for them (unclaimed), then claims it in a tap.
 * The same box doubles as patient search ("find a cardiologist"), so one
 * surface serves both audiences. Lives in a client component so the typeahead
 * works without making the whole (ISR-cached) page dynamic.
 */
interface SearchResult {
  slug: string;
  name: string;
  specialty: string | null;
  city: string | null;
  verificationLevel: VerificationLevel;
  isClaimed: boolean;
  photo: string | null;
  url: string;
}

function initials(name: string): string {
  return name
    .replace(/^(Dr\.?|Prof\.?|Assoc\.?|Asst\.?)\s+/gi, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function ClaimMirrorHero({ totalDoctors }: { totalDoctors: number }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // When the visitor arrives via a "Claim your profile" link (/#claim), focus
  // the search box so the intent — search the existing list to find yourself —
  // is unmistakable. Handles both initial load and same-tab hash changes.
  useEffect(() => {
    const focusFromHash = () => {
      if (window.location.hash === "#claim") inputRef.current?.focus();
    };
    focusFromHash();
    window.addEventListener("hashchange", focusFromHash);
    return () => window.removeEventListener("hashchange", focusFromHash);
  }, []);

  useEffect(() => {
    const q = query.trim();
    const ctrl = new AbortController();
    // All state updates happen inside the debounce timeout (never synchronously
    // in the effect body) so we don't trigger cascading renders.
    const timer = setTimeout(() => {
      if (q.length < 2) {
        setResults(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      fetch(`/api/v1/search?q=${encodeURIComponent(q)}&pageSize=6`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((json) => setResults((json?.results ?? []) as SearchResult[]))
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 250);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query]);

  const showPanel = query.trim().length >= 2;
  const totalLabel = new Intl.NumberFormat("en-IN").format(totalDoctors);

  return (
    <section
      id="claim"
      className="scroll-mt-20 border-b border-border bg-gradient-to-b from-primary/5 to-background"
    >
      <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:py-20">
        <p className="text-sm font-medium uppercase tracking-wider text-primary">
          Bangladesh&apos;s verified doctor directory
        </p>
        <h1 className="mt-3 text-balance text-3xl font-bold tracking-tight sm:text-5xl">
          {totalDoctors > 0 ? (
            <>
              {totalLabel} doctors are already listed.{" "}
              <span className="text-primary">Find yours.</span>
            </>
          ) : (
            <>Claim your verified doctor profile.</>
          )}
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-balance text-muted-foreground">
          Search your name — your profile may already be public on Google. Claim it
          free in 2 minutes and control what patients see.
        </p>

        <div className="relative mx-auto mt-8 max-w-xl text-left">
          <div className="flex items-center gap-2 rounded-xl border border-input bg-background px-4 shadow-sm focus-within:ring-2 focus-within:ring-ring">
            <Search className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type your name, e.g. Karim Rahman"
              aria-label="Search for your doctor profile"
              className="h-14 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
            />
            {loading ? (
              <Loader2 className="size-5 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
            ) : null}
          </div>

          {showPanel ? (
            <div className="absolute z-20 mt-2 max-h-[70vh] w-full overflow-y-auto rounded-xl border border-border bg-card text-left shadow-lg">
              {results && results.length > 0 ? (
                <ul className="divide-y divide-border">
                  {results.map((d) => (
                    // flex-wrap so the action button drops to its own full-width
                    // line on mobile (sm:flex-nowrap keeps it inline on desktop).
                    <li
                      key={d.slug}
                      className="flex flex-wrap items-center gap-x-3 gap-y-2.5 p-3 sm:flex-nowrap"
                    >
                      {d.photo ? (
                        <Image
                          src={d.photo}
                          alt=""
                          width={40}
                          height={40}
                          className="size-10 shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-primary">
                          {initials(d.name)}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        {/* full name shown in full — wraps instead of truncating,
                            with the verified badge trailing inline */}
                        <p className="font-medium text-foreground">
                          {d.name}
                          <VerifiedBadge
                            level={d.verificationLevel}
                            className="ml-1.5 align-middle"
                          />
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[d.specialty, d.city].filter(Boolean).join(" · ") || "Doctor"}
                        </p>
                      </div>
                      {d.isClaimed ? (
                        <Link
                          href={d.url}
                          className="inline-flex w-full shrink-0 justify-center rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent sm:w-auto"
                        >
                          View profile
                        </Link>
                      ) : (
                        <Link
                          href={`/auth/register?slug=${encodeURIComponent(d.slug)}`}
                          className="inline-flex w-full shrink-0 items-center justify-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 sm:w-auto"
                        >
                          Is this you? Claim free
                          <ArrowRight className="size-3.5" aria-hidden="true" />
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              ) : !loading ? (
                <div className="flex items-center justify-between gap-3 p-4">
                  <p className="text-sm text-muted-foreground">No match for that name yet.</p>
                  <Link
                    href="/auth/register"
                    className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                  >
                    <UserPlus className="size-3.5" aria-hidden="true" />
                    Add yourself
                  </Link>
                </div>
              ) : (
                <p className="p-4 text-sm text-muted-foreground">Searching…</p>
              )}
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-sm">
          <span className="text-muted-foreground">Not listed yet?</span>
          <Link
            href="/auth/register"
            className="inline-flex items-center gap-1 rounded-md border border-primary px-4 py-2 font-medium text-primary hover:bg-primary/5"
          >
            Create your profile
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
          <Link href="/search" className="text-muted-foreground hover:text-foreground hover:underline">
            Browse all doctors
          </Link>
        </div>
      </div>
    </section>
  );
}
