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

# Creates a project and a bundle-restricted API key, then writes .mgm.json.
mgm init --project "My iOS App" --sdk swift --allow com.example.app

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

# Send a development-tagged test event. The JSON argument is optional.
mgm events send --project prj_123
mgm events send '{"name":"checkout_test","properties":{"source":"cli"}}' --project prj_123

# Test events still count in dashboards unless the query filters environment=development.

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
  --breakdown-by platform \
  --range 7d \
  --project prj_123

# Power-user escape hatch: use the full safe MGM query definition.
mgm queries execute \
  --definition '{"metric":"count_events","group_by":"date","breakdown_by":"prop:screen","event_filter":["ios_screen_viewed"],"date_range":"30d"}' \
  --project prj_123
```

### Query definition

`--metric`, `--group-by`, `--breakdown-by`, `--granularity`, `--range`,
`--events`, `--platforms`, `--environments`, and `--exclude-lifecycle-events`
cover the common cases. `--definition` takes the same object those flags build
and is the only way to reach country/region/city filters and custom property
operators. Explicit flags override keys in `--definition`.

```jsonc
{
  "metric": "unique_users",          // count_events, unique_users, unique_sessions, dau
  "event_filter": ["purchase"],      // event names to count
  "group_by": "date",                // dimension below, or "prop:<name>"
  "breakdown_by": "platform",        // second dimension; only when group_by is "date"
  "granularity": "day",              // day, week, month; only when group_by is "date"
  "date_range": "30d",               // see below
  "exclude_lifecycle_events": true,  // drop auto-tracked $ events
  "filters": { "platforms": ["iOS"] }
}
```

Dimensions for `group_by` and `breakdown_by`: `date` (`group_by` only),
`platform`, `app_version`, `app_build_number`, `os_version`, `environment`,
`device_manufacturer`, `locale`, `timezone`, `country`, `region`, `city`,
`event_name`, or `prop:<property_name>`.

Date ranges: `1d`, `7d`, `30d`, `90d`, `365d`,
`custom:YYYY-MM-DD:YYYY-MM-DD`, or seasonal forms `month:11`, `months:11,12`,
`quarter:4`, `quarters:1,4`, `compare:month:11`, `compare:quarter:4`,
`compare:wow:4`.

#### filters

A flat object. Dimension keys are `platforms`, `event_names`, `environments`,
`app_versions`, `countries`, `regions`, and `cities`; the singular spellings
`environment`, `app_version`, `country`, `region`, and `city` mean the same
thing. Each takes a string or an array of strings. Values inside one key are
OR'd; separate keys are AND'd. Run `mgm dashboard filters` to see the values a
project actually has.

Custom properties use a `prop:<name>` key:

```jsonc
"prop:plan": "pro"                               // shorthand for IN ["pro"]
"prop:plan": ["pro", "team"]                     // IN
"prop:plan": { "op": "neq", "value": "free" }    // one clause
"prop:revenue": { "op": "gt", "type": "number", "value": 100 }
"prop:plan": [                                   // several clauses, OR'd
  { "op": "contains", "value": "ent" },
  { "op": "is_set" }
]
```

A clause takes `op` (default `eq`), `type` (`string` default, `number`,
`boolean`, `datetime`, `enum`), and `value` or `values`. Operators depend on
`type`:

| `type` | Operators |
| --- | --- |
| any | `is_set`, `is_not_set` |
| `string`, `enum` | `eq`, `neq`, `in`, `not_in`, `contains`, `not_contains`, `starts_with`, `ends_with` |
| `number` | `eq`, `neq`, `in`, `not_in`, `gt`, `gte`, `lt`, `lte`, `between` |
| `boolean` | `eq` |
| `datetime` | `before`, `after`, `on_or_before`, `on_or_after`, `between` |

Set `type` when you want numeric or chronological comparison; the default
`string` compares lexically. `in`, `not_in`, and `between` read `values`.
Clauses within one `prop:` key are OR'd; different `prop:` keys are AND'd.

A `prop:` filter is answered from raw events rather than daily aggregates, so
it is slower than a dimension filter. Prefer a dimension filter when one
covers what you need.

Funnel steps are a different shape. `mgm funnels create --steps` takes
comma-separated event names; per-step property filters use
`{"property": ..., "op": ..., "value": ...}` with the smaller operator set
`eq`, `neq`, `contains`, `not_contains`, `gt`, `gte`, `lt`, `lte`.

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

### Track goals

Goals are in limited preview and are available only to organizations with the
`goals` feature enabled.

```bash
mgm goals create \
  --name "Reach 1,000 purchases" \
  --source '{"type":"event_count","event_name":"purchase"}' \
  --shape reach \
  --goal '{"value":1000}' \
  --window '{"type":"deadline","start_date":"2026-10-01","deadline":"2026-10-31"}'

mgm goals list
mgm goals show <goal-id>
```

`mgm goals list` reads bounded live snapshots. `mgm goals show` reads the stored
goal definition and its `/snapshot` endpoint. Unavailable data remains marked
unavailable instead of being shown as zero.

### Manage access and dashboards

```bash
mgm orgs list
mgm projects create "My App" --org acme
mgm keys create "iOS Production" --project prj_123 --allow com.example.app
mgm keys create "Private relay" --project prj_123 --unrestricted --yes
mgm widgets list --project prj_123
mgm widgets add funnel --funnel fun_123 --project prj_123
```

Creating an API key requires an explicit access choice. Use one or more `--allow`
values for Apple bundle IDs, Android package names, or web domains. Use
`--unrestricted` only when the caller cannot
send a stable identifier; unrestricted creation requires interactive confirmation
or the global `--yes` flag. After restricted creation, the CLI verifies that the
server applied the requested environment and complete allowlist before revealing
the one-time key. The same access choice is required by `mgm init`; its key
environment defaults to `development` and can be changed with `--environment`.

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
| Analysis | `funnels`, `retention`, `queries`, `goals` |
| Experiments | `experiments` |
| Discovery | `commands`, `schema` |

Use `mgm commands --json` for the complete command tree, including all subcommands and flags.

## Credentials and local files

Interactive credentials are stored in the operating system credential store when available (macOS Keychain, Windows Credential Manager, or the Linux secret service). If no native store is available, the fallback config file is restricted to the current user.

`mgm init` writes `.mgm.json` in the current directory with the selected project context. Treat API keys printed by `mgm keys create` as secrets and store them in your CI secret manager. Human-readable `mgm keys list` output reports only whether each key is restricted; use `--json` when you need the full identifier allowlist. `mgm events send` uses the normal authenticated API and stores a real event tagged with `environment: "development"`. The event still counts toward dashboards and usage unless queries explicitly filter by environment.

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

Publishing is automated through npm trusted publishing. **Bumping the version
in `package.json` and merging to `main` is enough** — the release workflow
publishes and creates the matching `v*` tag for you.

```bash
npm version patch --no-git-tag-version   # or minor / major
# commit, open a PR, merge
```

Keep `VERSION` in `src/program.ts` in step with `package.json`; `npm version`
does not update it, and a test fails if the two disagree. `npm version` is the
easiest way to get `package-lock.json` updated too.

Pushing a `v*` tag by hand still works and publishes the version currently in
`package.json`.

The [`release.yml`](.github/workflows/release.yml) workflow builds, tests, and
publishes from GitHub Actions using OIDC—no long-lived npm token is stored in
the repository. npm automatically attaches provenance to trusted-publisher
releases. It skips publishing when the version has not changed or is already
on npm, so an ordinary merge to `main` does nothing.

> Before this was automated, a bump could be merged without a tag and simply
> never ship. That happened to 0.1.2 and 0.1.3, which exist in git history but
> never reached npm.

## License

[MIT](LICENSE)
