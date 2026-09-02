# MostlyGoodMetrics CLI

The command-line interface for [MostlyGoodMetrics](https://mostlygoodmetrics.com). Use it to manage analytics projects, inspect events and dashboards, run product analyses, and operate experiments from a terminal, script, or coding agent.

## Install

Requires Node.js 18 or later.

```bash
npm install -g @mostly-good-metrics/cli
mgm --version
```

## Get started

Authenticate, create or select a project, then inspect its dashboard:

```bash
# Opens the MostlyGoodMetrics sign-in flow in your browser.
mgm login

# Creates a project and API key, then writes the project context to .mgm.json.
mgm init

# Reads the project in .mgm.json.
mgm dashboard --range 30d
```

Project-scoped commands use the `.mgm.json` file in the current directory. To work without one, pass `--project <project-id>` or set `MGM_PROJECT_ID`.

```bash
mgm projects list
mgm dashboard --project prj_123 --range 7d
```

## Common workflows

### Explore your product data

```bash
# See the events your project has received.
mgm events types --project prj_123
mgm events list --project prj_123 --range 7d

# Define an event before it is first sent, so it is ready for funnels and dashboards.
# This creates metadata only; it does not emit an analytics event.
mgm events define checkout_completed \
  --description "A customer completes checkout" \
  --project prj_123

# Run an ad-hoc funnel.
mgm funnels execute \
  --steps "app_open,add_to_cart,purchase" \
  --range 30d \
  --project prj_123

# Break out unique users by day.
mgm queries execute \
  --metric unique_users \
  --group-by date \
  --range 7d \
  --project prj_123
```

### Manage saved analysis

```bash
mgm funnels create --name "Checkout" --steps "app_open,checkout_started,purchase"
mgm retention create --name "Weekly retention" --cohort-event signup --retention-event app_open
mgm queries create --name "Daily active users" --metric unique_users --group-by date

mgm funnels list
mgm retention list
mgm queries list
```

### Run an experiment

```bash
mgm experiments create \
  --name "New paywall" \
  --variants "control,treatment" \
  --goal purchase

mgm experiments start exp_123
mgm experiments results exp_123
mgm experiments stop exp_123 --yes
```

### Manage access and dashboards

```bash
mgm orgs list
mgm projects create "My App" --org acme
mgm keys create "iOS Production" --project prj_123 --allow com.example.app
mgm keys create "Private relay" --project prj_123 --unrestricted --yes
mgm widgets list --project prj_123
```

Creating an API key requires an explicit access choice. Use one or more `--allow`
values for bundle IDs or domains. Use `--unrestricted` only when the caller cannot
send a stable identifier; unrestricted creation requires interactive confirmation
or the global `--yes` flag. After restricted creation, the CLI verifies that the
server applied the requested environment and complete allowlist before revealing
the one-time key.

## Automation and agents

The CLI is designed to be discoverable and safe in non-interactive environments.

```bash
# Inspect the entire command tree or the contract for one command.
mgm commands --json
mgm schema experiments update --json

# Produce JSON and select exactly the values a script needs.
mgm experiments list --project prj_123 --json --jq '.[] | .id'

# Run without a browser or local project file.
MGM_TOKEN="…" MGM_PROJECT_ID="prj_123" mgm experiments list --json

# Explicitly authorize destructive work in CI.
mgm experiments delete exp_123 --project prj_123 --no-input --yes --json
```

## Agent skills

MGM ships skills for instrumentation, metric analysis, funnel diagnosis, and weekly reviews. The CLI uses the standard npm-delivered [`skills`](https://skills.sh) installer, so the same command works for Codex, Claude Code, and other supported agents.

```bash
# See the four available MGM skills.
mgm skills list

# Install interactively in the current project.
mgm skills install

# Install all MGM skills globally for Codex without prompts.
mgm skills install --global --agent codex --yes

# Install only the instrumentation skill for Claude Code.
mgm skills install --agent claude-code --skill instrument-my-app
```

| Option | Purpose |
| --- | --- |
| `--json` | Emit machine-readable JSON where supported. |
| `--jq <expression>` | Filter JSON output with the standard `jq` executable. |
| `--no-input` | Fail instead of opening a browser or prompting. |
| `-y`, `--yes` | Confirm destructive operations such as deletion, key revocation, widget reset, and stopping an experiment. |

For scripts, use `MGM_TOKEN` rather than `mgm login --token`, because command-line arguments can be visible to other local processes. `MGM_API_URL` and `MGM_APP_URL` can point the CLI at a local development environment.

## Command reference

Run `mgm <command> --help` for flags and examples. The main command groups are:

| Area | Commands |
| --- | --- |
| Account | `login`, `signup`, `logout`, `whoami` |
| Organizations and projects | `orgs`, `projects`, `init` |
| Credentials | `keys` |
| Product data | `dashboard`, `events`, `widgets` |
| Analysis | `funnels`, `retention`, `queries` |
| Experiments | `experiments` |
| Discovery | `commands`, `schema` |

Use `mgm commands --json` for the complete command tree, including all subcommands and flags.

## Credentials and local files

Interactive credentials are stored in the operating system credential store when available (macOS Keychain, Windows Credential Manager, or the Linux secret service). If no native store is available, the fallback config file is restricted to the current user.

`mgm init` writes `.mgm.json` in the current directory with the selected project context. Treat API keys printed by `mgm keys create` as secrets and store them in your CI secret manager. Human-readable `mgm keys list` output reports only whether each key is restricted; use `--json` when you need the full identifier allowlist.

## Development

```bash
git clone https://github.com/Mostly-Good-Metrics/cli.git
cd cli
npm install
npm run build
npm test
node bin/mgm.js --help
```

CI runs the build, tests, and a CLI smoke test on Node 20 and 22 for every pull request.

## Releasing

Publishing is automated through npm trusted publishing. Create a version bump commit, then tag and push it:

```bash
git tag v0.2.0
git push origin v0.2.0
```

The [`release.yml`](.github/workflows/release.yml) workflow builds, tests, and publishes from GitHub Actions using OIDC—no long-lived npm token is stored in the repository. npm automatically attaches provenance to trusted-publisher releases.

## License

[MIT](LICENSE)
