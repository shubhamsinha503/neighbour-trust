"use client";

/**
 * A native 2D sun-shadow map for a locality.
 *
 * MapLibre GL draws the buildings from free OpenStreetMap vector tiles
 * (OpenFreeMap, no key). The shadows are computed here, not by the GPU: for each
 * building footprint we translate it away from the sun by height / tan(sun
 * elevation) and take the convex hull of the footprint and its translate — a
 * drop shadow on the ground — redrawn whenever the time slider moves.
 *
 * MapLibre is loaded from a CDN rather than bundled: its tile-parsing web worker
 * does not survive Next's bundler here (the worker 404s and no tiles ever load),
 * and the CDN build ships the worker alongside the library so it just works.
 *
 * Honesty: heights come from OpenStreetMap, present for some buildings and not
 * others; where a height is missing we assume a low-rise default and say so.
 * This is a shadow estimate, labelled as one — not a survey of a specific flat.
 */

import { useEffect, useRef, useState } from "react";
import * as SunCalc from "suncalc";
import transformTranslate from "@turf/transform-translate";
import convex from "@turf/convex";
import { featureCollection, polygon } from "@turf/helpers";
import type { Feature, Polygon, Position } from "geojson";

const MAPLIBRE_VERSION = "4.7.1";
const MAPLIBRE_JS = `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.js`;
const MAPLIBRE_CSS = `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.css`;

// Buildings with no mapped height are assumed roughly three storeys — the Indian
// residential norm. Labelled on the card so the estimate is never hidden.
const DEFAULT_HEIGHT_M = 9;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MapLibre = any;

let loadPromise: Promise<MapLibre> | null = null;
function loadMaplibre(): Promise<MapLibre> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  const w = window as unknown as { maplibregl?: MapLibre };
  if (w.maplibregl) return Promise.resolve(w.maplibregl);
  if (loadPromise) return loadPromise;
  loadPromise = new Promise<MapLibre>((resolve, reject) => {
    if (!document.querySelector(`link[data-maplibre]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = MAPLIBRE_CSS;
      link.dataset.maplibre = "1";
      document.head.appendChild(link);
    }
    const script = document.createElement("script");
    script.src = MAPLIBRE_JS;
    script.async = true;
    script.onload = () => resolve((window as unknown as { maplibregl: MapLibre }).maplibregl);
    script.onerror = () => reject(new Error("failed to load MapLibre"));
    document.head.appendChild(script);
  });
  return loadPromise;
}

function fmtClock(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h < 12 ? "am" : "pm";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function ShadowMap({
  name,
  lat,
  lon,
}: {
  name: string;
  lat: number;
  lon: number;
}) {
  const container = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibre>(null);
  const readyRef = useRef(false);
  // The map's own event handlers (load, moveend) capture drawShadows once, so
  // they must not read the sun from the render closure — that would freeze the
  // shadows at whatever time the map first loaded. They read this ref instead,
  // which every render keeps current.
  const sunRef = useRef({ altitude: 0, azimuth: 0, isDay: false });

  const [mins, setMins] = useState(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });

  const date = new Date();
  date.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
  const sun = SunCalc.getPosition(date, lat, lon);
  const altitude = sun.altitude; // degrees in this suncalc build
  const azimuth = sun.azimuth; // compass bearing, degrees from north
  const isDay = altitude > 0;
  sunRef.current = { altitude, azimuth, isDay };

  function drawShadows() {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const source = map.getSource("nt-shadows");
    if (!source) return;

    const { altitude, azimuth, isDay } = sunRef.current;
    if (!isDay) {
      source.setData(featureCollection([]));
      return;
    }

    const feats = map.querySourceFeatures("openmaptiles", { sourceLayer: "building" });
    const bearing = (azimuth + 180) % 360; // shadow falls away from the sun
    const shadows: Feature<Polygon>[] = [];
    const seen = new Set<string>();

    for (const f of feats) {
      if (!f.geometry) continue;
      const props = (f.properties || {}) as Record<string, unknown>;
      const h =
        (typeof props.render_height === "number" && props.render_height) ||
        (typeof props.height === "number" && props.height) ||
        DEFAULT_HEIGHT_M;
      const shadowLen = h / Math.tan((altitude * Math.PI) / 180); // metres

      const geom = f.geometry as Polygon | { type: "MultiPolygon"; coordinates: Position[][][] };
      const rings: Position[][][] =
        geom.type === "Polygon"
          ? [geom.coordinates]
          : geom.type === "MultiPolygon"
            ? geom.coordinates
            : [];

      for (const ring of rings) {
        if (!ring[0] || ring[0].length < 4) continue;
        const key = ring[0][0].join(",") + ":" + h;
        if (seen.has(key)) continue;
        seen.add(key);
        try {
          const foot = polygon(ring);
          const moved = transformTranslate(foot, shadowLen / 1000, bearing);
          const hull = convex(featureCollection([foot, moved]));
          if (hull) shadows.push(hull);
        } catch {
          /* a malformed ring just contributes no shadow */
        }
      }
    }

    source.setData(featureCollection(shadows));
  }

  useEffect(() => {
    let cancelled = false;

    loadMaplibre()
      .then((maplibregl: MapLibre) => {
        if (cancelled || !container.current || mapRef.current) return;

        const map = new maplibregl.Map({
          container: container.current,
          style: "https://tiles.openfreemap.org/styles/liberty",
          center: [lon, lat],
          zoom: 16,
          pitch: 0,
          attributionControl: { compact: true },
        });
        mapRef.current = map;
        map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");

        map.on("load", () => {
          map.addSource("nt-shadows", { type: "geojson", data: featureCollection([]) });
          const firstSymbol = map
            .getStyle()
            .layers?.find((l: { type: string }) => l.type === "symbol")?.id;
          map.addLayer(
            {
              id: "nt-shadow-fill",
              type: "fill",
              source: "nt-shadows",
              paint: { "fill-color": "#334a6b", "fill-opacity": 0.42 },
            },
            firstSymbol,
          );
          readyRef.current = true;
          drawShadows();
          // Building tiles can finish parsing just after 'load'; redraw once so
          // the first view is not shadowless.
          setTimeout(drawShadows, 800);
        });

        // Redraw for the new area after a pan or zoom — not on every render,
        // which would recompute thousands of hulls in a loop.
        map.on("moveend", drawShadows);
      })
      .catch(() => {
        /* handled by the fallback UI when the map never becomes ready */
      });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      readyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon]);

  // Debounced so dragging the slider does not recompute thousands of hulls on
  // every intermediate value — it redraws once the slider settles.
  useEffect(() => {
    const t = setTimeout(drawShadows, 90);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mins]);

  return (
    <div className="overflow-hidden rounded-[20px] border border-hairline bg-surface-1">
      <div ref={container} className="h-[420px] w-full" />
      <div className="border-t border-hairline px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[12.5px] font-semibold text-ink-primary">{fmtClock(mins)}</div>
          <div className="text-[11px] text-ink-secondary">
            {isDay
              ? `sun ${Math.round(altitude)}° above the horizon`
              : "before sunrise / after sunset — no direct sun"}
          </div>
        </div>
        <input
          type="range"
          min={0}
          max={1439}
          step={5}
          value={mins}
          onChange={(e) => setMins(Number(e.target.value))}
          className="mt-2 w-full accent-brand"
          aria-label="Time of day"
        />
        <p className="mt-2 text-[10.5px] leading-[1.5] text-ink-muted">
          Shadows for {name} at the time above. Building heights are from
          OpenStreetMap; where a height is not mapped the building is assumed
          low-rise, so this is an estimate of shade, not a survey of a specific
          flat.
        </p>
      </div>
    </div>
  );
}
