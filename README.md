# MostlyGoodMetrics CLI

Command-line interface for [MostlyGoodMetrics](https://mostlygoodmetrics.com) — manage projects, API keys, and dashboards, and run funnels, retention, and queries from your terminal.

Documentation: [docs.mostlygoodmetrics.com](https://docs.mostlygoodmetrics.com)

## Install

Coming to npm soon. For now, install from source:

```bash
git clone https://github.com/Mostly-Good-Metrics/cli.git
cd cli
npm install
npm run build
npm link   # makes the `mgm` command available on your PATH
```

Requires Node.js 18 or newer.

## Quickstart

```bash
# Log in (opens your browser for OAuth)
mgm login

# Set up a project in the current directory (writes .mgm.json)
mgm init

# See your dashboard
mgm dashboard --range 30d
```

Most project-scoped commands read the project from `.mgm.json` (created by `mgm init`) or accept an explicit `--project <id>`. Add `--json` to any read command for machine-readable output.

## Automation and agents

The CLI is designed to be safely discoverable from a script or coding agent:

```bash
# Discover the complete command tree and each command's flags
mgm commands --json
mgm schema experiments update --json

# Emit JSON and filter it with jq
mgm commands --json --jq '.[] | select(.path == "experiments update")'

# Avoid browser/prompt flows in CI
MGM_TOKEN="..." MGM_PROJECT_ID="prj_123" mgm experiments list --json
# Set MGM_API_URL alongside MGM_APP_URL for a local API/OAuth development environment.
mgm init --project "My App" --org acme --no-input --json

# Explicitly confirm irreversible operations in scripts
mgm experiments delete exp_123 --project prj_123 --no-input --yes --json
```

`--no-input` makes commands that would otherwise prompt fail with a usage error. Deletions, key revocations, dashboard-widget resets, and stopping an experiment require confirmation; in non-interactive environments, pass `--yes` explicitly. `--jq` requires the standard `jq` executable.

## Commands

| Command | Description |
| --- | --- |
| `mgm login` / `mgm signup` / `mgm logout` | Browser-based OAuth auth (`--token` for CI) |
| `mgm whoami` | Show current user and organizations |
| `mgm init` | Create a project + API key and save local context |
| `mgm orgs list\|show\|create\|invite` | Manage organizations and members |
| `mgm projects list\|create\|show` | Manage projects |
| `mgm keys list\|create\|revoke` | Manage project API keys |
| `mgm dashboard` / `mgm dashboard filters` | Dashboard stats and available filter values |
| `mgm events list\|types\|send` | Inspect recent events, send test events |
| `mgm funnels list\|create\|show\|update\|execute\|delete` | Saved and ad-hoc funnels |
| `mgm retention list\|create\|show\|update\|execute\|delete` | Retention analyses |
| `mgm queries list\|create\|show\|update\|execute\|delete` | Saved and ad-hoc queries |
| `mgm experiments list\|create\|show\|update\|start\|stop\|delete` | Manage and analyze A/B experiments |
| `mgm widgets list\|add\|remove\|reset` | Manage dashboard widgets |
| `mgm commands` / `mgm schema <command>` | Discover the full command tree and typed flags |

Run `mgm <command> --help` for full options.

## Examples

```bash
# Ad-hoc funnel across three events
mgm funnels execute --steps "app_open,add_to_cart,purchase" --range 30d

# Unique users by day, as JSON
mgm queries execute --metric unique_users --group-by date --range 7d --json

# Create an API key for CI
mgm keys create "CI" --project prj_123
```

## Development

```bash
npm install
npm run build      # compile TypeScript to dist/
npm test           # run the vitest suite
npm run test:watch # watch mode
node bin/mgm.js --help
```

CI (build + tests on Node 20 and 22) runs on every PR via GitHub Actions.

## Releasing

Publishing is automated by `.github/workflows/release.yml`, which runs on version tags and publishes to npm **only if the `NPM_TOKEN` repository secret is set**.

One-time setup:

1. Create an npm automation token with publish access to the `@mostly-good-metrics` scope (the org must exist on npm).
2. Add it as the `NPM_TOKEN` secret in the GitHub repo (Settings > Secrets and variables > Actions).

To ship a release:

```bash
# bump "version" in package.json (and VERSION in src/program.ts), commit, then:
git tag v0.1.0
git push --tags
```

The workflow installs, builds, tests, and runs `npm publish --access public`. If `NPM_TOKEN` is missing it skips the publish step with a warning instead of failing.

## License

MIT
