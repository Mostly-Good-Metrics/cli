# MostlyGoodMetrics CLI

Command-line interface for [MostlyGoodMetrics](https://mostlygoodmetrics.com) — manage projects, API keys, and dashboards, and run funnels, retention, and queries from your terminal.

## Install

```bash
npm install -g @mostly-good-metrics/cli
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

## Commands

| Command | Description |
| --- | --- |
| `mgm login` / `mgm signup` / `mgm logout` | Browser-based OAuth auth (`--token` for CI) |
| `mgm whoami` | Show current user and organizations |
| `mgm init` | Create a project + API key and save local context |
| `mgm orgs list\|show\|create\|invite` | Manage organizations and members |
| `mgm projects list\|create\|show` | Manage projects |
| `mgm keys list\|create\|revoke` | Manage project API keys |
| `mgm dashboard` | Dashboard stats with filters (`--range`, `--platform`, ...) |
| `mgm events list\|types\|send` | Inspect recent events, send test events |
| `mgm funnels list\|create\|execute\|delete` | Saved and ad-hoc funnels |
| `mgm retention list\|create\|execute\|delete` | Retention analyses |
| `mgm queries list\|create\|execute\|delete` | Saved and ad-hoc queries |
| `mgm experiments ...` | Manage and start/stop experiments |
| `mgm widgets list\|add\|remove\|reset` | Manage dashboard widgets |

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
