---
name: zendesk
description: "Use this skill when the user asks to triage Zendesk queues, inspect tickets, or draft support replies in Zendesk Agent Workspace via the `zagent` CLI."
---

# Zendesk

Use this skill to run Zendesk triage workflows safely and consistently with the local `zagent` CLI.

## When To Use

- The user asks to triage a Zendesk queue.
- The user asks to process open Zendesk tickets sequentially.
- The user asks to read ticket details or draft reply content from Zendesk data.

## When Not To Use

- The user asks for non-Zendesk support strategy with no need to read live tickets.
- The user asks for bulk parallel processing across multiple queues in one pass.
- Required local runtime checks fail (CLI, auth, config, or CDP).

## CLI Setup Required

- Interactive macOS session with Chrome available.
- CDP reachable at `http://127.0.0.1:9223`.
- Chrome profile already signed into Zendesk Agent Workspace.
- `zagent` installed on PATH (for example: `npm install -g zd-agent-cli`).
- `zendesk.config.json` present at repo root with: `domain`, `startPath`, `defaultQueue`, `queues`.

Run these checks before queue work:

1. `zagent --help`
2. `zagent --json doctor`
3. `zagent --json auth check`
4. `zagent --json queue list`

If any check fails, stop and report exactly what is missing.

## Inputs To Confirm

- Target queue alias (use user-provided alias; otherwise use configured default).
- Ticket count limit for this run.
- Reply mode:
  - `draft-only` (recommended default)
  - `apply` only if user explicitly asks to post/update

## Standard Workflow

1. Preflight:
   - `zagent --json queue list`
   - Validate requested alias exists.
2. Read queue:
   - `zagent --json queue read "<queue-alias>" --count <n>`
3. Process sequentially, one ticket at a time:
   - `zagent --json ticket read "<ticket-id>" --comments <n>`
   - Gather context and classify action needed.
   - Draft a concise response aligned with ticket context.
4. Use search only when required for cross-ticket context:
   - `zagent --json search tickets "<query>" --count <n>`
5. Return a run summary and explicit next actions.

## Output Format

For each run, provide:

1. Queue used and number of tickets reviewed.
2. Per-ticket summary:
   - ticket id
   - issue summary
   - recommended action
   - draft reply (if requested)
3. Risks/blockers needing human decision.
4. Final checklist of what was done vs not done.

## Guardrails

- Process tickets sequentially only (no parallel execution).
- Do not claim actions were posted unless the command actually executed.
- Default to `draft-only` unless the user explicitly requests applying changes.
- Do not invent missing ticket data; call out uncertainty.
- If queue alias is invalid, stop and ask user to choose from `queue list`.

## Troubleshooting

- Missing config:
  - Symptom: queue list/read fails early with missing/invalid config error.
  - Action: create/fix `zendesk.config.json` and rerun `queue list`.
- Invalid queue alias:
  - Symptom: requested queue not found.
  - Action: run `queue list` and use one of the returned aliases.
- CDP unavailable:
  - Symptom: cannot connect to `http://127.0.0.1:9223`.
  - Action: verify Chrome CDP session is running, then rerun `zagent --json doctor`.
- Auth/session issues:
  - Symptom: Zendesk pages redirect to login or return unauthorized API data.
  - Action: run `zagent auth login --timeout 300`, complete login in Chrome, then rerun `zagent --json auth check`.
- Transient navigation/network issues:
  - Symptom: intermittent `page.goto` failures or aborted navigation.
  - Action: retry once; if persistent, validate domain/startPath/queue path in config.
