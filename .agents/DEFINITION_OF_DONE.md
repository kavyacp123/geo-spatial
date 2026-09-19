# Definition of Done

A task may be described as complete only when all applicable items below are true.

- The requested outcome works in the documented local development path.
- Code, tests, docs, contracts, and configuration change together where required.
- Geospatial calculations declare CRS and units, use suitable distance/area methods, and handle invalid or missing data.
- Scores include a human-readable factor breakdown and identify constraints, layer versions, and configuration version.
- The change adds appropriate automated coverage and the relevant checks have passed, or unrun checks are explicitly disclosed.
- UI changes are checked at a practical desktop viewport and have usable loading, empty, and error states.
- No credentials, personal/sensitive location data, raw restricted datasets, or unnecessary generated outputs are included.
- An AI prompt change record exists under `docs/ai-change-log/` if an AI agent made the change.
- Known demo limitations and external-data caveats are visible in the product or relevant docs.
