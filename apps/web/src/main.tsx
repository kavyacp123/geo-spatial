import { StrictMode, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibregl from 'maplibre-gl';
import './styles.css';
import { H3_DEMO, UNDERSERVED_DEMO, RAW_DEMO, circlePolygon, hotspotsForProfile, poiForProfile, poiRelevance, POI_LENS, RELEVANT_THRESHOLD } from './demo';
import { buildReportHtml, openReport, toCsv } from './report';
import { fetchCatalog, fetchFeatures, fetchHotspots, fetchH3, fetchIsochrone, postServerReport, uploadLayer, downloadJSON } from './livedata';
import type { FC, IsoResult } from './livedata';

type Factor = { id: string; label: string; weight: number; layerKind: string };
type Profile = { id: string; label: string; summary: string; factors: Factor[]; constraints: string[] };
type Basemap = 'dark' | 'osm';
type Coords = { lat: number; lng: number };
type ScoreFactor = {
  factor_id: string;
  label: string;
  raw_value: number;
  unit: string;
  normalized_value: number;
  weight: number;
  contribution: number;
  quality: string;
  method?: string | null;
  layer_version_id?: string | null;
};
type ScoreResponse = {
  score: number;
  eligibility: string;
  score_config_version: number;
  weight_source: string;
  persisted?: boolean;
  factors: ScoreFactor[];
  constraints: { id: string; effect: string; message: string; triggered?: boolean; layer_version_id?: string | null }[];
  input_manifest: { study_area: string; notice: string; weights: Record<string, number>; layer_versions?: string[] };
  generated_at: string;
  analysis_run_id: string;
  candidate_id: string;
};

const API = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';
const GUJARAT_CENTER: [number, number] = [72.5714, 23.0225];
const DARK_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const LIGHT_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

function useCountUp(target: number | null, duration = 900): number {
  const [val, setVal] = useState(0);
  const fromRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    if (target === null || target === undefined) { setVal(0); fromRef.current = 0; return; }
    const from = fromRef.current;
    const to = target;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(from + (to - from) * eased);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration]);
  return val;
}

const SEEDED: { id: string; label: string; coords: [number, number]; note: string }[] = [
  { id: 'sg-highway', label: 'Ahmedabad — SG Highway', coords: [72.505, 23.033], note: 'Highway retail cluster' },
  { id: 'maninagar', label: 'Ahmedabad — Maninagar', coords: [72.602, 22.998], note: 'Dense residential' },
  { id: 'surat-vesu', label: 'Surat — Vesu', coords: [72.769, 21.145], note: 'Rapid growth corridor' },
  { id: 'vadodara-alkapuri', label: 'Vadodara — Alkapuri', coords: [73.181, 22.311], note: 'Mixed commercial' },
  { id: 'rajkot-ring', label: 'Rajkot — 150ft Ring Rd', coords: [70.786, 22.303], note: 'Logistics hub' },
];

const RAW_KINDS = ['demographics', 'transport', 'poi', 'land_use', 'environmental_risk'] as const;
const ISO_MIN = [10, 20, 30] as const;
const ISO_CFG: Record<number, { radius: number; color: string; label: string }> = {
  10: { radius: 667 * 10, color: '#2dd4a7', label: '10 min · ~6.7 km' },
  20: { radius: 667 * 20, color: '#f5b942', label: '20 min · ~13.3 km' },
  30: { radius: 667 * 30, color: '#7c8cff', label: '30 min · ~20 km' },
};

function osmStyle(): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '© OpenStreetMap contributors',
        maxzoom: 19,
      },
    },
    layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
  };
}

function initialProfile(): string {
  const q = new URLSearchParams(window.location.search).get('profile');
  return q && q.length > 0 ? q : 'fmcg_retail';
}

function styleKeyOf(b: Basemap, t: string): string {
  return b === 'osm' ? 'osm' : t === 'light' ? 'light' : 'dark';
}

function polyBbox(ring: [number, number][]): [number, number, number, number] {
  const xs = ring.map((p) => p[0]);
  const ys = ring.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

function orbClass(score: number | null, eligibility: string, scoring: boolean): string {
  if (scoring) return 'orb scoring';
  if (score === null) return 'orb';
  if (eligibility === 'ineligible') return 'orb live bad';
  if (eligibility === 'warning' || eligibility === 'capped') return 'orb live warn';
  if (score >= 70) return 'orb live';
  if (score >= 45) return 'orb live warn';
  return 'orb live bad';
}

function eligibilityLabel(e: string): { text: string; cls: string } {
  if (e === 'eligible') return { text: 'ELIGIBLE', cls: 'ok' };
  if (e === 'warning') return { text: 'WARNING', cls: 'warn' };
  if (e === 'capped') return { text: 'CAPPED', cls: 'warn' };
  if (e === 'ineligible') return { text: 'INELIGIBLE', cls: 'bad' };
  return { text: 'DEMO · AWAITING SCORE', cls: 'demo' };
}

function ensureDemoLayers(map: maplibregl.Map) {
  const add = () => {
    if (!map.isStyleLoaded()) return;
    if (!map.getSource('h3')) map.addSource('h3', { type: 'geojson', data: H3_DEMO as unknown as GeoJSON.FeatureCollection });
    if (!map.getSource('hotspots')) map.addSource('hotspots', { type: 'geojson', data: hotspotsForProfile(initialProfile()) as unknown as GeoJSON.FeatureCollection });
    if (!map.getSource('underserved')) map.addSource('underserved', { type: 'geojson', data: UNDERSERVED_DEMO as unknown as GeoJSON.FeatureCollection });
    for (const k of RAW_KINDS) {
      const id = `raw-${k}`;
      const data = k === 'poi' ? poiForProfile(initialProfile()) : RAW_DEMO[k];
      if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: (data as unknown as GeoJSON.FeatureCollection) ?? { type: 'FeatureCollection', features: [] } });
    }
    if (!map.getSource('draw')) map.addSource('draw', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    if (!map.getSource('isochrones')) map.addSource('isochrones', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    if (!map.getLayer('h3-fill')) {
      map.addLayer({
        id: 'h3-fill',
        type: 'fill',
        source: 'h3',
        paint: {
          'fill-color': ['interpolate', ['linear'], ['get', 'score'], 12, '#1b2440', 34, '#2c3a6e', 50, '#3d4b60', 62, '#8a6b2e', 75, '#f5b942', 92, '#ffd56e'],
          'fill-opacity': 0.42,
        },
      });
    }
    if (!map.getLayer('h3-outline')) map.addLayer({ id: 'h3-outline', type: 'line', source: 'h3', paint: { 'line-color': 'rgba(255,255,255,0.16)', 'line-width': 0.8, 'line-opacity': 0.9 } });
    if (!map.getLayer('underserved-fill')) map.addLayer({ id: 'underserved-fill', type: 'fill', source: 'underserved', paint: { 'fill-color': 'rgba(45,212,167,0.10)', 'fill-opacity': 0.9 } });
    if (!map.getLayer('underserved-outline')) map.addLayer({ id: 'underserved-outline', type: 'line', source: 'underserved', paint: { 'line-color': '#2dd4a7', 'line-width': 1.8, 'line-dasharray': [4, 3], 'line-opacity': 0.95 } });
    if (!map.getLayer('hotspots-halo')) map.addLayer({ id: 'hotspots-halo', type: 'circle', source: 'hotspots', paint: { 'circle-radius': ['interpolate', ['linear'], ['coalesce', ['get', 'weight'], 1], 1, 12, 6, 26], 'circle-color': '#ff5d3a', 'circle-opacity': 0.16, 'circle-blur': 0.4 } });
    if (!map.getLayer('hotspots-core')) map.addLayer({ id: 'hotspots-core', type: 'circle', source: 'hotspots', paint: { 'circle-radius': 6.5, 'circle-color': '#ff5d3a', 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.4, 'circle-opacity': 0.95 } });
    if (!map.getLayer('raw-demographics-fill')) {
      map.addLayer({ id: 'raw-demographics-fill', type: 'fill', source: 'raw-demographics', paint: { 'fill-color': '#2dd4a7', 'fill-opacity': 0.24 } });
      map.addLayer({ id: 'raw-demographics-outline', type: 'line', source: 'raw-demographics', paint: { 'line-color': 'rgba(45,212,167,0.55)', 'line-width': 1 } });
    }
    if (!map.getLayer('raw-transport-line')) map.addLayer({ id: 'raw-transport-line', type: 'line', source: 'raw-transport', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#7c8cff', 'line-width': 2.4, 'line-opacity': 0.9 } });
    if (!map.getLayer('raw-poi-circle')) {
      map.addLayer({
        id: 'raw-poi-circle',
        type: 'circle',
        source: 'raw-poi',
        paint: { 'circle-radius': ['interpolate', ['linear'], ['coalesce', ['get', 'relevance'], 1], 0, 3, 1, 6], 'circle-color': ['match', ['get', 'kind'], 'competitor', '#ff5d3a', 'complementary', '#f5b942', '#7c8cff'], 'circle-stroke-color': '#06110d', 'circle-stroke-width': 1, 'circle-opacity': ['*', ['coalesce', ['get', 'relevance'], 1], 0.95] },
      });
    }
    if (!map.getLayer('raw-landuse-fill')) {
      map.addLayer({ id: 'raw-landuse-fill', type: 'fill', source: 'raw-land_use', paint: { 'fill-color': ['match', ['get', 'zoning'], 'commercial', '#7c8cff', 'industrial', '#5a6cff', '#7c8cff'], 'fill-opacity': 0.22 } });
      map.addLayer({ id: 'raw-landuse-outline', type: 'line', source: 'raw-land_use', paint: { 'line-color': 'rgba(124,140,255,0.6)', 'line-width': 1 } });
    }
    if (!map.getLayer('raw-risk-fill')) {
      map.addLayer({ id: 'raw-risk-fill', type: 'fill', source: 'raw-risk', paint: { 'fill-color': '#ff5d3a', 'fill-opacity': 0.18 } });
      map.addLayer({ id: 'raw-risk-outline', type: 'line', source: 'raw-risk', paint: { 'line-color': '#ff5d3a', 'line-width': 1.4, 'line-dasharray': [6, 4], 'line-opacity': 0.85 } });
    }
    if (!map.getLayer('iso-fill')) {
      map.addLayer({
        id: 'iso-fill',
        type: 'fill',
        source: 'isochrones',
        paint: {
          'fill-color': ['match', ['get', 'minutes'], 10, '#2dd4a7', 20, '#f5b942', 30, '#7c8cff', '#2dd4a7'],
          'fill-opacity': 0.14,
        },
      });
    }
    if (!map.getLayer('iso-outline')) {
      map.addLayer({
        id: 'iso-outline',
        type: 'line',
        source: 'isochrones',
        paint: { 'line-color': ['match', ['get', 'minutes'], 10, '#2dd4a7', 20, '#f5b942', 30, '#7c8cff', '#2dd4a7'], 'line-width': 1.8, 'line-dasharray': [6, 4], 'line-opacity': 0.95 },
      });
    }
    if (!map.getLayer('iso-label')) {
      map.addLayer({
        id: 'iso-label',
        type: 'symbol',
        source: 'isochrones',
        layout: { 'text-field': ['concat', ['to-string', ['get', 'minutes']], ' min · DEMO'], 'text-size': 11, 'text-anchor': 'center', 'text-allow-overlap': true },
        paint: { 'text-color': '#c9ddd7', 'text-halo-color': '#06090e', 'text-halo-width': 1.4 },
      });
    }
    if (!map.getLayer('draw-fill')) {
      map.addLayer({ id: 'draw-fill', type: 'fill', source: 'draw', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#f5b942', 'fill-opacity': 0.12 } });
      map.addLayer({ id: 'draw-outline', type: 'line', source: 'draw', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'line-color': '#f5b942', 'line-width': 2, 'line-dasharray': [8, 4] } });
      map.addLayer({ id: 'draw-line', type: 'line', source: 'draw', filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': '#f5b942', 'line-width': 2, 'line-dasharray': [8, 4] } });
      map.addLayer({ id: 'draw-vertex', type: 'circle', source: 'draw', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 5, 'circle-color': '#f5b942', 'circle-stroke-color': '#06090e', 'circle-stroke-width': 2 } });
    }
  };
  add();
}

function App() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [id, setId] = useState(initialProfile);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [basemap, setBasemap] = useState<Basemap>('dark');
  const [entered, setEntered] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      const s = localStorage.getItem('geoready-theme');
      if (s === 'light' || s === 'dark') return s as 'dark' | 'light';
    } catch {
      void 0;
    }
    return 'dark';
  });
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [weightsOpen, setWeightsOpen] = useState(true);
  const [scoreData, setScoreData] = useState<ScoreResponse | null>(null);
  const [scoring, setScoring] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [showH3, setShowH3] = useState(true);
  const [showHotspots, setShowHotspots] = useState(true);
  const [showUnderserved, setShowUnderserved] = useState(true);
  const [rawVis, setRawVis] = useState<Record<string, boolean>>({ demographics: true, transport: true, poi: true, land_use: false, environmental_risk: true });
  const [rawOp, setRawOp] = useState<Record<string, number>>({ demographics: 0.45, transport: 0.9, poi: 0.9, land_use: 0.35, environmental_risk: 0.4 });
  const [drawActive, setDrawActive] = useState(false);
  const [drawVerts, setDrawVerts] = useState<[number, number][]>([]);
  const [searchPoly, setSearchPoly] = useState<GeoJSON.Feature<GeoJSON.Polygon> | null>(null);
  const [iso, setIso] = useState<Record<number, boolean>>({ 10: true, 20: false, 30: false });
  const [compare, setCompare] = useState<Array<{ key: string; label: string; coords: Coords; data: ScoreResponse }>>([]);
  const [mapReady, setMapReady] = useState(false);
  const [mapTick, setMapTick] = useState(0);
  // live PostGIS state — null means "fall back to demo.ts"; liveOk drives the legend badge
  const [liveOk, setLiveOk] = useState(false);
  const [livePoiRaw, setLivePoiRaw] = useState<FC | null>(null);
  const [liveRaw, setLiveRaw] = useState<Partial<Record<string, FC>>>({});
  const [liveH3, setLiveH3] = useState<FC | null>(null);
  const [liveHot, setLiveHot] = useState<FC | null>(null);
  const [serverIso, setServerIso] = useState<IsoResult | null>(null);
  const [isoRouting, setIsoRouting] = useState(false);
  const [catalogSeq, setCatalogSeq] = useState(0);
  const [upKind, setUpKind] = useState<string>('poi');
  const [upName, setUpName] = useState('');
  const [upMode, setUpMode] = useState<'file' | 'geojson' | 'wkt'>('file');
  const [upText, setUpText] = useState('');
  const [upMsg, setUpMsg] = useState<string | null>(null);
  const [upBusy, setUpBusy] = useState(false);
  const animatedScore = useCountUp(scoreData?.score ?? null, 900);

  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const styleKeyRef = useRef<string | null>(null);
  // refs to avoid stale closure in map click
  const weightsRef = useRef(weights);
  const idRef = useRef(id);
  const dirtyRef = useRef(false);
  const sumOkRef = useRef(true);
  const drawActiveRef = useRef(drawActive);
  const drawVertsRef = useRef(drawVerts);
  const coordsRef = useRef(coords);

  useEffect(() => {
    weightsRef.current = weights;
  }, [weights]);
  useEffect(() => {
    idRef.current = id;
  }, [id]);
  useEffect(() => {
    drawActiveRef.current = drawActive;
  }, [drawActive]);
  useEffect(() => {
    drawVertsRef.current = drawVerts;
  }, [drawVerts]);
  useEffect(() => {
    coordsRef.current = coords;
  }, [coords]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('geoready-theme', theme);
    } catch {
      void 0;
    }
  }, [theme]);

  useEffect(() => {
    fetch(`${API}/api/v1/site-types`)
      .then((r) => {
        if (!r.ok) throw new Error('bad status');
        return r.json();
      })
      .then((d) => {
        setProfiles(d.data);
        setStatus('ready');
      })
      .catch(() => setStatus('error'));
  }, []);

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    styleKeyRef.current = styleKeyOf(basemap, theme);
    const initStyle = basemap === 'osm' ? osmStyle() : theme === 'light' ? LIGHT_STYLE : DARK_STYLE;
    const map = new maplibregl.Map({
      container: mapEl.current,
      style: initStyle as unknown as string,
      center: GUJARAT_CENTER,
      zoom: 7,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.on('load', () => { ensureDemoLayers(map); setMapReady(true); });
    map.on('styledata', () => { ensureDemoLayers(map); setMapTick((t) => t + 1); });
    map.on('click', (e) => {
      if (drawActiveRef.current) {
        const cur = drawVertsRef.current ?? [];
        const next: [number, number][] = [...cur, [e.lngLat.lng, e.lngLat.lat]];
        setDrawVerts(next);
        return;
      }
      void handlePickWithRefs(e.lngLat.lat, e.lngLat.lng, true);
    });
    map.on('dblclick', (e) => {
      if (drawActiveRef.current) {
        e.preventDefault();
        finishDraw();
      }
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // map init once
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // Never re-request the style that's already showing: redundant setStyle calls
    // abort in-flight loads and can strand the canvas blank until a full refresh.
    const key = styleKeyOf(basemap, theme);
    if (styleKeyRef.current === key) return;
    styleKeyRef.current = key;
    const style = basemap === 'osm' ? osmStyle() : theme === 'light' ? LIGHT_STYLE : DARK_STYLE;
    // diff:false — full reload. Diffing across basemap styles is a known blank-canvas
    // hazard (custom layers torn down mid-diff); our styledata handler re-adds everything.
    map.setStyle(style as unknown as string, { diff: false });
  }, [basemap, theme]);

  // live catalog: layer ids per kind, then features — null keeps demo.ts fallbacks
  useEffect(() => {
    let live = true;
    (async () => {
      const cat = await fetchCatalog(API);
      if (!live) return;
      if (!cat) { setLiveOk(false); return; }
      setLiveOk(true);
      const byKind: Record<string, string> = {};
      for (const l of cat) if (!byKind[l.kind]) byKind[l.kind] = l.id;
      const raw: Partial<Record<string, FC>> = {};
      let poi: FC | null = null;
      await Promise.all(
        (['demographics', 'transport', 'poi', 'land_use', 'environmental_risk'] as const).map(async (k) => {
          const lid = byKind[k];
          if (!lid) return;
          const fc = await fetchFeatures(API, lid);
          if (!live || !fc) return;
          if (k === 'poi') poi = fc;
          else raw[k] = fc;
        }),
      );
      if (!live) return;
      setLivePoiRaw(poi);
      setLiveRaw(raw);
    })();
    return () => { live = false; };
  }, [catalogSeq]);

  // server H3 per product, scoped to the drawn search polygon when present — null keeps demo honeycomb
  useEffect(() => {
    let live = true;
    (async () => {
      const bbox = searchPoly ? polyBbox(searchPoly.geometry.coordinates[0] as [number, number][]) : null;
      const h3 = await fetchH3(API, id, bbox);
      if (live) setLiveH3(h3);
    })();
    return () => { live = false; };
  }, [id, searchPoly]);

  // server hotspots per product — null keeps demo-derived circles
  useEffect(() => {
    let live = true;
    (async () => {
      const h = await fetchHotspots(API, id);
      if (live) setLiveHot(h);
    })();
    return () => { live = false; };
  }, [id]);

  // relevance-stamped POIs: live features when PostGIS is up, demo points otherwise
  const stampedPoi = useMemo<FC>(() => {
    const base = livePoiRaw ?? poiForProfile(id);
    return {
      type: 'FeatureCollection',
      features: base.features.map((f) => {
        const props = (f.properties ?? {}) as Record<string, unknown>;
        return {
          ...f,
          properties: {
            ...props,
            relevance: poiRelevance(id, String(props.category ?? props.kind ?? ''), String(props.sub ?? '')),
          },
        };
      }),
    } as FC;
  }, [livePoiRaw, id]);
  const effHot = useMemo<FC>(() => liveHot ?? hotspotsForProfile(id), [liveHot, id]);
  const effH3 = useMemo<FC>(() => liveH3 ?? H3_DEMO, [liveH3]);

  // profile lens: interest points + derived hotspot circles follow the selected product
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !mapReady) return;
    if (m.getSource('hotspots')) (m.getSource('hotspots') as maplibregl.GeoJSONSource).setData(effHot as unknown as GeoJSON.FeatureCollection);
    if (m.getSource('raw-poi')) (m.getSource('raw-poi') as maplibregl.GeoJSONSource).setData(stampedPoi as unknown as GeoJSON.FeatureCollection);
    if (m.getSource('h3')) (m.getSource('h3') as maplibregl.GeoJSONSource).setData(effH3 as unknown as GeoJSON.FeatureCollection);
    for (const k of ['demographics', 'transport', 'land_use', 'environmental_risk'] as const) {
      const src = m.getSource(`raw-${k}`);
      const fc = liveRaw[k] ?? (RAW_DEMO[k] as unknown as FC);
      if (src && fc) (src as maplibregl.GeoJSONSource).setData(fc as unknown as GeoJSON.FeatureCollection);
    }
  }, [id, mapReady, mapTick, liveHot, liveH3, livePoiRaw, liveRaw, stampedPoi, effHot, effH3]);

  const lensInfo = useMemo(() => {
    const rel = stampedPoi.features.filter((f) => (((f.properties ?? {}) as Record<string, unknown>).relevance as number ?? 0) >= RELEVANT_THRESHOLD).length;
    const clusters = effHot.features.length;
    const lens = POI_LENS[id];
    return { rel, total: stampedPoi.features.length, clusters, blurb: lens?.blurb ?? '' };
  }, [id, stampedPoi, effHot]);

  // draw source sync
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !m.isStyleLoaded() || !m.getSource('draw')) return;
    const feats: GeoJSON.Feature[] = [];
    if (searchPoly) feats.push(searchPoly as unknown as GeoJSON.Feature);
    else if (drawVerts.length >= 2) feats.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: drawVerts }, properties: {} });
    drawVerts.forEach((v) => feats.push({ type: 'Feature', geometry: { type: 'Point', coordinates: v }, properties: { kind: 'vertex' } }));
    (m.getSource('draw') as maplibregl.GeoJSONSource).setData({ type: 'FeatureCollection', features: feats } as unknown as GeoJSON.FeatureCollection);
  }, [drawVerts, searchPoly]);

  // server isochrones per pin (OSRM routed + reachable population), null keeps geodesic demo
  useEffect(() => {
    if (!coords) { setServerIso(null); return; }
    let live = true;
    setIsoRouting(true);
    (async () => {
      const r = await fetchIsochrone(API, coords.lng, coords.lat, [10, 20, 30]);
      if (live) { setServerIso(r); setIsoRouting(false); }
    })();
    return () => { live = false; };
  }, [coords]);

  const popFor = (m: number): number | null => {
    const r = serverIso?.rings.find((x) => x.minutes === m);
    return r && typeof r.population === 'number' ? Math.round(r.population) : null;
  };

  // isochrone map sync — routed polygons when the server answers, else geodesic circles
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !m.getSource('isochrones')) return;
    if (!coords) {
      (m.getSource('isochrones') as maplibregl.GeoJSONSource).setData({ type: 'FeatureCollection', features: [] } as unknown as GeoJSON.FeatureCollection);
      return;
    }
    const feats: GeoJSON.Feature[] = [];
    if (serverIso) {
      for (const r of serverIso.rings) {
        if (!iso[r.minutes]) continue;
        feats.push({
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [r.polygon] },
          properties: { minutes: r.minutes, routed: r.routed, population: r.population ?? null },
        });
      }
    } else {
      for (const min of ISO_MIN) {
        if (!iso[min]) continue;
        const poly = circlePolygon([coords.lng, coords.lat], ISO_CFG[min].radius);
        (poly.properties as Record<string, unknown>)['minutes'] = min;
        feats.push(poly as unknown as GeoJSON.Feature);
      }
    }
    (m.getSource('isochrones') as maplibregl.GeoJSONSource).setData({ type: 'FeatureCollection', features: feats } as unknown as GeoJSON.FeatureCollection);
  }, [coords, iso, serverIso]);

  // keyboard ESC to cancel draw
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && drawActive) {
        setDrawActive(false);
        setDrawVerts([]);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [drawActive]);

  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    if (drawActive) m.doubleClickZoom.disable();
    else m.doubleClickZoom.enable();
  }, [drawActive]);

  useEffect(() => {
    const m = mapRef.current;
    if (!m || !m.isStyleLoaded()) return;
    ensureDemoLayers(m);
    const setVis = (lid: string, vis: boolean) => {
      if (m.getLayer(lid)) m.setLayoutProperty(lid, 'visibility', vis ? 'visible' : 'none');
    };
    setVis('h3-fill', showH3);
    setVis('h3-outline', showH3);
    setVis('underserved-fill', showUnderserved);
    setVis('underserved-outline', showUnderserved);
    setVis('hotspots-halo', showHotspots);
    setVis('hotspots-core', showHotspots);
    setVis('raw-demographics-fill', !!rawVis.demographics);
    setVis('raw-demographics-outline', !!rawVis.demographics);
    setVis('raw-transport-line', !!rawVis.transport);
    setVis('raw-poi-circle', !!rawVis.poi);
    setVis('raw-landuse-fill', !!rawVis.land_use);
    setVis('raw-landuse-outline', !!rawVis.land_use);
    setVis('raw-risk-fill', !!rawVis.environmental_risk);
    setVis('raw-risk-outline', !!rawVis.environmental_risk);
    // isochrones stay visible; per-minute filtering is data-driven
    if (m.getLayer('raw-demographics-fill')) m.setPaintProperty('raw-demographics-fill', 'fill-opacity', rawOp.demographics * 0.55);
    if (m.getLayer('raw-transport-line')) m.setPaintProperty('raw-transport-line', 'line-opacity', rawOp.transport);
    if (m.getLayer('raw-poi-circle')) m.setPaintProperty('raw-poi-circle', 'circle-opacity', ['*', ['coalesce', ['get', 'relevance'], 1], rawOp.poi] as unknown as number);
    if (m.getLayer('raw-landuse-fill')) m.setPaintProperty('raw-landuse-fill', 'fill-opacity', rawOp.land_use);
    if (m.getLayer('raw-risk-fill')) m.setPaintProperty('raw-risk-fill', 'fill-opacity', rawOp.environmental_risk * 0.45);
    // NOTE: theme + mapTick are deps on purpose — every setStyle wipes custom layers,
    // so toggles/opacity must re-apply once the new style finishes loading.
  }, [showH3, showHotspots, showUnderserved, rawVis, rawOp, basemap, theme, mapTick]);

  const profile = useMemo(() => profiles.find((p) => p.id === id) ?? null, [profiles, id]);

  useEffect(() => {
    if (!profile) return;
    const w: Record<string, number> = {};
    profile.factors.forEach((f) => (w[f.id] = f.weight));
    setWeights(w);
    setScoreData(null);
    setErr(null);
  }, [profile]);

  const sum = useMemo(() => Object.values(weights).reduce((a, b) => a + b, 0), [weights]);
  const sumOk = Math.abs(sum - 1) < 0.0001;
  const dirty = useMemo(() => {
    if (!profile) return false;
    return profile.factors.some((f) => Math.abs((weights[f.id] ?? 0) - f.weight) > 0.0005);
  }, [profile, weights]);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);
  useEffect(() => {
    sumOkRef.current = sumOk;
  }, [sumOk]);

  function pick(next: string) {
    setId(next);
    const url = new URL(window.location.href);
    url.searchParams.set('profile', next);
    window.history.replaceState(null, '', url);
  }

  function enter() {
    setEntered(true);
    mapRef.current?.flyTo({ center: GUJARAT_CENTER, zoom: 8, duration: 1200, essential: true });
  }

  async function handlePick(lat: number, lng: number, fromClick: boolean) {
    const map = mapRef.current;
    if (map) {
      markerRef.current?.remove();
      markerRef.current = new maplibregl.Marker({ color: '#2dd4a7' }).setLngLat([lng, lat]).addTo(map);
      if (!fromClick) map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 10), duration: 900 });
    }
    setCoords({ lat, lng });
    await doScore(lat, lng, weightsRef.current, idRef.current, dirtyRef.current && sumOkRef.current);
  }

  async function handlePickWithRefs(lat: number, lng: number, fromClick: boolean) {
    return handlePick(lat, lng, fromClick);
  }

  async function doScore(lat: number, lng: number, w: Record<string, number>, pid: string, useCustom: boolean) {
    setScoring(true);
    setErr(null);
    try {
      const body: Record<string, unknown> = { profile_id: pid, longitude: lng, latitude: lat };
      if (useCustom) body.weight_overrides = w;
      const res = await fetch(`${API}/api/v1/scores`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? data?.details ?? `HTTP ${res.status}`);
      setScoreData(data as ScoreResponse);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setScoreData(null); // never show a previous pin's score as if it belonged to this one
      setErr(msg.includes('failed to fetch') ? 'Analysis service is offline. Start the analysis container.' : msg);
    } finally {
      setScoring(false);
    }
  }

  function updateWeight(fid: string, v: number) {
    setWeights((prev) => ({ ...prev, [fid]: Math.round(v * 100) / 100 }));
  }

  function normalize() {
    const s = Object.values(weights).reduce((a, b) => a + b, 0);
    if (s === 0) return;
    const next: Record<string, number> = {};
    let acc = 0;
    const keys = Object.keys(weights);
    keys.forEach((k, i) => {
      if (i === keys.length - 1) next[k] = Math.round((1 - acc) * 100) / 100;
      else {
        const nv = Math.round((weights[k] / s) * 100) / 100;
        next[k] = nv;
        acc += nv;
      }
    });
    setWeights(next);
  }

  function reset() {
    if (!profile) return;
    const w: Record<string, number> = {};
    profile.factors.forEach((f) => (w[f.id] = f.weight));
    setWeights(w);
    if (coords) void doScore(coords.lat, coords.lng, w, id, false);
  }

  function startDraw() {
    setSearchPoly(null);
    setDrawVerts([]);
    setDrawActive(true);
    if (mapRef.current) mapRef.current.getCanvas().style.cursor = 'crosshair';
  }
  function finishDraw() {
    if (drawVerts.length < 3) return;
    const ring = [...drawVerts, drawVerts[0]];
    const feat: GeoJSON.Feature<GeoJSON.Polygon> = {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [ring] },
      properties: { kind: 'search_polygon', license: 'user-drawn', crs: 'EPSG:4326' },
    };
    setSearchPoly(feat);
    setDrawActive(false);
    setDrawVerts([]);
    if (mapRef.current) mapRef.current.getCanvas().style.cursor = '';
  }
  function cancelDraw() {
    setDrawActive(false);
    setDrawVerts([]);
    if (mapRef.current) mapRef.current.getCanvas().style.cursor = '';
  }
  function clearPoly() {
    setSearchPoly(null);
    setDrawVerts([]);
    setDrawActive(false);
  }

  async function submitUpload(e: React.FormEvent) {
    e.preventDefault();
    if (upBusy) return;
    setUpBusy(true);
    setUpMsg(null);
    const fileInput = document.getElementById('up-file') as HTMLInputElement | null;
    const file = fileInput?.files?.[0] ?? null;
    const r = await uploadLayer(API, {
      kind: upKind,
      name: upName.trim() || `${upKind} upload ${new Date().toISOString().slice(0, 10)}`,
      sourceName: 'user upload',
      file,
      geojsonText: upMode === 'geojson' ? upText : undefined,
      wktText: upMode === 'wkt' ? upText : undefined,
    });
    setUpMsg((r.ok ? '✓ ' : '✕ ') + r.message);
    setUpBusy(false);
    if (r.ok) {
      if (fileInput) fileInput.value = '';
      setUpText('');
      setCatalogSeq((s) => s + 1); // refresh live layers
    }
  }

  function pinCurrent() {
    if (!coords || !scoreData) return;
    if (compare.length >= 3) return;
    const key = `${coords.lat.toFixed(4)},${coords.lng.toFixed(4)}-${Date.now().toString(36)}`;
    const label = `Site ${String.fromCharCode(65 + compare.length)} — ${scoreData.score.toFixed(1)}`;
    setCompare((c) => [...c, { key, label, coords, data: scoreData }]);
  }
  function removePin(k: string) {
    setCompare((c) => c.filter((x) => x.key !== k));
  }
  function flyToPin(crd: Coords) {
    mapRef.current?.flyTo({ center: [crd.lng, crd.lat], zoom: 11, duration: 800 });
    markerRef.current?.remove();
    markerRef.current = new maplibregl.Marker({ color: '#f5b942' }).setLngLat([crd.lng, crd.lat]).addTo(mapRef.current!);
  }
  async function exportCompare() {
    if (compare.length === 0) return;
    // authoritative server report first (persisted runs + deltas); client payload offline
    const server = await postServerReport(
      API,
      compare.map((s) => ({ analysis_run_id: s.data.analysis_run_id, candidate_site_id: s.data.candidate_id })),
    );
    if (server) {
      downloadJSON(`geoready-report-${id}-${new Date().toISOString().slice(0, 10)}.json`, {
        ...server,
        search_polygon: searchPoly ? searchPoly.geometry.coordinates : null,
      });
      return;
    }
    const payload = {
      study_area: 'Gujarat',
      profile: id,
      exported_at: new Date().toISOString(),
      crs: 'EPSG:4326',
      sites: compare.map((s) => ({
        label: s.label,
        coords: [s.coords.lng, s.coords.lat],
        score: s.data.score,
        eligibility: s.data.eligibility,
        config_version: s.data.score_config_version,
        factors: s.data.factors,
        search_polygon: searchPoly ? searchPoly.geometry.coordinates : null,
        isochrones_m: ISO_MIN.filter((m) => iso[m]).map((m) => ({ minutes: m, radius_m: ISO_CFG[m].radius })),
      })),
      note: 'DEMO — synthetic layers + geodesic demo catchments; replace with validated layers before planning use.',
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `geoready-compare-${id}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  function exportCsv() {
    const sites = (compare.length ? compare : scoreData && coords ? [{ key: 'single', label: `Site — ${scoreData.score.toFixed(1)}`, coords: coords!, data: scoreData }] : []) as Array<{ label: string; coords: Coords; data: ScoreResponse }>;
    if (sites.length === 0) return;
    const csvSites = sites.map((s) => ({
      label: s.label,
      coords: s.coords,
      score: s.data.score,
      eligibility: s.data.eligibility,
      version: s.data.score_config_version,
      weight_source: s.data.weight_source,
      factors: s.data.factors,
      constraints: s.data.constraints,
      generated_at: s.data.generated_at,
    }));
    const csv = toCsv(csvSites);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `geoready-${compare.length ? 'compare' : 'site'}-${id}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  function printReport() {
    const sites = (compare.length
      ? compare
      : scoreData && coords
        ? [{ key: 'single', label: `Site — ${scoreData.score.toFixed(1)} · ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`, coords: coords!, data: scoreData }]
        : []) as Array<{ label: string; coords: Coords; data: ScoreResponse }>;
    if (sites.length === 0) return;
    const html = buildReportHtml({
      profile: id,
      profileLabel: profile?.label ?? id,
      sites: sites.map((s) => ({
        label: s.label,
        coords: s.coords,
        score: s.data.score,
        eligibility: s.data.eligibility,
        version: s.data.score_config_version,
        weight_source: s.data.weight_source,
        factors: s.data.factors,
        constraints: s.data.constraints,
        generated_at: s.data.generated_at,
      })),
      searchPoly,
      iso,
      catchment: serverIso ? { routed: serverIso.routed, provider: serverIso.provider } : null,
      generatedAt: new Date().toUTCString(),
    });
    openReport(html);
  }

  const orbScore = scoreData?.score ?? null;
  const orbElig = scoreData?.eligibility ?? '';
  const eligInfo = scoreData ? eligibilityLabel(orbElig) : { text: coords ? (scoring ? 'SCORING…' : 'NO SCORE YET') : 'DEMO · AWAITING SCORE', cls: coords ? 'warn' : 'demo' };
  const canPin = !!coords && !!scoreData && compare.length < 3 && !compare.some((c) => Math.abs(c.coords.lat - (coords?.lat ?? 0)) < 1e-6 && Math.abs(c.coords.lng - (coords?.lng ?? 0)) < 1e-6);

  return (
    <div className="atlas" data-theme={theme}>
      <header className="commandbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">◈</span>
          <span>
            <small>GUJARAT · SITE INTELLIGENCE</small>
            <strong>GeoReady</strong>
          </span>
        </div>
        <span className="scope-badge">{theme === 'light' ? 'PAPER ATLAS · DEMO' : 'OBSIDIAN ATLAS · DEMO'}</span>
        <button type="button" className="rail-toggle" onClick={() => setLeftCollapsed((v) => !v)} aria-label={leftCollapsed ? 'Show left panel' : 'Hide left panel'} aria-pressed={leftCollapsed} title={leftCollapsed ? 'Show sidebar' : 'Hide sidebar'}>
          {leftCollapsed ? '→' : '←'}
        </button>
        {profile && <span className="scope-badge" style={{ background: 'var(--panel-2)', color: 'var(--ink)', borderColor: 'var(--line)' }}>{profile.label}</span>}
        <div className="spacer" />
        <div className="segmented" role="group" aria-label="Basemap style">
          <button type="button" aria-pressed={basemap === 'dark'} onClick={() => setBasemap('dark')}>
            {theme === 'light' ? 'Paper' : 'Obsidian'}
          </button>
          <button type="button" aria-pressed={basemap === 'osm'} onClick={() => setBasemap('osm')}>
            OSM
          </button>
        </div>
        <button type="button" className="theme-toggle" onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))} aria-label="Toggle theme">
          {theme === 'dark' ? '☀ Light' : '◐ Obsidian'}
        </button>
        <span className={`status-pill ${status === 'ready' ? 'ready' : status === 'error' ? 'error' : ''}`}>
          {status === 'loading' ? '● CONNECTING' : status === 'ready' ? '● LIVE' : '● OFFLINE'}
        </span>
        <button type="button" className="rail-toggle" onClick={() => setRightCollapsed((v) => !v)} aria-label={rightCollapsed ? 'Show score panel' : 'Hide score panel'} aria-pressed={rightCollapsed} title={rightCollapsed ? 'Show score' : 'Hide score'}>
          {rightCollapsed ? '←' : '→'}
        </button>
      </header>

      <div className="atlas-main">
        <aside className={`rail ${leftCollapsed ? 'collapsed' : ''}`} aria-label="Mission rail" aria-hidden={leftCollapsed}>
          <span className="eyebrow">MISSION</span>
          <h1>Pick a play.</h1>
          <p className="lede">{profile?.summary ?? 'Eleven Gujarat plays share one score engine and one map. Pick one to arm its factors.'}</p>

          {status === 'loading' && (
            <div>
              <div className="skeleton" style={{ height: 44 }} />
              <div className="skeleton" style={{ height: 44, marginTop: 8 }} />
              <div className="skeleton" style={{ height: 44, marginTop: 8 }} />
            </div>
          )}

          <div className="profile-list" role="group" aria-label="Site type profiles">
            {profiles.map((p) => (
              <button key={p.id} type="button" className="profile-card" aria-pressed={p.id === id} onClick={() => pick(p.id)}>
                <strong>{p.label}</strong>
                <span>{p.summary}</span>
              </button>
            ))}
          </div>

          <h2>Seeded Gujarat sites</h2>
          <div className="seeded">
            {SEEDED.map((s) => (
              <button key={s.id} type="button" onClick={() => handlePick(s.coords[1], s.coords[0], false)}>
                <span>
                  <strong style={{ fontSize: 12 }}>{s.label}</strong>
                  <br />
                  <small>{s.note}</small>
                </span>
                <small>↗</small>
              </button>
            ))}
          </div>

          <h2>Search area · draw polygon</h2>
          <div className="draw-bar">
            {!drawActive && !searchPoly && (
              <button type="button" className="btn primary" onClick={startDraw}>
                Draw polygon
              </button>
            )}
            {drawActive && (
              <>
                <button type="button" className="btn primary" disabled={drawVerts.length < 3} onClick={finishDraw}>
                  Finish ({drawVerts.length} pts)
                </button>
                <button type="button" className="btn ghost" onClick={cancelDraw}>
                  Cancel
                </button>
              </>
            )}
            {searchPoly && !drawActive && (
              <>
                <span className="badge" style={{ background: 'rgba(245,185,66,0.14)', border: '1px solid rgba(245,185,66,0.35)', padding: '6px 10px', borderRadius: 999, font: '600 11px var(--font-mono)' }}>
                  ✦ Polygon set — {searchPoly.geometry.coordinates[0].length - 1} vertices
                </span>
                <button type="button" className="btn ghost" onClick={clearPoly}>
                  Clear
                </button>
              </>
            )}
          </div>
          <p className="draw-status">
            {drawActive ? (
              <>
                <b>Drawing…</b> click to add vertices · double-click or Finish to close · Esc to cancel
              </>
            ) : searchPoly ? (
              <>Polygon scopes server H3 suitability to its bbox; pin scoring still runs state-wide.</>
            ) : (
              <>Click Draw, then click the map to outline a custom area. Works at any zoom.</>
            )}
          </p>

          <h2>Catchments · 10 / 20 / 30 min · {serverIso ? (serverIso.routed ? 'ROUTED OSRM' : 'DEMO') : isoRouting ? 'ROUTING…' : 'DEMO'}</h2>
          <p className="lede">
            {serverIso?.routed
              ? 'Routed drive-time polygons via OSRM (driving) with reachable population from demographics.'
              : 'Geodesic circles (metres internally) at ~40 km/h drive proxy. Not a routed isochrone — labeled DEMO.'}
          </p>
          <div className="catchments">
            {ISO_MIN.map((m) => {
              const pop = popFor(m);
              return (
                <label key={m} className="catch-row">
                  <input type="checkbox" checked={!!iso[m]} onChange={(e) => setIso((p) => ({ ...p, [m]: e.target.checked }))} aria-label={`${m} min catchment`} />
                  <span className="swatch" style={{ background: ISO_CFG[m].color }} />
                  <span>
                    {m} min
                  </span>
                  <span>{pop !== null ? `~${pop.toLocaleString()} people` : ISO_CFG[m].label}</span>
                </label>
              );
            })}
          </div>
          <p className="detail-meta">
            {isoRouting
              ? 'Routing via OSRM… rings upgrade when the drive times arrive.'
              : serverIso?.routed
                ? 'Routed rings with population reachable — part of the score evidence and exports.'
                : 'Drop a pin, then toggle rings. Rings redraw every move. Clearly badged DEMO CATCHMENT in the map and in exports.'}
          </p>

          <h2>Map layers · {liveOk ? 'live PostGIS' : 'synthetic demo'}</h2>
          <div className="layers">
            <div className="layer-row">
              <div className="layer-head">
                <button type="button" className={`eye ${showH3 ? 'on' : ''}`} aria-pressed={showH3} onClick={() => setShowH3((v) => !v)} aria-label="Toggle H3 suitability">
                  {showH3 ? '⬢' : '○'}
                </button>
                <span className="kind">H3 suitability · hex aggregation</span>
                <span className="badge">{liveH3 ? 'LIVE' : 'DEMO'}</span>
              </div>
            </div>
            <div className="layer-row">
              <div className="layer-head">
                <button type="button" className={`eye ${showHotspots ? 'on' : ''}`} aria-pressed={showHotspots} onClick={() => setShowHotspots((v) => !v)} aria-label="Toggle DBSCAN hotspots">
                  {showHotspots ? '◉' : '○'}
                </button>
                <span className="kind">DBSCAN hotspots · dense clusters</span>
                <span className="badge">{liveHot ? 'LIVE' : 'DEMO'}</span>
              </div>
            </div>
            <div className="layer-row">
              <div className="layer-head">
                <button type="button" className={`eye ${showUnderserved ? 'on' : ''}`} aria-pressed={showUnderserved} onClick={() => setShowUnderserved((v) => !v)} aria-label="Toggle underserved gaps">
                  {showUnderserved ? '◇' : '○'}
                </button>
                <span className="kind">Underserved gaps · high potential, low coverage</span>
                <span className="badge">DEMO</span>
              </div>
            </div>
            {RAW_KINDS.map((k) => (
              <div className="layer-row" key={k}>
                <div className="layer-head">
                  <button
                    type="button"
                    className={`eye ${rawVis[k] ? 'on' : ''}`}
                    aria-pressed={!!rawVis[k]}
                    onClick={() => setRawVis((p) => ({ ...p, [k]: !p[k] }))}
                    aria-label={`Toggle ${k}`}
                  >
                    {rawVis[k] ? '👁' : '—'}
                  </button>
                  <span className="kind">{k.replace('_', ' ')}</span>
                  <span className="badge">{liveRaw[k] ? 'LIVE' : 'SYNTH'}</span>
                </div>
                <input type="range" min={0} max={1} step={0.05} value={rawOp[k]} onChange={(e) => setRawOp((p) => ({ ...p, [k]: Number(e.target.value) }))} aria-label={`${k} opacity`} />
              </div>
            ))}
          </div>

          <details className="layers" style={{ marginTop: 8 }}>
            <summary className="lede" style={{ cursor: 'pointer' }}>Upload a layer · GeoJSON / WKT / .zip Shapefile / GeoTIFF</summary>
            <form className="layer-row" onSubmit={submitUpload}>
              <div className="layer-head">
                <select value={upKind} onChange={(e) => setUpKind(e.target.value)} aria-label="Layer kind" style={{ background: 'var(--panel-2)', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: 8, padding: '6px 8px', fontSize: 12 }}>
                  {['demographics', 'transport', 'poi', 'land_use', 'environmental_risk', 'utilities'].map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
                <input value={upName} onChange={(e) => setUpName(e.target.value)} placeholder="Layer name" aria-label="Layer name" style={{ flex: 1, background: 'var(--panel-2)', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: 8, padding: '6px 8px', fontSize: 12 }} />
              </div>
              <div className="segmented" role="group" aria-label="Upload mode" style={{ alignSelf: 'flex-start' }}>
                {(['file', 'geojson', 'wkt'] as const).map((m) => (
                  <button key={m} type="button" aria-pressed={upMode === m} onClick={() => setUpMode(m)}>{m === 'file' ? 'File' : m.toUpperCase()}</button>
                ))}
              </div>
              {upMode === 'file' ? (
                <input id="up-file" type="file" accept=".geojson,.json,.zip,.tif,.tiff,.geotiff" aria-label="Layer file" style={{ fontSize: 12, color: 'var(--muted)' }} />
              ) : (
                <textarea value={upText} onChange={(e) => setUpText(e.target.value)} placeholder={upMode === 'geojson' ? '{"type":"FeatureCollection","features":[]}' : 'POINT(72.58 23.02)'} rows={3} aria-label="Layer text" style={{ background: 'var(--panel-2)', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: 8, padding: 8, fontSize: 11, fontFamily: 'var(--font-mono)' }} />
              )}
              <button type="submit" className="btn primary" disabled={upBusy}>{upBusy ? 'Uploading…' : 'Ingest → PostGIS'}</button>
              {upMsg && <p className="lede" style={{ fontSize: 11 }}>{upMsg}</p>}
            </form>
          </details>

          <button type="button" className="studio-toggle" onClick={() => setWeightsOpen((v) => !v)} aria-expanded={weightsOpen} aria-controls="studio-panel">
            <span>Weight studio · Σ {sum.toFixed(3)} {sumOk ? '✓' : '— must be 1.000'}</span>
            <span className="chev">⌃</span>
          </button>
          <div id="studio-panel" className={`studio-wrap ${weightsOpen ? '' : 'collapsed'}`}>
            {profile && (
              <div className="studio">
                <div className="studio-head">
                  <strong>FACTOR</strong>
                  <span className={sumOk ? 'ok' : 'bad'}>{sumOk ? '✓ Balanced' : '— must be 1.000'}</span>
                </div>
                {profile.factors.map((f) => (
                  <div className="weight-row" key={f.id}>
                    <div className="row-top">
                      <span>{f.label}</span>
                      <span>{((weights[f.id] ?? 0) * 100).toFixed(0)}%</span>
                    </div>
                    <input type="range" min={0} max={1} step={0.01} value={weights[f.id] ?? 0} onChange={(e) => updateWeight(f.id, Number(e.target.value))} aria-label={`${f.label} weight`} />
                  </div>
                ))}
                <div className="studio-actions">
                  <button type="button" className="btn ghost" onClick={normalize} disabled={sumOk}>
                    Normalize → 1.0
                  </button>
                  <button type="button" className="btn ghost" onClick={reset}>
                    Reset
                  </button>
                  <button type="button" className="btn primary" disabled={!coords || !sumOk || scoring} onClick={() => coords && doScore(coords.lat, coords.lng, weights, id, dirty && sumOk)}>
                    {scoring ? 'Scoring…' : dirty ? 'Rescore →' : coords ? 'Score again' : 'Drop a pin first'}
                  </button>
                </div>
                {!sumOk && <p className="lede" style={{ color: 'var(--ember)', fontSize: 11 }}>Weights must sum to 1.000 — normalize or adjust.</p>}
                {dirty && sumOk && <p className="lede" style={{ fontSize: 11 }}>Custom weights will set score_config v2 for this run.</p>}
              </div>
            )}
          </div>

          {err && <p className="note" style={{ borderColor: 'rgba(255,93,58,0.5)', background: 'rgba(255,93,58,0.08)' }}>{err}</p>}
          {coords && (
            <p className="note coords">
              Candidate: {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)} · CRS EPSG:4326 [lon,lat]
              <br />
              Click the map or a seeded site to move it. {searchPoly ? '· Polygon set' : ''}
            </p>
          )}
        </aside>

        <section className={`map-wrap ${drawActive ? 'drawing' : ''}`} aria-label="Gujarat readiness map">
          <div id="map" ref={mapEl} />
          <div className="map-hint">
            {drawActive ? (
              <>
                <b>Drawing</b> — click to add · double-click / Finish to close · <b>Esc</b> to cancel
              </>
            ) : (
              <>
                <b>Click to score</b> · <b>Draw polygon</b> left · toggle <b>honeycomb/rings</b> · <b>Obsidian / OSM</b> up top
              </>
            )}
          </div>
          <div className="legend" aria-label="Map legend">
            <strong>LEGEND · {liveOk ? 'LIVE POSTGIS' : 'SYNTH DEMO'}</strong>
            <button type="button" className={showH3 ? 'active' : ''} onClick={() => setShowH3((v) => !v)}>
              <i style={{ background: '#f5b942' }} />
              H3 high-potential
              <span className="pct">{showH3 ? 'ON' : 'OFF'}</span>
            </button>
            <button type="button" className={showH3 ? 'active' : ''} onClick={() => setShowH3((v) => !v)}>
              <i style={{ background: '#2c3a6e' }} />
              H3 cold spot
              <span className="pct">{showH3 ? 'ON' : 'OFF'}</span>
            </button>
            <button type="button" className={showUnderserved ? 'active' : ''} onClick={() => setShowUnderserved((v) => !v)}>
              <i style={{ background: 'transparent', border: '2px dashed #2dd4a7' }} />
              Underserved gap
              <span className="pct">{showUnderserved ? 'ON' : 'OFF'}</span>
            </button>
            <button type="button" className={showHotspots ? 'active' : ''} onClick={() => setShowHotspots((v) => !v)}>
              <i style={{ background: '#ff5d3a' }} />
              Hotspots · {lensInfo.clusters} clusters
              <span className="pct">{showHotspots ? 'ON' : 'OFF'}</span>
            </button>
            <button type="button" onClick={() => handlePick(23.02, 72.58, false)}>
              <i style={{ background: '#2dd4a7' }} />
              Candidate pin
            </button>
            <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-mono)', lineHeight: 1.5 }}>
              {lensInfo.rel} of {lensInfo.total} POIs matter for {profile?.label ?? id} — {lensInfo.blurb}
            </span>
            {searchPoly && (
              <button type="button" onClick={clearPoly}>
                <i style={{ background: '#f5b942', border: '2px dashed #f5b942' }} />
                Search polygon
                <span className="pct">CLEAR</span>
              </button>
            )}
            {(iso[10] || iso[20] || iso[30]) && (
              <span style={{ fontSize: 10, color: 'var(--gold)', fontFamily: 'var(--font-mono)' }}>
                {serverIso?.routed ? `ROUTED OSRM · pop ${[10, 20, 30].filter((m) => iso[m]).map((m) => `${m}m:${((popFor(m) ?? 0) / 1000).toFixed(0)}k`).join(' ')}` : 'DEMO CATCHMENTS — geodesic, not routed'}
              </span>
            )}
          </div>
        </section>

        <aside className={`rail right ${rightCollapsed ? 'collapsed' : ''}`} aria-label="Score observatory" aria-hidden={rightCollapsed}>
          <span className="eyebrow">SCORE OBSERVATORY</span>
          <h1>Evidence first.</h1>
          <p className="lede">No black-box AI score. Every point traces to a versioned factor, layer, and rule. H3 cells are aggregation, not precise sites.</p>

          <div className="orb-stage">
            <div className={orbClass(orbScore, orbElig, scoring)} role="status" aria-label={orbScore !== null ? `Score ${orbScore} out of 100` : 'Score placeholder'}>
              <div>
                <strong>{scoring ? '…' : scoreData ? animatedScore.toFixed(1) : coords ? '—' : '···'}</strong>
                <br />
                <span>/ 100</span>
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'center' }}>
            <span className={`eligibility ${eligInfo.cls}`}>{eligInfo.text}</span>
            {scoreData && coords && (
              <>
                <button type="button" className="btn primary" disabled={!canPin} onClick={pinCurrent} style={{ display: 'block', width: '100%', marginTop: 10 }}>
                  {canPin ? 'Pin to compare' : compare.length >= 3 ? 'Compare full (3)' : 'Already pinned'}
                </button>
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <button type="button" className="btn ghost" onClick={printReport} style={{ flex: 1 }}>
                    Report
                  </button>
                  <button type="button" className="btn ghost" onClick={exportCsv} style={{ flex: 1 }}>
                    CSV
                  </button>
                </div>
              </>
            )}
          </div>

          {scoreData ? (
            <>
              <div className="waterfall">
                {scoreData.factors.map((f, i) => (
                  <div className="waterfall-row" key={f.factor_id} style={{ transitionDelay: `${i * 70}ms` }}>
                    <div className="wf-top">
                      <span>{f.label}</span>
                      <b>+{f.contribution.toFixed(1)}</b>
                    </div>
                    <div className="wf-bar" aria-hidden="true">
                      <i style={{ width: `${f.normalized_value * 100}%` }} />
                    </div>
                    <div className="wf-meta">
                      <span>wt {(f.weight * 100).toFixed(0)}%</span>
                      <span>val {f.normalized_value.toFixed(2)}</span>
                      <span>{f.quality}</span>
                      <span>{f.unit}</span>
                    </div>
                    {(f.method || f.layer_version_id) && (
                      <div className="wf-meta" title={f.layer_version_id ?? undefined}>
                        {f.method ? <span>{f.method.length > 60 ? f.method.slice(0, 60) + '…' : f.method}</span> : null}
                        {f.layer_version_id ? <span>lyr {f.layer_version_id.slice(0, 8)}</span> : null}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {scoreData.constraints.length > 0 && (
                <>
                  <h2>Constraints</h2>
                  {scoreData.constraints.map((c) => (
                    <p key={c.id} className="note" style={{ marginTop: 6, fontSize: 12 }}>
                      <b>{c.effect.toUpperCase()}</b> · {c.message}
                    </p>
                  ))}
                </>
              )}
              <p className="detail-meta">
                config v{scoreData.score_config_version} · {scoreData.weight_source} weights · run {scoreData.analysis_run_id.slice(0, 8)}… · {new Date(scoreData.generated_at).toUTCString()}
                <br />
                {scoreData.input_manifest.notice}
              </p>
            </>
          ) : (
            <>
              <ol className="steps">
                <li>
                  <b>01</b> Drop a pin or pick a seeded Gujarat site.
                </li>
                <li>
                  <b>02</b> The orb lights 0–100 with a full factor waterfall.
                </li>
                <li>
                  <b>03</b> Pin A/B/C to compare — delta appears below the map.
                </li>
                <li>
                  <b>04</b> Draw a polygon or toggle 10/20/30 min catchments (DEMO).
                </li>
              </ol>
              <h2>Provenance</h2>
              <p className="lede">All 11 profiles now score. H3 aggregation + geodesic DEMO rings.</p>
            </>
          )}
        </aside>
      </div>

      {compare.length > 0 && (
        <div className="compare-tray" aria-label="Compare candidates">
          <div className="compare-head">
            <strong>COMPARE — {compare.length}/3</strong>
            <span>tap a card to fly · pin from the observatory · rings & polygon travel with export</span>
            <div className="spacer" />
            <button type="button" className="btn ghost" onClick={printReport}>
              Report
            </button>
            <button type="button" className="btn ghost" onClick={exportCompare}>
              JSON
            </button>
            <button type="button" className="btn ghost" onClick={exportCsv}>
              CSV
            </button>
            <button type="button" className="btn ghost" onClick={() => setCompare([])}>
              Clear
            </button>
          </div>
          <div className="compare-cards">
            {compare.map((c, i) => {
              const lbl = String.fromCharCode(65 + i);
              const best = Math.max(...compare.map((x) => x.data.score));
              const delta = c.data.score - best;
              const isBest = Math.abs(c.data.score - best) < 0.001;
              const cls = c.data.eligibility === 'ineligible' ? 'bad' : c.data.score < 55 ? 'warn' : '';
              return (
                <div key={c.key} className={`compare-card ${isBest ? 'pinned' : ''}`}>
                  <div className="cc-top">
                    <span className={`mini-orb ${cls}`}>{c.data.score.toFixed(0)}</span>
                    <div>
                      <strong style={{ fontSize: 12 }}>{lbl} — {c.data.score.toFixed(1)} / 100</strong>
                      <br />
                      <small style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted)', fontSize: 10 }}>{c.coords.lat.toFixed(4)}, {c.coords.lng.toFixed(4)}</small>
                    </div>
                  </div>
                  <div className="cc-meta">
                    {c.label} · {c.data.eligibility} · v{c.data.score_config_version}
                    <br />
                    {c.data.factors
                      .slice(0, 3)
                      .map((f) => `${f.label.slice(0, 12)} +${f.contribution.toFixed(0)}`)
                      .join(' · ')}
                  </div>
                  {!isBest && <div className="delta">Δ vs best: <b className={delta < -10 ? 'bad' : ''}>{delta.toFixed(1)}</b></div>}
                  {isBest && <div className="delta">★ <b>Current leader</b> — high demand + access, gap held</div>}
                  <div className="cc-actions">
                    <button type="button" className="btn ghost" onClick={() => flyToPin(c.coords)}>
                      Fly to
                    </button>
                    <button type="button" className="btn ghost" onClick={() => removePin(c.key)}>
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {compare.length >= 2 && (
            <p className="lede" style={{ fontSize: 11, marginTop: 4 }}>
              Export includes CRS EPSG:4326, config version, factor breakdowns, and — when set — search polygon + DEMO catchment radii (metres internally, shown as 10/20/30 min at ~40 km/h). Clearly labeled synthetic/demo.
            </p>
          )}
        </div>
      )}

      <footer className="provenance" aria-label="Data provenance">
        <span>
          <b>study_area</b> Gujarat {searchPoly ? '· polygon set' : ''}
        </span>
        <span className="dot">·</span>
        <span>
          <b>CRS</b> EPSG:4326 [lon,lat]
        </span>
        <span className="dot">·</span>
        <span>
          <b>profile</b> {id}
        </span>
        <span className="dot">·</span>
        <span>
          <b>score</b> {scoreData ? `${scoreData.score.toFixed(1)} · v${scoreData.score_config_version} · ${scoreData.weight_source}` : '—'}
        </span>
        <span className="dot">·</span>
        <span>
          <b>tiles</b> © OpenStreetMap contributors © CARTO
        </span>
        <span className="dot">·</span>
        <span>
          <b>H3/DBSCAN/rings</b> synthetic demo
        </span>
      </footer>

      {!entered && (
        <div className="ignition" role="dialog" aria-label="Welcome to GeoReady Atlas">
          <div className="ignition-card">
            <span className="eyebrow">GUJARAT · 11 PLAYS · H3 LIVE · DRAW + RINGS</span>
            <h1>
              Which site wins — <em>and why, with evidence?</em>
            </h1>
            <p>Draw a search polygon, drop three candidates, compare the waterfall — toggle 10/20/30 min geodesic catchments (DEMO) on any pin.</p>
            <button type="button" onClick={enter}>
              Enter Atlas →
            </button>
            <span className="ignition-meta">OBSIDIAN ATLAS · PHASE 4 · DRAW + CATCHMENTS + COMPARE · OSM ATTRIBUTED · DEMO DATA LABELED</span>
          </div>
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
