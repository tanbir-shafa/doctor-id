"use server";

/**
 * Typeahead search — Server Action backing the homepage claim-mirror hero.
 *
 * This replaces the old browser `fetch('/api/v1/search')`. As a Server Action
 * it's same-origin-enforced by Next (CSRF-protected) and never exposes a public
 * JSON endpoint, so the search surface can't be scraped cross-origin. Still
 * rate-limited by trusted client IP because it runs a regex DB query.
 */

import { headers } from "next/headers";
import { searchDoctors } from "@/lib/db/queries/doctors";
import { publicApiRateLimiter } from "@/lib/redis/ratelimit";
import { clientIp } from "@/lib/utils/request-ip";
import type { VerificationLevel } from "@/types/doctor";

export interface TypeaheadResult {
  slug: string;
  name: string;
  specialty: string | null;
  district: string | null;
  verificationLevel: VerificationLevel;
  isClaimed: boolean;
  photo: string | null;
  url: string;
}

export async function searchTypeaheadAction(query: string): Promise<TypeaheadResult[]> {
  const q = (query ?? "").trim();
  if (q.length < 2) return [];

  const ip = clientIp(await headers());
  const rl = await publicApiRateLimiter.limit(`typeahead:${ip}`);
  if (!rl.success) return [];

  const { doctors } = await searchDoctors({ q, page: 1, pageSize: 6, sort: "relevance" });
  return doctors.map((d) => ({
    slug: d.slug,
    name: d.name.displayName,
    specialty: d.specialties.find((s) => s.isPrimary)?.name ?? d.specialties[0]?.name ?? null,
    district: d.chambers.find((c) => c.isPrimary)?.district ?? d.chambers[0]?.district ?? null,
    verificationLevel: d.verificationLevel,
    isClaimed: d.isClaimed,
    photo: d.photo?.url ?? null,
    url: `/${d.slug}`,
  }));
}
