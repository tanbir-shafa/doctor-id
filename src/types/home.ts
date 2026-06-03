/**
 * Shape returned by `loadHomeScoreboardAction` for the logged-in-doctor home
 * overlay. It lives here — not in the `"use server"` action file — because a
 * `"use server"` module may only export async functions, not types.
 */
export interface HomeScoreboard {
  firstName: string;
  slug: string;
  published: boolean;
  views30d: number;
  viewsAllTime: number;
  pendingRequests: number;
  completeness: number;
  /** Highest-weight unfinished completeness section, or null at 100%. */
  nextAction: { label: string; weight: number } | null;
  emrSeatStatus: "pending" | "ready" | "declined" | null;
}
