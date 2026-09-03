import { Command } from "commander";
import * as client from "../client.js";
import * as auth from "../auth.js";
import * as output from "../output.js";
import { requireProjectId } from "../context.js";
import { requireConfirmation } from "../runtime.js";

interface QueryDefinitionOptions {
  metric?: string;
  groupBy?: string;
  breakdownBy?: string;
  granularity?: string;
  events?: string;
  platforms?: string;
  environments?: string;
  range?: string;
  excludeLifecycleEvents?: boolean;
  definition?: string;
}

function commaSeparated(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function parseDefinition(value?: string): Record<string, unknown> {
  if (!value) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("--definition must be valid JSON.");
  }

  if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("--definition must be a JSON object.");
  }

  return parsed as Record<string, unknown>;
}

function buildQueryDefinition(
  opts: QueryDefinitionOptions,
  base: Record<string, unknown> = {},
): Record<string, unknown> {
  const query = { ...base, ...parseDefinition(opts.definition) };
  if (opts.metric) query.metric = opts.metric;
  if (opts.groupBy) query.group_by = opts.groupBy;
  if (opts.breakdownBy) query.breakdown_by = opts.breakdownBy;
  if (opts.granularity) query.granularity = opts.granularity;
  if (opts.range) query.date_range = opts.range;
  if (opts.excludeLifecycleEvents) query.exclude_lifecycle_events = true;

  const existingFilters = query.filters;
  const filters: Record<string, unknown> =
    existingFilters !== null && typeof existingFilters === "object" && !Array.isArray(existingFilters)
      ? { ...(existingFilters as Record<string, unknown>) }
      : {};
  if (opts.events) filters.event_names = commaSeparated(opts.events);
  if (opts.platforms) filters.platforms = commaSeparated(opts.platforms);
  if (opts.environments) filters.environments = commaSeparated(opts.environments);
  if (Object.keys(filters).length > 0) query.filters = filters;

  return query;
}

function addAdvancedQueryOptions(command: Command): Command {
  return command
    .option("--breakdown-by <field>", "Split a date series into multiple lines")
    .option("--granularity <value>", "Date granularity (day, week, month)")
    .option("--platforms <values>", "Comma-separated platform filters")
    .option("--environments <values>", "Comma-separated environment filters")
    .option("--exclude-lifecycle-events", "Exclude automatic lifecycle events")
    .option("--definition <json>", "Full query definition JSON; explicit flags override it");
}

export function registerQueriesCommands(program: Command): void {
  const queries = program
    .command("queries")
    .description("Manage and execute saved queries");

  queries
    .command("list")
    .description("List saved queries")
    .option("--project <id>", "Project ID")
    .option("--json", "Output as JSON")
    .action(async (opts: { project?: string; json?: boolean }) => {
      auth.requireToken();
      const projectId = requireProjectId(opts.project);
      const data = await client.listInsights(projectId);

      if (opts.json) {
        output.json(data.queries);
        return;
      }

      if (data.queries.length === 0) {
        console.log("No saved queries found.");
        return;
      }

      output.table(
        ["ID", "Name", "Visualization"],
        data.queries.map((q) => [q.id, q.name, q.visualization ?? "-"]),
      );
    });

  addAdvancedQueryOptions(queries
    .command("create")
    .description("Create a saved query")
    .requiredOption("--name <name>", "Query name")
    .option("--metric <metric>", "Metric (e.g. unique_users, count_events)")
    .option("--group-by <field>", "Group by field (e.g. date, event_name)")
    .option("--events <names>", "Comma-separated event names to include")
    .option("--range <range>", "Date range (e.g. 30d)")
    .option("--visualization <type>", "Chart type (line, bar, table)")
    .option("--project <id>", "Project ID")
    .option("--json", "Output as JSON"))
    .action(async (opts: {
      name: string;
      metric?: string;
      groupBy?: string;
      breakdownBy?: string;
      granularity?: string;
      events?: string;
      platforms?: string;
      environments?: string;
      range?: string;
      excludeLifecycleEvents?: boolean;
      definition?: string;
      visualization?: string;
      project?: string;
      json?: boolean;
    }) => {
      auth.requireToken();
      const projectId = requireProjectId(opts.project);

      const queryDef = buildQueryDefinition(opts);

      const attrs: Record<string, unknown> = {
        name: opts.name,
        query_definition: queryDef,
      };
      if (opts.visualization) attrs.visualization = opts.visualization;

      const data = await client.createInsight(projectId, attrs);

      if (opts.json) {
        output.json(data.query);
        return;
      }

      console.log(`Query created: ${data.query.name}`);
      console.log(`ID: ${data.query.id}`);
    });

  queries
    .command("show")
    .description("Show a saved query's full definition")
    .argument("<id>", "Query ID")
    .option("--project <id>", "Project ID")
    .option("--json", "Output as JSON")
    .action(async (id: string, opts: { project?: string; json?: boolean }) => {
      auth.requireToken();
      const data = await client.getInsight(requireProjectId(opts.project), id);
      if (opts.json) {
        output.json(data.query);
        return;
      }
      console.log(`Query: ${data.query.name}`);
      console.log(`ID: ${data.query.id}`);
    });

  addAdvancedQueryOptions(queries
    .command("update")
    .description("Update a saved query")
    .argument("<id>", "Query ID")
    .option("--name <name>", "Query name")
    .option("--metric <metric>", "Metric")
    .option("--group-by <field>", "Group by field")
    .option("--events <names>", "Comma-separated event names to include")
    .option("--range <range>", "Date range")
    .option("--visualization <type>", "Chart type")
    .option("--project <id>", "Project ID")
    .option("--json", "Output as JSON"))
    .action(async (id: string, opts: {
      name?: string; metric?: string; groupBy?: string; breakdownBy?: string; granularity?: string;
      events?: string; platforms?: string; environments?: string; range?: string; excludeLifecycleEvents?: boolean;
      definition?: string; visualization?: string;
      project?: string; json?: boolean;
    }) => {
      auth.requireToken();
      const projectId = requireProjectId(opts.project);
      const attrs: Record<string, unknown> = {};
      if (opts.name) attrs.name = opts.name;
      const changesQuery = Boolean(
        opts.metric || opts.groupBy || opts.breakdownBy || opts.granularity || opts.events || opts.platforms ||
        opts.environments || opts.range || opts.excludeLifecycleEvents || opts.definition,
      );
      if (changesQuery) {
        const existing = await client.getInsight(projectId, id);
        attrs.query_definition = buildQueryDefinition(opts, existing.query.query_definition);
      }
      if (opts.visualization) attrs.visualization = opts.visualization;
      if (Object.keys(attrs).length === 0) throw new Error("Provide at least one field to update.");
      const data = await client.updateInsight(projectId, id, attrs);
      if (opts.json) {
        output.json(data.query);
        return;
      }
      console.log(`Query updated: ${data.query?.name ?? id}`);
    });

  addAdvancedQueryOptions(queries
    .command("execute")
    .description("Execute a saved or ad-hoc query")
    .argument("[id]", "Query ID (omit for ad-hoc)")
    .option("--metric <metric>", "Metric (ad-hoc)")
    .option("--group-by <field>", "Group by field (ad-hoc)")
    .option("--events <names>", "Comma-separated event names to include")
    .option("--range <range>", "Date range")
    .option("--project <id>", "Project ID")
    .option("--json", "Output as JSON"))
    .action(async (id: string | undefined, opts: {
      metric?: string;
      groupBy?: string;
      breakdownBy?: string;
      granularity?: string;
      events?: string;
      platforms?: string;
      environments?: string;
      range?: string;
      excludeLifecycleEvents?: boolean;
      definition?: string;
      project?: string;
      json?: boolean;
    }) => {
      auth.requireToken();
      const projectId = requireProjectId(opts.project);

      let result: { results: unknown };

      if (id) {
        result = await client.executeInsight(projectId, id);
      } else if (opts.metric || opts.definition) {
        const query = buildQueryDefinition(opts);
        result = await client.executeAdHocQuery(projectId, query);
      } else {
        console.error("Provide a query ID, --metric, or --definition for ad-hoc execution.");
        process.exit(1);
      }

      if (opts.json) {
        output.json(result);
        return;
      }

      const results = result.results as {
        labels?: string[];
        datasets?: { label: string; data: number[] }[];
      };

      if (results.labels && results.datasets) {
        for (const ds of results.datasets) {
          console.log(ds.label);
          output.table(
            ["Label", "Value"],
            results.labels.map((l, i) => [l, output.formatNumber(ds.data[i])]),
          );
          console.log();
        }
      } else {
        output.json(results);
      }
    });

  queries
    .command("delete")
    .description("Delete a saved query")
    .argument("<id>", "Query ID")
    .option("--project <id>", "Project ID")
    .option("--json", "Output as JSON")
    .action(async (id: string, opts: { project?: string; json?: boolean }) => {
      auth.requireToken();
      const projectId = requireProjectId(opts.project);
      await requireConfirmation(`Delete query ${id}`);
      const data = await client.deleteInsight(projectId, id);
      if (opts.json) {
        output.json(data);
        return;
      }
      console.log("Query deleted.");
    });
}
