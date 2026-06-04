/**
 * Home page — "two faces, one URL".
 *
 * Logged-out: a claim-and-trust acquisition funnel (claim-mirror hero → BMDC
 * trust → social proof → "your prescription is your billboard" → specialty grid
 * → why-free/EMR band). Logged-in doctor: a weekly scoreboard, swapped in
 * client-side by <HomeTop>.
 *
 * This file is the SEO surface, so it stays ISR-cacheable and never calls
 * auth() — the per-visitor branch lives in <HomeTop> (a client overlay calling
 * a server action). See .claude/plans for the rationale.
 */
import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import {
  getStats,
  listActiveSpecialties,
  listDistricts,
  listFeaturedVerifiedDoctors,
  getProfileViewsLast30Days,
} from "@/lib/db/queries/doctors";
import { HomeTop } from "@/components/home/home-top";
import { TrustBand } from "@/components/home/trust-band";
import { ProofStrip } from "@/components/home/proof-strip";
import { BillboardShowcase } from "@/components/home/billboard-showcase";
import { SpecialtyGrid } from "@/components/home/specialty-grid";
import { WhyFreeBand } from "@/components/home/why-free-band";

export const metadata: Metadata = {
  title: { absolute: "doctor.id.bd — Claim your verified doctor profile in Bangladesh" },
  description:
    "Your patients are already searching for you. Claim your free, BMDC-verified profile on doctor.id.bd — shareable on WhatsApp, your prescription pad, and Google.",
  alternates: { canonical: "/" },
};

// This route renders dynamically because the shared <SiteHeader> (in the
// (public) layout) reads the session via auth() — that's true of every public
// page, not just this one. We deliberately keep auth() OUT of this page so it
// carries no per-user variance, and the per-doctor scoreboard is a client-side
// swap (<HomeTop>) so it never blocks the response. SEO is unaffected: dynamic
// rendering still emits full server-rendered HTML with all content + links.
export const revalidate = 3600;

// Even though the route is dynamic, the shared public landing data is read-heavy
// (counts + aggregations). Wrapping it in unstable_cache serves it from cache for
// an hour instead of hitting Mongo on every request — one entry for the whole
// dataset. (Non-fetch/Mongoose reads are uncached by default in Next 16.)
const getHomeData = unstable_cache(
  async () => {
    const [stats, specialties, districts, featured, views30d] = await Promise.all([
      getStats(),
      listActiveSpecialties(),
      listDistricts(),
      listFeaturedVerifiedDoctors(6),
      getProfileViewsLast30Days(),
    ]);
    return { stats, specialties, districts, featured, views30d };
  },
  ["home:landing-data"],
  { revalidate: 3600, tags: ["home"] },
);

export default async function HomePage() {
  const { stats, specialties, districts, featured, views30d } = await getHomeData();

  return (
    <>
      <HomeTop totalDoctors={stats.totalDoctors} />
      <TrustBand />
      <ProofStrip stats={stats} views30d={views30d} featured={featured} />
      <BillboardShowcase />
      <SpecialtyGrid specialties={specialties} districts={districts} />
      <WhyFreeBand />
    </>
  );
}
