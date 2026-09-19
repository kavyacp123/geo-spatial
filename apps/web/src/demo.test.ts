import { describe, expect, it } from 'vitest';
import { circlePolygon, poiRelevance, poiForProfile, hotspotsForProfile, POI_LENS } from './demo';

function havKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a[1] * Math.PI) / 180) * Math.cos((b[1] * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

describe('circlePolygon', () => {
  it('closes the ring with 65 vertices and honours the radius in metres', () => {
    const f = circlePolygon([72.58, 23.02], 6670);
    expect(f.geometry.coordinates[0]).toHaveLength(65);
    const ring = f.geometry.coordinates[0];
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    for (const pt of ring.filter((_, i) => i % 8 === 0)) {
      expect(Math.abs(havKm([72.58, 23.02], pt as [number, number]) - 6.67)).toBeLessThan(0.05);
    }
    expect(f.properties?.radius_m).toBe(6670);
  });
});

describe('poiRelevance', () => {
  it('matches the product lens and caps affinity at 1', () => {
    expect(poiRelevance('fmcg_retail', 'competitor', 'rival')).toBe(1);
    expect(poiRelevance('ev_charging', 'competitor', 'rival')).toBe(0.3);
    expect(poiRelevance('restaurant_cafe', 'complementary', 'mall')).toBe(1);
    expect(poiRelevance('warehouse_logistics', 'complementary', 'mall')).toBe(0.4);
    expect(poiRelevance('unknown_profile', 'competitor', 'rival')).toBe(1);
  });
  it('stays bounded for every profile x kind', () => {
    for (const pid of Object.keys(POI_LENS)) {
      for (const [kind, sub] of [['competitor', 'rival'], ['complementary', 'mall'], ['complementary', 'fuel']] as const) {
        const v = poiRelevance(pid, kind, sub);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('poiForProfile / hotspotsForProfile', () => {
  it('stamps relevance on all 18 POIs', () => {
    const fc = poiForProfile('pharmacy');
    expect(fc.features).toHaveLength(18);
    for (const f of fc.features) {
      const r = (f.properties as Record<string, unknown>)?.relevance as number;
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
    }
  });
  it('is deterministic and regroups per product', () => {
    const a = hotspotsForProfile('fmcg_retail');
    const b = hotspotsForProfile('fmcg_retail');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const seen = new Set(
      ['fmcg_retail', 'ev_charging', 'warehouse_logistics', 'telecom_tower'].map((p) => JSON.stringify(hotspotsForProfile(p))),
    );
    expect(seen.size).toBe(4);
  });
  it('never returns an empty cluster set (threshold floor)', () => {
    for (const pid of Object.keys(POI_LENS)) {
      expect(hotspotsForProfile(pid).features.length).toBeGreaterThan(0);
    }
  });
});
