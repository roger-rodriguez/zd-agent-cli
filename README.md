# zd-agent-cli

AI Agent ready Zendesk access through your existing browser session. No API keys required.

`zagent` connects to a locally authenticated Zendesk Agent Workspace session and outputs structured JSON for queue triage, ticket reads, and search.

## Why this exists

Most Zendesk automations depend on API credentials that enterprise teams must issue, rotate, and govern.  
`zd-agent-cli` is built for teams that want LLM/agent workflows without introducing long-lived Zendesk API keys.

## Install

```bash
npm install -g zd-agent-cli
```

Or run from source:

```bash
npm install
npm run cli -- --help
npm run dev -- --help
```

## Quickstart

1. Ensure Chrome is running with CDP and logged into Zendesk.
2. Add `zendesk.config.json` at your working repo root.
3. Run first-launch checks:

```bash
zagent --json doctor
zagent --json auth check
```

4. If not authenticated yet, run:

```bash
zagent auth login --timeout 300
```

5. Discover queues:

```bash
zagent --json queue list
```

6. Read queue/ticket data:

```bash
zagent --json queue read support-open --count 20
zagent --json ticket read 123456 --comments 10
```

## Prerequisites

- macOS with Google Chrome installed.
- CDP endpoint reachable (default: `http://127.0.0.1:9223`).
- Default Chrome CDP profile dir is repo-local: `./output/zendesk/chrome-profile` (gitignored).
- Chrome profile used by CDP must be logged into Zendesk Agent Workspace.
- `zendesk.config.json` is present (or pass `--config <path>`).
- By default, `zagent` enforces CDP/profile ownership (it will not reuse a CDP endpoint launched with a different `--user-data-dir` unless you opt in).

## Config Contract

Create `zendesk.config.json`:

```json
{
  "domain": "acme.zendesk.com",
  "startPath": "/agent/filters/123456789",
  "defaultQueue": "support-open",
  "queues": {
    "support-open": {
      "path": "/agent/filters/123456789",
      "team": "support"
    },
    "technical-support-open": {
      "path": "/agent/filters/360000973008",
      "team": "technical-support"
    }
  }
}
```

Required:

- `domain`
- `startPath` (must begin with `/agent/`)
- `defaultQueue` (must match a queue alias)
- `queues` object where each alias has required `path` (must begin with `/agent/`)

## Core Commands

```bash
zagent --json queue list
zagent --json queue read support-open --count 20
zagent --json ticket read 123456 --comments 10
zagent --json search tickets "checkout issue" --count 20
zagent --json auth check
zagent --json doctor

# ticket read cache controls
zagent --json ticket read 123456 --cache-ttl 120
zagent --json --cache-only ticket read 123456
```

## Security Model

### What it does

- Uses the local logged-in Zendesk browser session.
- Operates with the same permissions as that human user.
- Produces structured JSON locally for downstream automations/LLMs.

### What it does not do

- Does not provision or require Zendesk API keys by default.
- Does not create elevated access beyond the active user session.
- Does not bypass Zendesk auth controls (SSO/MFA/session expiry still apply).

### Enterprise posture

- Works with existing identity controls and session policies.
- Reduces secret management overhead for pilot automations.
- Keeps execution local-first by default.

### Data handling guidance

- Do not commit real `zendesk.config.json` files.
- Do not commit queue/ticket output snapshots with customer data.
- Redact sample outputs before sharing in issues/docs.

## Troubleshooting

- Missing/invalid config:
  - Run `zagent --json doctor` and fix `zendesk.config.json`.
- Invalid queue alias:
  - Run `zagent --json queue list` and use a returned alias.
- CDP unavailable:
  - Verify Chrome CDP is live on `http://127.0.0.1:9223`, then rerun `zagent --json doctor`.
- CDP in use by another profile:
  - By default `zagent` will scan a local port range and either reuse a matching-profile CDP session or launch a new one on a free port.
  - Use `--no-auto-port` to disable this behavior.
  - Use `--allow-shared-cdp` to intentionally reuse a different profile on the same CDP endpoint.
- Auth/session issues:
  - Run `zagent auth login --timeout 300` and complete login in the opened Chrome profile.
- Transient navigation/network failures:
  - Retry once, then validate `domain`, `startPath`, and queue `path`.

## Global Options

- `--config <path>`
- `--domain <host>`
- `--start-path <path>`
- `--cdp-url <url>`
- `--cdp-port-span <n>`
- `--profile-dir <path>`
- `--store-root <path>`
- `--cache-ttl <seconds>`
- `--json`
- `--out <path>`
- `--no-store`
- `--no-cache`
- `--cache-only`
- `--no-launch`
- `--allow-shared-cdp`
- `--no-auto-port`
- `--foreground`

## Development

```bash
npm run lint
npm run typecheck
npm test
npm run smoke
npm run build
npm run verify
```

## Release

- Versions follow semantic versioning.
- `v*` tags trigger npm publish workflow.
- Keep changelog entries for every release.
