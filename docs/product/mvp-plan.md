# Hackathon MVP Plan

## Recommended demo thesis

Choose one metro area and one use case—retail site selection is the fastest to explain. The product answers: **“Which candidate site is best, why, and what data supports that recommendation?”**

Use labeled synthetic competitor points where real business data is unavailable, and cite all open data sources. A polished, reproducible single-city story will score better than an unreliable multi-city product.

## Must-have user journey

1. Open a pre-seeded metro map with five toggleable, attributed layers.
2. Click a candidate location or select one of three prepared sites.
3. See an immediate 0–100 score, eligibility, constraints, and ranked explanation.
4. Turn on H3 suitability and DBSCAN hotspots; explain what the colors and patterns mean.
5. Adjust a factor weight within safe bounds and rerun/refresh the analysis, showing the score provenance/version.
6. Compare candidates and export a one-page report that includes sources, config, score factors, and caveats.

## Scope sequence

| Order | Deliverable | Evidence of completion |
| ---: | --- | --- |
| 1 | Metro boundary, data catalog, five normalized seed layers | Map renders each layer with attribution and validation metadata. |
| 2 | Candidate creation + deterministic score engine | Test fixture produces a known 0–100 breakdown. |
| 3 | PostGIS queries and score API | Candidate request returns factors, constraints, and layer/config version. |
| 4 | Map UX and compare drawer | Judge can discover/compare a site without assistance. |
| 5 | H3 + DBSCAN | Map shows interpretable high potential and cluster results. |
| 6 | Report export + seeded demo script | Product can be demonstrated repeatedly without live-data failure. |
| 7 | Stretch: OSRM catchments and Gi* | Only ship when labeled and robust. |

## Dataset checklist

For each layer, document coverage, date, provider, license, CRS, refresh expectation, schema, preprocessing, and known bias.

- Demographics: census polygons / population density.
- Transportation: OpenStreetMap roads, transit stops or major corridors.
- POIs: named synthetic competitors plus complementary businesses.
- Land use: zoning/building/parcel classification or credible demo proxy.
- Environmental risk: flood/air-quality/risk polygons or a clearly labeled synthetic proxy.

## Presentation narrative

Start with a business question, not the map: “We need a new retail site that reaches high demand, has road access, avoids risky zoning, and is not crowded by competitors.” Then show the candidate score, open the breakdown, toggle evidence layers, compare an alternative, and export the evidence. Close with the technical differentiator: a versioned, explainable score rather than a black-box recommendation.

## Do not compromise on

- Visible data source/quality caveats.
- Separate hard constraints from weighted scoring.
- Correct coordinate/distance handling.
- A deterministic fallback demo that does not rely on an external API at judging time.
