"use client";

import { useEffect, useState } from "react";
import { loadHomeScoreboardAction } from "@/server/actions/doctor";
import type { HomeScoreboard } from "@/types/home";
import { ClaimMirrorHero } from "./claim-mirror-hero";
import { DoctorScoreboard } from "./doctor-scoreboard";

/**
 * Client orchestrator for the top of the home page. Renders the claim-mirror
 * hero by default — that's what SSR, crawlers, and anonymous visitors see — and
 * asks the server whether the current visitor is a logged-in doctor. If so, it
 * swaps in their personalized scoreboard; everyone else keeps the hero.
 *
 * The per-visitor branch happens here (a server action), NOT in page.tsx, so
 * the page never calls auth() and stays ISR-cacheable for the dominant
 * anonymous + crawler traffic.
 */
export function HomeTop({ totalDoctors }: { totalDoctors: number }) {
  const [board, setBoard] = useState<HomeScoreboard | null>(null);

  useEffect(() => {
    let alive = true;
    loadHomeScoreboardAction()
      .then((r) => {
        if (alive && r.ok && r.data) setBoard(r.data);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return board ? (
    <DoctorScoreboard board={board} />
  ) : (
    <ClaimMirrorHero totalDoctors={totalDoctors} />
  );
}
