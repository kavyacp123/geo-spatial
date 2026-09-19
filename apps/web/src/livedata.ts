// Live PostGIS data with demo.ts fallback. Every helper returns null on any
// failure so the map always renders (LIVE POSTGIS when up, SYNTH DEMO when not).
import { poiRelevance } from './demo';

export type FC = GeoJSON.FeatureCollection<GeoJSON.Geometry>;
export type RawKind = 'demographics' | 'transport' | 'poi' | 'land_use' | 'environmental_risk';
export type IsoRing = { minutes: number; polygon: number[][]; routed: boolean; radius_m?: number; population?: number | null };
export type IsoResult = { rings: IsoRing[]; routed: boolean; provider: string; notice: string };

type JsonObj = Record<string, unknown>;

async function getJSON(api: string, path: string, init?: RequestInit, timeoutMs = 20000): Promise<JsonObj | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(`${api}${path}`, { ...init, signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const data: unknown = await res.json().catch(() => null);
    if (typeof data !== 'object' || data === null) return null;
    return data as JsonObj;
  } catch {
    return null;
  }
}

export type LayerMeta = { id: string; kind: string; name: string; feature_count?: number };

export async function fetchCatalog(api: string): Promise<LayerMeta[] | null> {
  const d = await getJSON(api, '/api/v1/layers');
  if (!d || !Array.isArray(d.data)) return null;
  return d.data as LayerMeta[];
}

type RawFeature = { geometry?: unknown; properties?: Record<string, unknown> | null };

export async function fetchFeatures(api: string, layerId: string, profileId?: string): Promise<FC | null> {
  const d = await getJSON(api, `/api/v1/layers/${layerId}/features?limit=500`);
  if (!d || !Array.isArray(d.features)) return null;
  const features = (d.features as RawFeature[]).map((f) => {
    const props: Record<string, unknown> = { ...(f.properties || {}) };
    delete props._layer_version_id;
    if (profileId && (f.geometry as { type?: string } | undefined)?.type === 'Point') {
      props.relevance = poiRelevance(profileId, String(props.category ?? props.kind ?? ''), String(props.sub ?? ''));
    }
    return { type: 'Feature', geometry: f.geometry, properties: props };
  });
  return { type: 'FeatureCollection', features } as unknown as FC;
}

export async function fetchHotspots(api: string, profileId: string): Promise<FC | null> {
  const d = await getJSON(
    api,
    '/api/v1/hotspots',
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ profile_id: profileId }) },
  );
  if (!d || !Array.isArray(d.clusters)) return null;
  return {
    type: 'FeatureCollection',
    features: (d.clusters as Array<{ lng: number; lat: number; weight: number }>).map((c, i) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [c.lng, c.lat] },
      properties: { cluster: i, weight: c.weight, kind: 'dbscan_hotspot', profile: profileId, license: 'synthetic-demo' },
    })),
  } as unknown as FC;
}

export async function fetchH3(api: string, profileId: string): Promise<FC | null> {
  const d = await getJSON(
    api,
    '/api/v1/h3',
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ profile_id: profileId, resolution: 5 }) },
    60000,
  );
  if (!d || d.type !== 'FeatureCollection' || !Array.isArray(d.features)) return null;
  return d as unknown as FC;
}

export async function fetchIsochrone(api: string, lng: number, lat: number, minutes = [10, 20, 30]): Promise<IsoResult | null> {
  const d = await getJSON(
    api,
    '/api/v1/isochrone',
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ longitude: lng, latitude: lat, minutes }) },
    45000,
  );
  if (!d || !Array.isArray(d.rings)) return null;
  return d as IsoResult;
}

export async function postServerReport(api: string, items: Array<{ analysis_run_id: string; candidate_site_id: string }>): Promise<JsonObj | null> {
  return getJSON(
    api,
    '/api/v1/reports',
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items }) },
    20000,
  );
}

export function downloadJSON(filename: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function uploadLayer(
  api: string,
  opts: { kind: string; name: string; sourceName: string; file?: File | null; geojsonText?: string; wktText?: string },
): Promise<{ ok: boolean; message: string }> {
  try {
    if (opts.file) {
      const fd = new FormData();
      fd.append('kind', opts.kind);
      fd.append('name', opts.name);
      fd.append('source_name', opts.sourceName || 'user upload');
      fd.append('file', opts.file);
      const res = await fetch(`${api}/api/v1/layers/upload`, { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, message: data?.error ?? `HTTP ${res.status}` };
      return { ok: true, message: `Ingested ${data.feature_count ?? '?'} features → ${opts.kind} (v${data.version ?? 1})` };
    }
    const body: Record<string, unknown> = { kind: opts.kind, name: opts.name, source_name: opts.sourceName || 'user upload' };
    if (opts.geojsonText?.trim()) {
      try {
        body.geojson = JSON.parse(opts.geojsonText);
      } catch {
        return { ok: false, message: 'GeoJSON text is not valid JSON' };
      }
    } else if (opts.wktText?.trim()) {
      body.wkt = opts.wktText.trim();
    } else {
      return { ok: false, message: 'Attach a file or paste GeoJSON/WKT' };
    }
    const res = await fetch(`${api}/api/v1/layers`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, message: data?.error ?? `HTTP ${res.status}` };
    return { ok: true, message: `Ingested ${data.feature_count ?? '?'} features → ${opts.kind} (v${data.version ?? 1})` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: msg.includes('failed to fetch') ? 'API offline — start the stack.' : msg };
  }
}
