# Required Workflow

## Before editing

1. Read `AGENTS.md`, the task-relevant documents, and nearby implementation/tests.
2. Inspect the working tree and do not discard or rewrite another contributor's changes.
3. State the intended outcome, assumptions, inputs, outputs, and verification approach. For material architecture choices, create or update an ADR.

## While editing

1. Prefer small, cohesive changes with explicit interfaces and deterministic behaviour.
2. Keep scoring configuration data-driven; do not hide business weights in UI components or query strings.
3. Validate all data at boundaries. Preserve raw source data separately from normalized/derived layers.
4. Add or update automated tests with the implementation. Tests must cover happy path, invalid data, and relevant geospatial edge cases.
5. Keep documentation current alongside code. Use UTC ISO-8601 timestamps in machine-facing records.

## Before handing off

1. Run formatting, type/lint, unit, and affected integration checks where available.
2. Visually exercise map and score changes in the browser when the UI changes.
3. Add the AI change-log record required by `PROMPT_DOCUMENTATION_RULE.md`.
4. Summarize changed files, validation performed, known limitations, and next decision required.

## Scope discipline

- Do not add infrastructure, paid vendors, auth providers, or production deployments without an explicit decision.
- Do not substitute mock output for a real algorithm without labeling it as synthetic/demo data in the UI and docs.
- Never include API keys, access tokens, source-data credentials, private addresses, or raw sensitive location data in source, logs, screenshots, or reports.
