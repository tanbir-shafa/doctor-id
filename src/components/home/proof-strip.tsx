import Image from "next/image";
import Link from "next/link";
import { VerifiedBadge } from "@/components/profile/verified-badge";
import type { FeaturedDoctor } from "@/lib/db/queries/doctors";

/**
 * Social-proof strip. Scale numbers make us look inevitable; the patient-view
 * count proves demand already exists and the doctor is missing it. Every number
 * hangs off a behavioral hook — never a bare vanity counter. No real-time
 * ticker (deferred): the "recently verified" list is a cheap server render.
 */
const nf = new Intl.NumberFormat("en-IN");

export function ProofStrip({
  stats,
  views30d,
  featured,
}: {
  stats: { totalDoctors: number; verifiedDoctors: number; districts: number; specialties: number };
  views30d: number;
  featured: FeaturedDoctor[];
}) {
  return (
    <section className="border-b border-border bg-muted/30">
      <div className="mx-auto max-w-5xl px-4 py-14">
        <div className="grid gap-6 sm:grid-cols-4">
          <Stat value={nf.format(stats.totalDoctors)} label="doctors listed" />
          <Stat value={nf.format(stats.verifiedDoctors)} label="verified profiles" />
          <Stat value={nf.format(stats.districts)} label="districts" />
          <Stat value={nf.format(stats.specialties)} label="specialties" />
        </div>

        {views30d > 0 ? (
          <p className="mx-auto mt-8 max-w-2xl text-balance text-center text-lg font-medium">
            Patients viewed doctor profiles{" "}
            <span className="text-primary">{nf.format(views30d)}×</span> in the last 30 days.{" "}
            <span className="text-muted-foreground">Is yours one of them?</span>
          </p>
        ) : null}

        {featured.length > 0 ? (
          <div className="mt-8">
            <p className="text-center text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Recently verified
            </p>
            <ul className="mt-4 flex flex-wrap justify-center gap-3">
              {featured.map((d) => (
                <li key={d.slug}>
                  <Link
                    href={`/${d.slug}`}
                    className="flex items-center gap-3 rounded-full border border-border bg-card py-1.5 pl-1.5 pr-4 transition hover:border-primary hover:shadow-sm"
                  >
                    {d.photo ? (
                      <Image
                        src={d.photo}
                        alt=""
                        width={36}
                        height={36}
                        className="size-9 rounded-full object-cover"
                      />
                    ) : (
                      <span className="flex size-9 items-center justify-center rounded-full bg-accent text-xs font-semibold text-primary">
                        {initials(d.name)}
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium text-foreground">{d.name}</span>
                        <VerifiedBadge level={d.verificationLevel} />
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[d.specialty, d.district].filter(Boolean).join(" · ") || "Doctor"}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <p className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

function initials(name: string): string {
  return name
    .replace(/^(Dr\.?|Prof\.?|Assoc\.?|Asst\.?)\s+/gi, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
