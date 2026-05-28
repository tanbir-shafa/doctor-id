"use client";

import dynamic from "next/dynamic";

/**
 * Client-side wrapper that disables SSR for the Leaflet map.
 *
 * Next 16 disallows `dynamic(..., { ssr: false })` inside Server Components,
 * so we put the dynamic import behind a "use client" boundary that the
 * Server Component (ChamberCard) can render.
 */
const LeafletMap = dynamic(() => import("./leaflet-map"), {
  ssr: false,
  loading: () => (
    <div className="h-[280px] w-full animate-pulse rounded-md bg-muted" aria-hidden="true" />
  ),
});

export default function LeafletLazy(props: {
  lat: number;
  lng: number;
  label?: string;
  zoom?: number;
  height?: number;
}) {
  return <LeafletMap {...props} />;
}
