-- Demo seed for Gujarat — deterministic, idempotent, small and synthetic.
-- Run via: docker compose up --build  (mounted to /docker-entrypoint-initdb.d)
-- All geometries EPSG:4326, reproducible for judging without external APIs.
INSERT INTO study_area (id, name, scope, boundary, distance_strategy)
VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'Gujarat',
  'state',
  ST_GeomFromText('MULTIPOLYGON(((68.2 19.6, 74.7 19.6, 74.7 24.9, 68.2 24.9, 68.2 19.6)))', 4326),
  'geodesic_or_local_projection'
) ON CONFLICT (name) DO NOTHING;

-- Score configs — eleven Gujarat plays, mirrors apps/api/src/siteTypes.ts + services/analysis/app/main.py
INSERT INTO score_config (id, version, target_use_case, factors, constraints, active) VALUES
('fmcg_retail',1,'fmcg_retail','[{"id":"demand","weight":0.30},{"id":"access","weight":0.20},{"id":"competition","weight":0.20},{"id":"zoning","weight":0.15},{"id":"risk","weight":0.15}]'::jsonb,'[{"id":"restricted_zoning","effect":"block"}]'::jsonb,true),
('convenience_store',1,'convenience_store','[{"id":"demand","weight":0.30},{"id":"footfall","weight":0.25},{"id":"competition","weight":0.20},{"id":"zoning","weight":0.15},{"id":"risk","weight":0.10}]'::jsonb,'[{"id":"commercial_zoning","effect":"block"}]'::jsonb,true),
('hospital_clinic',1,'hospital_clinic','[{"id":"demand","weight":0.25},{"id":"access","weight":0.25},{"id":"parcel","weight":0.20},{"id":"risk","weight":0.20},{"id":"competition","weight":0.10}]'::jsonb,'[{"id":"healthcare_permission","effect":"block"}]'::jsonb,true),
('ev_charging',1,'ev_charging','[{"id":"access","weight":0.25},{"id":"utility","weight":0.25},{"id":"gap","weight":0.20},{"id":"footfall","weight":0.15},{"id":"risk","weight":0.15}]'::jsonb,'[{"id":"grid_capacity","effect":"block"}]'::jsonb,true),
('fuel_station',1,'fuel_station','[{"id":"access","weight":0.35},{"id":"parcel","weight":0.25},{"id":"demand","weight":0.15},{"id":"competition","weight":0.15},{"id":"risk","weight":0.10}]'::jsonb,'[{"id":"fuel_zoning","effect":"block"}]'::jsonb,true),
('warehouse_logistics',1,'warehouse_logistics','[{"id":"access","weight":0.35},{"id":"parcel","weight":0.25},{"id":"zoning","weight":0.20},{"id":"risk","weight":0.10},{"id":"demand","weight":0.10}]'::jsonb,'[{"id":"industrial_zoning","effect":"block"}]'::jsonb,true),
('restaurant_cafe',1,'restaurant_cafe','[{"id":"footfall","weight":0.30},{"id":"demand","weight":0.25},{"id":"competition","weight":0.20},{"id":"access","weight":0.15},{"id":"zoning","weight":0.10}]'::jsonb,'[{"id":"food_service_zoning","effect":"block"}]'::jsonb,true),
('pharmacy',1,'pharmacy','[{"id":"demand","weight":0.30},{"id":"access","weight":0.20},{"id":"competition","weight":0.20},{"id":"footfall","weight":0.15},{"id":"zoning","weight":0.15}]'::jsonb,'[{"id":"commercial_zoning","effect":"block"}]'::jsonb,true),
('bank_atm',1,'bank_atm','[{"id":"footfall","weight":0.30},{"id":"demand","weight":0.20},{"id":"gap","weight":0.20},{"id":"access","weight":0.15},{"id":"zoning","weight":0.15}]'::jsonb,'[{"id":"commercial_zoning","effect":"block"}]'::jsonb,true),
('telecom_tower',1,'telecom_tower','[{"id":"gap","weight":0.35},{"id":"demand","weight":0.25},{"id":"access","weight":0.15},{"id":"parcel","weight":0.15},{"id":"risk","weight":0.10}]'::jsonb,'[{"id":"telecom_setback","effect":"block"}]'::jsonb,true),
('solar_installation',1,'solar_installation','[{"id":"parcel","weight":0.30},{"id":"utility","weight":0.25},{"id":"risk","weight":0.20},{"id":"access","weight":0.15},{"id":"zoning","weight":0.10}]'::jsonb,'[{"id":"land_permission","effect":"block"}]'::jsonb,true)
ON CONFLICT (id, version) DO NOTHING;

-- Five layer stubs — synthetic-demo, small enough for demo but versioned for provenance
INSERT INTO data_layer (id, study_area_id, kind, name, status) VALUES
('bbbb0001-0001-0001-0001-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','demographics','Gujarat demographics demo','ready'),
('bbbb0002-0002-0002-0002-000000000002','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','transport','Gujarat transport demo','ready'),
('bbbb0003-0003-0003-0003-000000000003','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','poi','Gujarat POI demo','ready'),
('bbbb0004-0004-0004-0004-000000000004','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','land_use','Gujarat land-use demo','ready'),
('bbbb0005-0005-0005-0005-000000000005','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','environmental_risk','Gujarat risk demo','ready')
ON CONFLICT (id) DO NOTHING;

INSERT INTO layer_version (id, layer_id, version, source_name, source_license, source_crs, normalized_crs, quality_report) VALUES
('cccc0001-0001-0001-0001-000000000001','bbbb0001-0001-0001-0001-000000000001',1,'synthetic demographics demo','synthetic-demo','EPSG:4326','EPSG:4326','{"status":"passed","warnings":["synthetic demo"]}'::jsonb),
('cccc0002-0002-0002-0002-000000000002','bbbb0002-0002-0002-0002-000000000002',1,'synthetic transport demo','synthetic-demo','EPSG:4326','EPSG:4326','{"status":"passed","warnings":["synthetic demo"]}'::jsonb),
('cccc0003-0003-0003-0003-000000000003','bbbb0003-0003-0003-0003-000000000003',1,'synthetic POI demo','synthetic-demo','EPSG:4326','EPSG:4326','{"status":"passed","warnings":["synthetic demo"]}'::jsonb),
('cccc0004-0004-0004-0004-000000000004','bbbb0004-0004-0004-0004-000000000004',1,'synthetic land-use demo','synthetic-demo','EPSG:4326','EPSG:4326','{"status":"passed","warnings":["synthetic demo"]}'::jsonb),
('cccc0005-0005-0005-0005-000000000005','bbbb0005-0005-0005-0005-000000000005',1,'synthetic risk demo','synthetic-demo','EPSG:4326','EPSG:4326','{"status":"passed","warnings":["synthetic demo"]}'::jsonb)
ON CONFLICT (layer_id, version) DO NOTHING;

-- Seeded candidate suggestions (mirrors SEEDED in apps/web/src/main.tsx)
INSERT INTO candidate_site (id, study_area_id, name, geom) VALUES
('dddd0001-0001-0001-0001-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Ahmedabad — SG Highway', ST_SetSRID(ST_MakePoint(72.505, 23.033),4326)),
('dddd0002-0002-0002-0002-000000000002','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Ahmedabad — Maninagar', ST_SetSRID(ST_MakePoint(72.602, 22.998),4326)),
('dddd0003-0003-0003-0003-000000000003','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Surat — Vesu', ST_SetSRID(ST_MakePoint(72.769, 21.145),4326)),
('dddd0004-0004-0004-0004-000000000004','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Vadodara — Alkapuri', ST_SetSRID(ST_MakePoint(73.181, 22.311),4326)),
('dddd0005-0005-0005-0005-000000000005','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Rajkot — 150ft Ring Rd', ST_SetSRID(ST_MakePoint(70.786, 22.303),4326))
ON CONFLICT (id) DO NOTHING;
