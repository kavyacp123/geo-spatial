# AI Change Record — Rewrite README from full repo tour

- **UTC timestamp:** `2026-09-20T12:30:00Z`
- **Agent/tool:** `Muse Spark (opencode)`
- **Prompt summary:** `go through everything in this project, make the perfect readme and then push it. the current readme is bad and bland`
- **Intent:** `Replace the bland README with a complete, accurate, demo-led README covering product, scoring, stack, run/verify, API, layout, data caveats — then commit and push.`

## Changes

| Path | Action | Summary |
| --- | --- | --- |
| `README.md` | Modified | Full rewrite after reading system-design, data-contracts, MVP plan, ADRs, compose, both apps, analysis engine, seed SQL; adds thesis, highlights, architecture, scoring formula, run table, API table, verify, layout, caveats, docs links |
| `docs/ai-change-log/2026-09-20/123000-muse-spark-readme-rewrite.md` | Created | This audit record per PROMPT_DOCUMENTATION_RULE.md |

## Validation

| Check | Result | Notes |
| --- | --- | --- |
| `git status --short` | Passed | Only intended files changed (README + this log; pre-existing untracked pitch/ + prior log left untouched) |
| `git diff --stat` | Passed | README rewrite confirmed, no code touched |
| `npm run typecheck / lint / pytest` | Not run | Docs-only change; no source, schema, or score semantics altered |

## Assumptions, limitations, and follow-up

- Assumes ports/URLs from docker-compose.yml (5173/3000/8000) and seed counts from init SQL (11 configs, 6 layers, 5 sites) stay current; re-verify if compose or seeds change.
- No screenshots added — no verified asset in repo; add one when a stable UI capture exists.
- Pre-existing untracked `pitch/` + `120546` log entry preserved as-is, not part of this commit scope beyond leaving them alone.
