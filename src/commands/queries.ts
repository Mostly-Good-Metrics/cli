import { Command } from "commander";
import * as client from "../client.js";
import * as auth from "../auth.js";
import * as output from "../output.js";
import { requireProjectId } from "../context.js";

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
        output.json(data.insights);
        return;
      }

      if (data.insights.length === 0) {
        console.log("No saved queries found.");
        return;
      }

      output.table(
        ["ID", "Name", "Visualization"],
        data.insights.map((q) => [q.id, q.name, q.visualization ?? "-"]),
      );
    });

  queries
    .command("create")
    .description("Create a saved query")
    .requiredOption("--name <name>", "Query name")
    .option("--metric <metric>", "Metric (e.g. unique_users, count_events)")
    .option("--group-by <field>", "Group by field (e.g. date, event_name)")
    .option("--range <range>", "Date range (e.g. 30d)")
    .option("--visualization <type>", "Chart type (line, bar, table)")
    .option("--project <id>", "Project ID")
    .option("--json", "Output as JSON")
    .action(async (opts: {
      name: string;
      metric?: string;
      groupBy?: string;
      range?: string;
      visualization?: string;
      project?: string;
      json?: boolean;
    }) => {
      auth.requireToken();
      const projectId = requireProjectId(opts.project);

      const queryDef: Record<string, unknown> = {};
      if (opts.metric) queryDef.metric = opts.metric;
      if (opts.groupBy) queryDef.group_by = opts.groupBy;
      if (opts.range) queryDef.date_range = opts.range;

      const attrs: Record<string, unknown> = {
        name: opts.name,
        query_definition: queryDef,
      };
      if (opts.visualization) attrs.visualization = opts.visualization;

      const data = await client.createInsight(projectId, attrs);

      if (opts.json) {
        output.json(data.insight);
        return;
      }

      console.log(`Query created: ${data.insight.name}`);
      console.log(`ID: ${data.insight.id}`);
    });

  queries
    .command("execute")
    .description("Execute a saved or ad-hoc query")
    .argument("[id]", "Query ID (omit for ad-hoc)")
    .option("--metric <metric>", "Metric (ad-hoc)")
    .option("--group-by <field>", "Group by field (ad-hoc)")
    .option("--range <range>", "Date range")
    .option("--project <id>", "Project ID")
    .option("--json", "Output as JSON")
    .action(async (id: string | undefined, opts: {
      metric?: string;
      groupBy?: string;
      range?: string;
      project?: string;
      json?: boolean;
    }) => {
      auth.requireToken();
      const projectId = requireProjectId(opts.project);

      let result: { results: unknown };

      if (id) {
        result = await client.executeInsight(projectId, id);
      } else if (opts.metric) {
        const query: Record<string, unknown> = { metric: opts.metric };
        if (opts.groupBy) query.group_by = opts.groupBy;
        if (opts.range) query.date_range = opts.range;
        result = await client.executeAdHocQuery(projectId, query);
      } else {
        console.error("Provide a query ID or --metric for ad-hoc execution.");
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
    .action(async (id: string, opts: { project?: string }) => {
      auth.requireToken();
      const projectId = requireProjectId(opts.project);
      await client.deleteInsight(projectId, id);
      console.log("Query deleted.");
    });
}
