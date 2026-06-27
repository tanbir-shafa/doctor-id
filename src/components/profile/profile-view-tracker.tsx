"use client";

import { useEffect, useRef } from "react";
import { recordProfileViewAction } from "@/server/actions/doctor";

/**
 * Fires the profile-view recorder from the browser after mount (option 2).
 *
 * Previously the view was recorded server-side during SSR, which counted every
 * crawler that fetched the HTML. Firing it from a client effect means clients
 * that don't execute JavaScript — the bulk of SEO/AI crawlers — never trigger a
 * view, aligning the counter with real-browser analytics. The server action
 * still applies a User-Agent bot filter (option 1) for JS-capable bots.
 *
 * Renders nothing. The `ref` guard avoids a duplicate call under React Strict
 * Mode's double-invoked effects (the server-side IP+day de-dup would absorb it
 * anyway, but this saves the extra round-trip).
 */
export function ProfileViewTracker({ slug }: { slug: string }) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    // Fire-and-forget; recording must never surface an error to the visitor.
    void recordProfileViewAction(slug).catch(() => {});
  }, [slug]);

  return null;
}
