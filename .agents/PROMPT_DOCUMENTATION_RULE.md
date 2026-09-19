# AI Prompt Change Documentation Rule

## Rule

Whenever an AI agent receives a prompt and makes **any repository change** in response, it must create one Markdown record under `docs/ai-change-log/` before completing the response. One record may cover one coherent prompt and its follow-up edits in the same turn. A prompt that produces no repository changes needs no record.

This rule is deliberately broad: code, tests, configuration, documentation, schemas, assets, and deletion requests all count as changes. The rule applies to all agents, models, IDE assistants, and automation operating in this repository.

## Create the record

Use this filename, in UTC:

`docs/ai-change-log/YYYY-MM-DD/HHMMSS-<agent-or-tool>-<short-slug>.md`

If a collision occurs, append `-02`, `-03`, and so on. Create the date folder when necessary. Use the structure in `PROMPT_CHANGELOG_TEMPLATE.md`.

## What to record

- Prompt: an accurate, concise request summary; include exact text only if it is safe and useful.
- Intent and non-obvious assumptions.
- All changed/created/deleted paths and a plain-language description of each change.
- Validation commands actually run and their result; explicitly write `Not run — <reason>` when applicable.
- Known limitations, risks, data assumptions, and follow-up decisions.

## Privacy and security

Never copy secrets, access tokens, private customer content, personally identifiable information, or proprietary dataset contents into the record. Redact sensitive values and describe their category instead. The changelog is an audit trail, not a transcript dump.

## Quality bar

Write the record after implementation details are known, but before announcing completion. It must be comprehensible to a teammate who never saw the original prompt. Update rather than duplicate the record when a single AI turn makes a correction to its own change.
