# ADR-001: Use TypeScript/Node.js Product Services with a Python Spatial Analysis Service

- **Status:** Accepted for hackathon implementation
- **Date:** 2026-09-19

## Context

The product needs a responsive web interface, API orchestration, data ingestion, PostGIS persistence, transparent scoring, H3/DBSCAN/Gi* analysis, and optional routing. The team is considering Node.js.

## Decision

Use React + TypeScript + MapLibre GL for the client, a TypeScript Node.js API/BFF (Fastify preferred for a compact MVP), PostgreSQL/PostGIS for persistence, and a small FastAPI/Python spatial-analysis service. Use an internal API or job boundary between Node and Python. Docker Compose will run the local stack.

## Rationale

The team retains a familiar TypeScript workflow for the user-facing product while using Python's mature GeoPandas, Shapely, PyProj, scikit-learn, H3, and raster ecosystem for the mathematical/geospatial work. This avoids reimplementing error-prone GIS operations in browser or Node request code.

## Consequences

- The team maintains two runtimes and an inter-service contract.
- Spatial results must be versioned and validated at the boundary.
- The architecture can later move simple read/query workloads into PostGIS/Node without changing the frontend contract.
- If delivery time becomes critical, retain the boundaries but run the analysis service synchronously for the small demo dataset; do not remove provenance or score explainability.
