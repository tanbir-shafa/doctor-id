"use client";

import { useEffect, useRef } from "react";

/**
 * Lightweight Leaflet wrapper.
 *
 * Two modes:
 *   - read-only (default): renders a single pin at lat/lng.
 *   - picker: when `onLocationChange` is passed, the marker is draggable and
 *     a click on the map moves the marker. Useful for the chamber editor.
 *
 * We load Leaflet via dynamic import inside `useEffect` so its CSS + JS stay
 * out of the SSR bundle and only ship when the user actually scrolls to a
 * map. The wrapper component itself is rendered via `next/dynamic` so it
 * never executes server-side.
 */
export interface LeafletMapProps {
  lat: number;
  lng: number;
  label?: string;
  zoom?: number;
  height?: number;
  onLocationChange?: (lat: number, lng: number) => void;
}

export default function LeafletMap({
  lat,
  lng,
  label,
  zoom = 15,
  height = 280,
  onLocationChange,
}: LeafletMapProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const initialized = useRef(false);
  // Holds the live Leaflet handles so the (lat,lng) effect can sync without
  // recreating the map.
  const handles = useRef<{
    map: { remove: () => void; setView: (...args: unknown[]) => void } | null;
    marker: { setLatLng: (...args: unknown[]) => void } | null;
  }>({ map: null, marker: null });
  const cbRef = useRef(onLocationChange);
  cbRef.current = onLocationChange;

  useEffect(() => {
    if (initialized.current || !ref.current) return;
    initialized.current = true;

    let cleanupFn: () => void = () => {};
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
      const map = L.map(ref.current!, { scrollWheelZoom: false, zoomControl: true }).setView(
        [lat, lng],
        zoom,
      );
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
        maxZoom: 19,
      }).addTo(map as never);
      const marker = L.marker([lat, lng], { draggable: Boolean(cbRef.current) }).addTo(map as never);
      if (label) marker.bindPopup(label);

      // Picker behavior: click the map to move the marker; drag the marker
      // and emit on dragend. We read the live callback from `cbRef` so prop
      // changes don't require rebinding handlers.
      if (cbRef.current) {
        (map as unknown as { on: Function }).on("click", (e: { latlng: { lat: number; lng: number } }) => {
          marker.setLatLng(e.latlng);
          cbRef.current?.(e.latlng.lat, e.latlng.lng);
        });
        (marker as unknown as { on: Function }).on("dragend", () => {
          const ll = (marker as unknown as { getLatLng: () => { lat: number; lng: number } }).getLatLng();
          cbRef.current?.(ll.lat, ll.lng);
        });
      }

      handles.current = {
        map: map as unknown as { remove: () => void; setView: (...args: unknown[]) => void },
        marker: marker as unknown as { setLatLng: (...args: unknown[]) => void },
      };
      cleanupFn = () => {
        (map as unknown as { remove: () => void }).remove();
      };
    })();

    return () => cleanupFn();
    // Init once; subsequent (lat,lng) changes go through the sync effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep marker + view in sync when lat/lng change externally (e.g. RHF
  // resets the form to a different chamber). Skipped on first render — the
  // init effect above already places everything correctly.
  useEffect(() => {
    if (!handles.current.map || !handles.current.marker) return;
    handles.current.marker.setLatLng([lat, lng]);
    handles.current.map.setView([lat, lng], zoom);
  }, [lat, lng, zoom]);

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
