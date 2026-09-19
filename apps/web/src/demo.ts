// ponytail: synthetic H3/hotspot/demo layers are deterministic but naive (degree-grid hexes, haversine proxy); replace with real H3 + PostGIS when validated layers exist.
type FC = GeoJSON.FeatureCollection<GeoJSON.Geometry>;

// haversine metres — no turf, tiny + geodesic per GEOSPATIAL_STANDARDS
function distKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const la1 = (a[1] * Math.PI) / 180;
  const la2 = (b[1] * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function hexRing(cx: number, cy: number, r: number): number[][] {
  const pts: number[][] = [];
  for (let i = 0; i < 6; i++) {
    const ang = (Math.PI / 3) * i - Math.PI / 6; // pointy-top
    pts.push([cx + r * Math.cos(ang), cy + r * Math.sin(ang)]);
  }
  pts.push(pts[0].slice());
  return pts;
}

// geodesic destination — metres internally, correct per GEOSPATIAL_STANDARDS
export function circlePolygon(center: [number, number], radiusM: number, steps = 64): GeoJSON.Feature<GeoJSON.Polygon> {
  const R = 6371000;
  const lat1 = (center[1] * Math.PI) / 180;
  const lng1 = (center[0] * Math.PI) / 180;
  const d = radiusM / R;
  const ring: number[][] = [];
  for (let i = 0; i <= steps; i++) {
    const brng = (2 * Math.PI * i) / steps;
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng));
    const lng2 = lng1 + Math.atan2(Math.sin(brng) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
    ring.push([(lng2 * 180) / Math.PI, (lat2 * 180) / Math.PI]);
  }
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: { radius_m: radiusM, license: 'synthetic-demo' } };
}

const CITIES: [number, number][] = [
  [72.58, 23.02],
  [72.83, 21.17],
  [73.18, 22.31],
  [70.8, 22.3],
];
const GUJ_BBOX: [number, number, number, number] = [68.2, 19.6, 74.7, 24.9];

function buildH3(): FC {
  const r = 0.18; // ~20km in degrees (demo proxy)
  const stepX = 1.5 * r;
  const stepY = Math.sqrt(3) * r;
  const feats: GeoJSON.Feature[] = [];
  let row = 0;
  for (let cy = GUJ_BBOX[1]; cy <= GUJ_BBOX[3]; cy += stepY) {
    const offset = (row % 2) * (stepX / 2);
    for (let cx = GUJ_BBOX[0] + offset; cx <= GUJ_BBOX[2]; cx += stepX) {
      // crude Gujarat mask: skip far oceanic cells south-west
      if (cx < 69.5 && cy < 20.8) continue;
      if (cx > 74.2 && cy < 20.2) continue;
      const ring = hexRing(cx, cy, r * 0.98);
      // geodesic score: high near cities, decay with metres
      const dMin = Math.min(...CITIES.map((c) => distKm([cx, cy], c)));
      const hash = Math.abs(Math.sin(cx * 12.9898 + cy * 78.233) * 43758.5453) % 1;
      const base = 28 + 46 * Math.exp(-dMin / 85) + 12 * hash + (dMin > 35 && dMin < 70 ? 6 : 0);
      const score = Math.max(12, Math.min(92, Math.round(base)));
      const kind = score >= 68 ? 'high' : score <= 34 ? 'low' : 'mid';
      const idx = `demo-h3-${row}-${Math.round(cx * 10)}`;
      feats.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ring] },
        properties: { h3_index: idx, score, cluster_type: kind, license: 'synthetic-demo' },
      });
    }
    row++;
  }
  return { type: 'FeatureCollection', features: feats };
}

export const H3_DEMO: FC = buildH3();

// underserved = high-potential ring cells (gap definition per system-design: high demand + adequate access + low competition proxy)
export const UNDERSERVED_DEMO: FC = (() => {
  const src = H3_DEMO as unknown as { features: { properties: Record<string, unknown>; geometry: GeoJSON.Geometry }[] };
  const picked = src.features.filter((f) => (f.properties['score'] as number) >= 62);
  const gaps = picked.filter((_, i) => i % 7 === 2).slice(0, 14);
  return { type: 'FeatureCollection', features: gaps as unknown as GeoJSON.Feature[] };
})();

export const HOTSPOTS_DEMO: FC = (() => {
  const pts: GeoJSON.Feature[] = [];
  const centres: [number, number][] = [
    [72.51, 23.04],
    [72.61, 22.99],
    [72.78, 21.17],
    [73.17, 22.32],
  ];
  centres.forEach((c, ci) => {
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * Math.PI * 2 + ci * 0.8;
      const rr = 0.04 + (i % 3) * 0.025;
      pts.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [c[0] + Math.cos(ang) * rr, c[1] + Math.sin(ang) * rr * 0.7] },
        properties: { cluster: ci, kind: 'dbscan_hotspot', license: 'synthetic-demo' },
      });
    }
  });
  return { type: 'FeatureCollection', features: pts };
})();

// raw layer stubs — synthetic, clearly labeled; each small enough for demo
export const RAW_DEMO: Record<string, FC> = {
  demographics: {
    type: 'FeatureCollection',
    features: CITIES.map(([lng, lat], i) => ({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [hexRing(lng, lat, 0.35)] as unknown as GeoJSON.Polygon['coordinates'] },
      properties: { kind: 'demographics', density: 800 + i * 420, license: 'synthetic-demo' },
    })),
  },
  transport: {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: { type: 'LineString', coordinates: [[72.58, 23.02], [72.83, 21.17]] }, properties: { kind: 'transport', name: 'NH-48 demo' } },
      { type: 'Feature', geometry: { type: 'LineString', coordinates: [[72.58, 23.02], [73.18, 22.31]] }, properties: { kind: 'transport', name: 'Ahmedabad–Vadodara demo' } },
      { type: 'Feature', geometry: { type: 'LineString', coordinates: [[70.8, 22.3], [72.58, 23.02]] }, properties: { kind: 'transport', name: 'Rajkot–Ahmedabad demo' } },
    ],
  },
  poi: {
    type: 'FeatureCollection',
    features: Array.from({ length: 18 }, (_, i) => {
      const c = CITIES[i % 4];
      const ang = (i * 1.9) % (Math.PI * 2);
      const d = 0.08 + (i % 4) * 0.05;
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [c[0] + Math.cos(ang) * d, c[1] + Math.sin(ang) * d] },
        properties: { kind: i % 3 === 0 ? 'competitor' : 'complementary', license: 'synthetic-demo' },
      };
    }),
  },
  land_use: {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: { type: 'Polygon', coordinates: [hexRing(72.55, 23.05, 0.28)] as unknown as GeoJSON.Polygon['coordinates'] }, properties: { zoning: 'commercial', license: 'synthetic-demo' } },
      { type: 'Feature', geometry: { type: 'Polygon', coordinates: [hexRing(72.82, 21.18, 0.28)] as unknown as GeoJSON.Polygon['coordinates'] }, properties: { zoning: 'industrial', license: 'synthetic-demo' } },
      { type: 'Feature', geometry: { type: 'Polygon', coordinates: [hexRing(70.8, 22.33, 0.32)] as unknown as GeoJSON.Polygon['coordinates'] }, properties: { zoning: 'industrial', license: 'synthetic-demo' } },
    ],
  },
  environmental_risk: {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[71.2, 22.0], [72.4, 21.6], [72.1, 20.7], [70.9, 21.1], [71.2, 22.0]]] }, properties: { risk: 'flood', license: 'synthetic-demo' } },
    ],
  },
};
