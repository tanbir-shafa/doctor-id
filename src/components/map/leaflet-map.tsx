"use client";

import { useEffect, useRef } from "react";

/**
 * Lightweight Leaflet wrapper — read-only display of a single chamber pin.
 *
 * We load Leaflet via dynamic import inside `useEffect` so its CSS + JS stay
 * out of the SSR bundle and only ship when the user actually scrolls to a
 * chamber. The wrapper component itself is rendered via `next/dynamic` so it
 * never executes server-side.
 */
export interface LeafletMapProps {
  lat: number;
  lng: number;
  label?: string;
  zoom?: number;
  height?: number;
}

export default function LeafletMap({ lat, lng, label, zoom = 15, height = 280 }: LeafletMapProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current || !ref.current) return;
    initialized.current = true;

    let map: { remove: () => void } | null = null;
    (async () => {
      const L = await import("leaflet");
      // Inject Leaflet's CSS once, lazily — avoids a global import.
      if (!document.querySelector('link[data-leaflet]')) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        link.setAttribute("data-leaflet", "true");
        link.crossOrigin = "";
        document.head.appendChild(link);
      }
      map = L.map(ref.current!, { scrollWheelZoom: false, zoomControl: true }).setView([lat, lng], zoom);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 19,
      }).addTo(map as never);
      const marker = L.marker([lat, lng]).addTo(map as never);
      if (label) marker.bindPopup(label);
    })();

    return () => {
      if (map) map.remove();
    };
  }, [lat, lng, zoom, label]);

  return (
    <div
      ref={ref}
      style={{ height: `${height}px` }}
      className="w-full overflow-hidden rounded-md border border-border bg-muted"
      role="img"
      aria-label={label ? `Map showing ${label}` : "Map"}
    />
  );
}
