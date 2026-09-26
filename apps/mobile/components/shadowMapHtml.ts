/**
 * The HTML document that runs inside the Sun & Shadow WebView.
 *
 * It is the native port of apps/web/components/ShadowMap.tsx: MapLibre GL draws
 * OpenStreetMap buildings from free vector tiles, and the shadows are computed on
 * the JS side — each building footprint is translated away from the sun by
 * height / tan(sun elevation) and unioned with itself via a convex hull to make a
 * ground drop-shadow, redrawn whenever the time slider moves.
 *
 * Everything (MapLibre, turf, suncalc) loads from a CDN, exactly like the web
 * component, so the WebView needs no bundled map stack. suncalc on the CDN is the
 * 1.9.0 build (radians, azimuth from south), so its output is converted here to
 * degrees-from-north to match the rest of the app.
 *
 * Honesty is carried over verbatim: OSM heights exist for some buildings and not
 * others; missing ones assume a ~3-storey default, and the caption says so. This
 * is a labelled estimate, not a survey of a specific flat.
 */

interface Labels {
  missingHeights: string;
  beforeAfter: string;
  sunAbove: string; // contains {deg}
  loading: string;
}

export function shadowMapHtml({
  lat,
  lon,
  labels,
}: {
  lat: number;
  lon: number;
  labels: Labels;
}): string {
  const cfg = JSON.stringify({ lat, lon, labels });
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<link href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css" rel="stylesheet" />
<style>
  :root { --brand:#F72575; --ink:#0F172A; --muted:#64748B; --hairline:#E2E8F0; }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  html, body { margin:0; padding:0; height:100%; font-family: -apple-system, Roboto, "Segoe UI", sans-serif; background:#F8FAFC; }
  #map { position:absolute; top:0; left:0; right:0; bottom:120px; }
  #panel { position:absolute; left:0; right:0; bottom:0; height:120px; background:#fff; border-top:1px solid var(--hairline); padding:12px 16px; }
  #row { display:flex; align-items:center; justify-content:space-between; gap:12px; }
  #clock { font-size:15px; font-weight:700; color:var(--ink); }
  #sun { font-size:11px; color:var(--muted); text-align:right; }
  #slider { width:100%; margin-top:12px; accent-color: var(--brand); height:28px; }
  #note { font-size:10.5px; color:var(--muted); margin-top:2px; }
  #loading { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; color:var(--muted); font-size:14px; background:#F8FAFC; }
</style>
</head>
<body>
<div id="map"></div>
<div id="loading">…</div>
<div id="panel">
  <div id="row">
    <div id="clock">—</div>
    <div id="sun"></div>
  </div>
  <input id="slider" type="range" min="0" max="1439" step="5" />
  <div id="note"></div>
</div>
<script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
<script src="https://unpkg.com/suncalc@1.9.0/suncalc.js"></script>
<script src="https://unpkg.com/@turf/turf@7.1.0/turf.min.js"></script>
<script>
(function () {
  var CFG = ${cfg};
  var LAT = CFG.lat, LON = CFG.lon, L = CFG.labels;
  var DEFAULT_HEIGHT_M = 9;

  var loadingEl = document.getElementById('loading');
  var clockEl = document.getElementById('clock');
  var sunEl = document.getElementById('sun');
  var noteEl = document.getElementById('note');
  var slider = document.getElementById('slider');
  loadingEl.textContent = L.loading;
  noteEl.textContent = L.missingHeights;

  function fmtClock(mins) {
    var h = Math.floor(mins / 60), m = mins % 60;
    var ampm = h < 12 ? 'am' : 'pm';
    var h12 = ((h + 11) % 12) + 1;
    return h12 + ':' + String(m).padStart(2, '0') + ' ' + ampm;
  }

  // suncalc 1.9.0: altitude in radians, azimuth in radians measured from south.
  // Convert to degrees and a compass bearing from north to match the app.
  function sunAt(mins) {
    var d = new Date();
    d.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
    var p = SunCalc.getPosition(d, LAT, LON);
    var altitude = p.altitude * 180 / Math.PI;
    var azimuth = (p.azimuth * 180 / Math.PI + 180) % 360;
    return { altitude: altitude, azimuth: azimuth, isDay: altitude > 0 };
  }

  var now = new Date();
  var mins = now.getHours() * 60 + now.getMinutes();
  slider.value = String(mins);

  var footprints = [];
  var ready = false;
  var map;

  function collectFootprints() {
    if (!map || !ready) return;
    var b = map.getBounds();
    var pad = 0.004;
    var west = b.getWest() - pad, east = b.getEast() + pad;
    var south = b.getSouth() - pad, north = b.getNorth() + pad;
    var feats = map.querySourceFeatures('openmaptiles', { sourceLayer: 'building' });
    var out = [], seen = {};
    for (var i = 0; i < feats.length; i++) {
      var f = feats[i];
      if (!f.geometry) continue;
      var props = f.properties || {};
      var h = (typeof props.render_height === 'number' && props.render_height) ||
              (typeof props.height === 'number' && props.height) || DEFAULT_HEIGHT_M;
      var geom = f.geometry;
      var rings = geom.type === 'Polygon' ? [geom.coordinates]
                : geom.type === 'MultiPolygon' ? geom.coordinates : [];
      for (var r = 0; r < rings.length; r++) {
        var ring = rings[r];
        if (!ring[0] || ring[0].length < 4) continue;
        var lng = ring[0][0][0], la = ring[0][0][1];
        if (lng < west || lng > east || la < south || la > north) continue;
        var key = Math.round(lng * 1e5) + ',' + Math.round(la * 1e5) + ':' + h;
        if (seen[key]) continue;
        seen[key] = 1;
        out.push({ ring: ring, h: h });
      }
    }
    footprints = out;
    paintShadows();
  }

  function paintShadows() {
    if (!map || !ready) return;
    var source = map.getSource('nt-shadows');
    if (!source) return;
    var s = sunAt(Number(slider.value));
    clockEl.textContent = fmtClock(Number(slider.value));
    sunEl.textContent = s.isDay
      ? L.sunAbove.replace('{deg}', String(Math.round(s.altitude)))
      : L.beforeAfter;
    if (!s.isDay) { source.setData(turf.featureCollection([])); return; }
    var bearing = (s.azimuth + 180) % 360;
    var tan = Math.tan(s.altitude * Math.PI / 180);
    var shadows = [];
    for (var i = 0; i < footprints.length; i++) {
      try {
        var foot = turf.polygon(footprints[i].ring);
        var moved = turf.transformTranslate(foot, footprints[i].h / tan / 1000, bearing);
        var hull = turf.convex(turf.featureCollection([foot, moved]));
        if (hull) shadows.push(hull);
      } catch (e) {}
    }
    source.setData(turf.featureCollection(shadows));
  }

  slider.addEventListener('input', paintShadows);

  function start() {
    if (typeof maplibregl === 'undefined' || typeof turf === 'undefined' || typeof SunCalc === 'undefined') {
      loadingEl.textContent = '';
      return;
    }
    map = new maplibregl.Map({
      container: 'map',
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [LON, LAT],
      zoom: 16,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
    map.on('load', function () {
      loadingEl.style.display = 'none';
      map.addSource('nt-shadows', { type: 'geojson', data: turf.featureCollection([]) });
      var layers = map.getStyle().layers || [];
      var firstSymbol;
      for (var i = 0; i < layers.length; i++) { if (layers[i].type === 'symbol') { firstSymbol = layers[i].id; break; } }
      map.addLayer({ id: 'nt-shadow-fill', type: 'fill', source: 'nt-shadows',
        paint: { 'fill-color': '#334a6b', 'fill-opacity': 0.42 } }, firstSymbol);
      ready = true;
      collectFootprints();
      setTimeout(collectFootprints, 800);
      setTimeout(collectFootprints, 2500);
    });
    map.on('sourcedata', function (e) {
      if (e.sourceId === 'openmaptiles' && e.isSourceLoaded && footprints.length === 0) collectFootprints();
    });
    map.on('moveend', collectFootprints);
  }

  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start);
})();
</script>
</body>
</html>`;
}
