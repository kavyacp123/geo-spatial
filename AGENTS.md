# GeoSpatial Site Readiness Analyzer — Agent Instructions

This file governs every human or AI contributor working in this repository. Read it before inspecting, changing, or generating project files.

## Non-negotiable workflow

1. Read the relevant documentation in `docs/` and the detailed rules in `.agents/` before changing a feature.
2. Define the smallest useful change and preserve unrelated work already present in the working tree.
3. For **every AI-agent prompt that results in a repository change**, create a matching entry in `docs/ai-change-log/` before finishing. Follow `.agents/PROMPT_DOCUMENTATION_RULE.md` exactly. This includes documentation-only, configuration, and test changes.
4. Update the affected system, API, data, or operational documentation in the same change; do not leave planned behaviour undocumented.
5. Run the checks appropriate to the files changed and record the exact commands and outcome in the changelog entry. Never claim a check passed unless it ran.
6. Keep commits focused, reversible, and free of credentials, personal data, generated build outputs, and large source datasets.

## Delivery priorities

Build a transparent, demonstrable readiness-analysis product for one metropolitan area first. A working end-to-end flow is more valuable than broad but nonfunctional integrations:

`upload/select layers -> validate -> analyze -> score -> explain -> map -> compare/export`.

All user-facing scores must be reproducible from a versioned configuration and should explain both positive contributors and constraints. Treat geographic accuracy, coordinate reference systems, and source attribution as product requirements—not implementation details.

## Required reading by task

| Task | Read first |
| --- | --- |
| Any repository change | `.agents/WORKFLOW.md`, `.agents/PROMPT_DOCUMENTATION_RULE.md` |
| Architecture, service, database, or API change | `docs/architecture/system-design.md`, `docs/architecture/data-contracts.md`, `.agents/ENGINEERING_STANDARDS.md` |
| Scoring, maps, data ingestion, clustering, routing | `docs/architecture/system-design.md`, `.agents/GEOSPATIAL_STANDARDS.md` |
| Product scope or demos | `docs/product/mvp-plan.md`, `.agents/DEFINITION_OF_DONE.md` |

## Stop-and-escalate cases

Do not guess or silently proceed when a change would: alter score semantics or weights; process personally identifiable or licensed/restricted data; introduce a paid external API; delete or overwrite user data; change the target metro area; or make an external deployment. Document the decision and request the owner’s direction.

Detailed rules are indexed in `.agents/README.md`.
