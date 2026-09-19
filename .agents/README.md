# Agent Playbook Index

`AGENTS.md` at the repository root is the mandatory entry point. This directory provides the implementation-level rules it references.

| File | Purpose |
| --- | --- |
| `WORKFLOW.md` | Required change lifecycle for contributors and AI agents. |
| `PROMPT_DOCUMENTATION_RULE.md` | Exact, auditable procedure for documenting each AI-driven repository change. |
| `ENGINEERING_STANDARDS.md` | Code, API, test, security, and review standards. |
| `GEOSPATIAL_STANDARDS.md` | CRS, geometry, spatial-analysis, and data-quality rules. |
| `DEFINITION_OF_DONE.md` | Acceptance criteria before a change may be called complete. |

If two rules conflict, use this precedence: explicit user instruction, `AGENTS.md`, the more specific rule in this directory, then project documentation. Raise an ambiguity instead of inventing a policy.
