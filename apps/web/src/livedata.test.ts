import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCatalog, fetchHotspots, fetchIsochrone, postServerReport } from './livedata';

function mockFetchOnce(payload: unknown, ok = true) {
  (globalThis as Record<string, unknown>).fetch = vi.fn().mockResolvedValueOnce({ ok, json: () => Promise.resolve(payload) });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('livedata (mocked fetch)', () => {
  it('fetchCatalog maps the layer manifest', async () => {
    mockFetchOnce({ data: [{ id: 'l1', kind: 'poi', name: 'POI demo' }] });
    const cat = await fetchCatalog('http://x');
    expect(cat).toEqual([{ id: 'l1', kind: 'poi', name: 'POI demo' }]);
  });
  it('fetchCatalog returns null when the API is down', async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn().mockRejectedValueOnce(new Error('down'));
    expect(await fetchCatalog('http://x')).toBeNull();
  });
  it('fetchHotspots converts clusters to weighted points', async () => {
    mockFetchOnce({ clusters: [{ lng: 72.5, lat: 23.0, weight: 4.1, n: 5 }] });
    const fc = await fetchHotspots('http://x', 'fmcg_retail');
    expect(fc?.features).toHaveLength(1);
    expect((fc?.features[0].properties as Record<string, unknown>)?.weight).toBe(4.1);
  });
  it('fetchIsochrone returns null on non-OK status', async () => {
    mockFetchOnce({ error: 'nope' }, false);
    expect(await fetchIsochrone('http://x', 72.5, 23.0)).toBeNull();
  });
  it('fetchIsochrone passes rings through', async () => {
    mockFetchOnce({ rings: [{ minutes: 10, polygon: [[[0, 0]]], routed: true, population: 5 }], routed: true, provider: 'osrm' });
    const r = await fetchIsochrone('http://x', 72.5, 23.0, [10]);
    expect(r?.rings[0].minutes).toBe(10);
    expect(r?.routed).toBe(true);
  });
  it('postServerReport returns null offline so callers fall back', async () => {
    (globalThis as Record<string, unknown>).fetch = vi.fn().mockRejectedValueOnce(new Error('down'));
    expect(await postServerReport('http://x', [{ analysis_run_id: 'a', candidate_site_id: 'b' }])).toBeNull();
  });
});
