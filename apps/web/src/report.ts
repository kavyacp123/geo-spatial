// Report builder — print 1-pager + CSV, synthetic-labeled per WORKFLOW.md
export type ReportSite = {
  label: string;
  coords: { lat: number; lng: number };
  score: number;
  eligibility: string;
  version: number;
  weight_source: string;
  factors: { factor_id: string; label: string; weight: number; normalized_value: number; contribution: number; quality: string; unit: string }[];
  constraints: { effect: string; message: string }[];
  generated_at: string;
};

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export function buildReportHtml(opts: {
  profile: string;
  profileLabel: string;
  sites: ReportSite[];
  searchPoly: GeoJSON.Feature<GeoJSON.Polygon> | null;
  iso: Record<number, boolean>;
  generatedAt: string;
}): string {
  const { profile, profileLabel, sites, searchPoly, iso, generatedAt } = opts;
  const activeRings = [10, 20, 30].filter((m) => iso[m]);
  const leader = Math.max(...sites.map((s) => s.score));
  const wkt = searchPoly ? `POLYGON((${searchPoly.geometry.coordinates[0].map((c) => `${c[0].toFixed(5)} ${c[1].toFixed(5)}`).join(', ')}))` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GeoReady — Site Readiness Report</title><style>
*{box-sizing:border-box}html,body{margin:0;font:14px/1.5 Inter,system-ui,-apple-system,Segoe UI,sans-serif;color:#0f1a1a;background:#fff}
.sheet{max-width:900px;margin:0 auto;padding:28px 32px}
.head{border-bottom:3px solid #0f1a1a;padding-bottom:14px;margin-bottom:18px}
.head small{letter-spacing:.14em;color:#2a7d6e;font-weight:700;font-size:10px}
.head h1{margin:4px 0 2px;font:700 28px/1.1 "Space Grotesk",Inter,sans-serif}
.head .sub{color:#5a6b69;font-size:12px}
.pill{display:inline-block;font:700 10px/1 JetBrains Mono,monospace;letter-spacing:.08em;padding:4px 8px;border-radius:999px;border:1px solid #cbd5d1}
.cards{display:grid;gap:14px;margin:16px 0}
@media(min-width:700px){.cards.cols-2{grid-template-columns:1fr 1fr}.cards.cols-3{grid-template-columns:1fr 1fr 1fr}}
.card{border:1px solid #d8e0de;border-radius:12px;padding:14px;background:#fbfefd}
.card.leader{border-color:#0f7a5f;box-shadow:0 2px 18px rgba(15,122,95,.12)}
.card h2{margin:0 0 4px;font:700 15px/1.2 "Space Grotesk",sans-serif}
.muted{color:#5a6b69}
.score{font:700 26px/1 "Space Grotesk",sans-serif}
.table{width:100%;border-collapse:collapse;margin-top:8px}
.table th{font:700 10px JetBrains Mono,monospace;letter-spacing:.08em;text-align:left;color:#5a6b69;border-bottom:1px solid #d8e0de;padding:6px 6px}
.table td{padding:6px 6px;border-bottom:1px solid #eef2f1;font-size:12.5px}
.table td:last-child,.table th:last-child{text-align:right}
.bar{height:4px;border-radius:99px;background:#e3ece9;overflow:hidden}
.bar i{display:block;height:100%;background:linear-gradient(90deg,#2dd4a7,#f5b942)}
.note{margin-top:16px;padding:12px 14px;background:#fffbe6;border:1px solid #f5d56e;border-radius:10px;font-size:11.5px;color:#5b4c05}
.meta{margin-top:18px;padding:14px;border:1px solid #d8e0de;border-radius:12px;background:#f7faf9;font-size:11.5px}
.meta h3{margin:0 0 6px;font-size:12px;letter-spacing:.08em;color:#2a7d6e}
.footer{margin-top:22px;border-top:1px solid #d8e0de;padding-top:10px;color:#5a6b69;font:11px JetBrains Mono,monospace}
@media print{.no-print{display:none}body{background:#fff}.sheet{padding:0} @page{margin:14mm}}
</style></head><body><div class="sheet">
<div class="head"><small>GUJARAT · SITE INTELLIGENCE · GEOREADY</small><h1>Site Readiness Report</h1><div class="sub">${esc(profileLabel)} · profile <code>${esc(profile)}</code> · generated ${esc(generatedAt)} · study_area Gujarat · CRS EPSG:4326 [lon,lat]</div></div>
<div class="cards ${sites.length === 2 ? 'cols-2' : sites.length >= 3 ? 'cols-3' : ''}">
${sites
  .map((s) => {
    const delta = s.score - leader;
    const isLeader = Math.abs(s.score - leader) < 0.001;
    const badge = isLeader ? '★ Leader' : `Δ ${delta.toFixed(1)} vs best`;
    const eligCls = s.eligibility === 'eligible' ? '#0f7a5f' : s.eligibility === 'ineligible' ? '#c0392b' : '#9a7a00';
    return `<div class="card ${isLeader ? 'leader' : ''}"><h2>${esc(s.label)}</h2><div class="muted">${s.coords.lat.toFixed(4)}, ${s.coords.lng.toFixed(4)} · v${s.version} · ${esc(s.weight_source)} weights</div>
<div style="display:flex;align-items:baseline;gap:10px;margin-top:8px"><span class="score">${s.score.toFixed(1)}<span style="font-size:12px;color:#5a6b69">/100</span></span><span class="pill" style="color:${eligCls};border-color:${eligCls}">${esc(s.eligibility.toUpperCase())}</span><span class="pill">${esc(badge)}</span></div>
<table class="table"><thead><tr><th>Factor</th><th>Wt</th><th>Val</th><th>+Pts</th></tr></thead><tbody>
${s.factors.map((f) => `<tr><td>${esc(f.label)}<div class="bar"><i style="width:${Math.round(f.normalized_value * 100)}%"></i></div></td><td>${(f.weight * 100).toFixed(0)}%</td><td>${f.normalized_value.toFixed(2)}</td><td><b>${f.contribution.toFixed(1)}</b></td></tr>`).join('')}
</tbody></table>
${s.constraints.length ? `<div style="margin-top:8px;font-size:11.5px">${s.constraints.map((c) => `<span class="pill" style="margin-right:6px">${esc(c.effect.toUpperCase())}: ${esc(c.message)}</span>`).join('')}</div>` : ''}
</div>`;
  })
  .join('')}
</div>
${
  activeRings.length
    ? `<div class="meta"><h3>CATCHMENTS — DEMO CATCHMENT (geodesic, not routed)</h3>Geodesic circles at ~40 km/h drive proxy (metres internally): ${activeRings.map((m) => `${m} min · ~${(m * 0.667).toFixed(1)} km · ${m * 667} m`).join(' · ')}. Centered on each site’s pin; re-geodesed on move. Clearly labeled DEMO everywhere — replace with OSRM/Valhalla isochrones for planning use.</div>`
    : '<div class="meta"><h3>CATCHMENTS</h3>No demo catchments selected. Toggle 10/20/30 min in the atlas to add geodesic demo rings.</div>'
}
${
  searchPoly
    ? `<div class="meta"><h3>SEARCH POLYGON — USER-DRAWN (EPSG:4326)</h3><div style="word-break:break-all;font:11px JetBrains Mono,monospace">${esc(wkt)}</div><div class="muted" style="margin-top:6px">${searchPoly.geometry.coordinates[0].length - 1} vertices · session-local, included in this export; server-side filtering not yet applied — next: validate within metro boundary and intersect with layers.</div></div>`
    : '<div class="meta"><h3>SEARCH POLYGON</h3>No custom polygon drawn. Use Draw polygon in the atlas to outline a session-local search area.</div>'
}
<div class="meta"><h3>METHOD — TRANSPARENT WEIGHTED SCORE</h3>Score = clamp(Σ 100·wᵢ·nᵢ, 0, 100) with Σwᵢ=1.000±0.0001; distance-decay <code>exp(-d/scale)</code> for access, inverse density for competition. Hard constraints are <b>block / cap / warn</b> separate from weighted factors and explain whether they cap, block, or warn. Every factor row shows raw value + unit, normalized nᵢ, weight wᵢ, contribution cᵢ, data source/version, calculation method, and confidence/data-quality flag per <code>docs/architecture/data-contracts.md</code>.</div>
<div class="note"><b>DEMO DATA NOTICE — decision support only until validated layers are loaded.</b> All H3 hexes, DBSCAN hotspots, underserved gaps, raw layer stubs, and catchments shown here are <b>synthetic demo</b> with geodesic approximations. Sources: MapLibre + © OpenStreetMap contributors, © CARTO dark-matter tiles where applicable. Replace with versioned <code>layer_version / score_config / analysis_run</code> provenance before statutory or financial use. Coordinate order is [lon,lat] per EPSG:4326; distance/area computed geodesically or in a local projected CRS (never in degrees). H3 cells are aggregation, not precise site locations.</div>
<div class="meta"><h3>SOURCES &amp; PROVENANCE</h3>Tiles: © OpenStreetMap contributors · © CARTO (Obsidian basemap) · CRS EPSG:4326 · distance in _m, duration in _min. Profiles: eleven Gujarat plays share one engine (FMCG retail, convenience, hospital/clinic, EV charging, fuel station, warehouse, restaurant/café, pharmacy, bank/ATM, telecom tower, solar). Scoring kernel: Python FastAPI + GeoPandas/Shapely/PyProj (see ADR-001). All scores bounded [0,100], deterministic, and traceable to <code>score_config_version + layer_versions + analysis_run_id + generated_at</code> per record above.</div>
<div class="footer">GeoReady Obsidian Atlas · Gujarat · Printed ${esc(generatedAt)} · This report is reproducible from the exported JSON/CSV sibling — keep the <code>analysis_run_id</code> and config version for audit.</div>
<div class="no-print" style="margin-top:18px;display:flex;gap:8px"><button onclick="window.print()" style="padding:10px 18px;border-radius:999px;border:0;background:#0f1a1a;color:#fff;font-weight:700;cursor:pointer">Print / Save as PDF</button><button onclick="window.close()" style="padding:10px 18px;border-radius:999px;border:1px solid #d8e0de;background:#fff;cursor:pointer">Close</button></div>
</div></body></html>`;
}

export function openReport(html: string): void {
  const w = window.open('', '_blank');
  if (!w) {
    // fallback: download as html
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `geoready-report-${new Date().toISOString().slice(0, 10)}.html`;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
}

export function toCsv(sites: ReportSite[]): string {
  const header = ['label', 'lat', 'lng', 'score', 'eligibility', 'version', 'weight_source', 'factor_id', 'factor_label', 'weight', 'normalized_value', 'contribution', 'quality', 'unit', 'generated_at'].join(',');
  const rows = sites.flatMap((s) =>
    s.factors.map((f) =>
      [
        `"${s.label.replace(/"/g, '""')}"`,
        s.coords.lat.toFixed(6),
        s.coords.lng.toFixed(6),
        s.score.toFixed(2),
        s.eligibility,
        s.version,
        s.weight_source,
        f.factor_id,
        `"${f.label.replace(/"/g, '""')}"`,
        f.weight.toFixed(4),
        f.normalized_value.toFixed(4),
        f.contribution.toFixed(2),
        f.quality,
        f.unit,
        s.generated_at,
      ].join(','),
    ),
  );
  return [header, ...rows].join('\n');
}
