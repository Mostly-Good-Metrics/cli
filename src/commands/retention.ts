import { Command } from "commander";
import * as client from "../client.js";
import * as auth from "../auth.js";
import * as output from "../output.js";
import { requireProjectId } from "../context.js";
import { requireConfirmation } from "../runtime.js";

export function registerRetentionCommands(program: Command): void {
  const retention = program
    .command("retention")
    .description("Manage and execute retention analyses");

  retention
    .command("list")
    .description("List saved retentions")
    .option("--project <id>", "Project ID")
    .option("--json", "Output as JSON")
    .action(async (opts: { project?: string; json?: boolean }) => {
      auth.requireToken();
      const projectId = requireProjectId(opts.project);
      const data = await client.listRetentions(projectId);

      if (opts.json) {
        output.json(data.retentions);
        return;
      }

      if (data.retentions.length === 0) {
        console.log("No retention analyses found.");
        return;
      }

      output.table(
        ["ID", "Name", "Cohort Event", "Grain"],
        data.retentions.map((r) => [r.id, r.name, r.cohort_event, r.cohort_grain]),
      );
    });

  retention
    .command("create")
    .description("Create a retention analysis")
    .requiredOption("--name <name>", "Name")
    .requiredOption("--cohort-event <event>", "Cohort event name")
    .option("--retention-event <event>", "Retention event (null = any)")
    .option("--grain <grain>", "Cohort grain (day, week, month)", "week")
    .option("--days <days>", "Retention days (comma-separated)", "1,7,14,30")
    .option("--range <range>", "Date range (e.g. 90d)")
    .option("--project <id>", "Project ID")
    .option("--json", "Output as JSON")
    .action(async (opts: {
      name: string;
      cohortEvent: string;
      retentionEvent?: string;
      grain: string;
      days: string;
      range?: string;
      project?: string;
      json?: boolean;
    }) => {
      auth.requireToken();
      const projectId = requireProjectId(opts.project);

      const attrs: Record<string, unknown> = {
        name: opts.name,
        cohort_event: opts.cohortEvent,
        retention_event: opts.retentionEvent ?? null,
        cohort_grain: opts.grain,
        retention_days: opts.days.split(",").map((d) => parseInt(d.trim())),
      };
      if (opts.range) attrs.date_range = opts.range;

      const data = await client.createRetention(projectId, attrs);

      if (opts.json) {
        output.json(data.retention);
        return;
      }

      console.log(`Retention created: ${data.retention.name}`);
      console.log(`ID: ${data.retention.id}`);
    });

  retention
    .command("show")
    .description("Show a saved retention analysis' full definition")
    .argument("<id>", "Retention ID")
    .option("--project <id>", "Project ID")
    .option("--json", "Output as JSON")
    .action(async (id: string, opts: { project?: string; json?: boolean }) => {
      auth.requireToken();
      const data = await client.getRetention(requireProjectId(opts.project), id);
      output.json(data.retention);
    });

  retention
    .command("update")
    .description("Update a saved retention analysis")
    .argument("<id>", "Retention ID")
    .option("--name <name>", "Name")
    .option("--cohort-event <event>", "Cohort event name")
    .option("--retention-event <event>", "Retention event name")
    .option("--grain <grain>", "Cohort grain (day, week, month)")
    .option("--days <days>", "Retention days (comma-separated)")
    .option("--range <range>", "Date range (e.g. 90d)")
    .option("--project <id>", "Project ID")
    .option("--json", "Output as JSON")
    .action(async (id: string, opts: {
      name?: string; cohortEvent?: string; retentionEvent?: string; grain?: string; days?: string;
      range?: string; project?: string; json?: boolean;
    }) => {
      auth.requireToken();
      const attrs: Record<string, unknown> = {};
      if (opts.name) attrs.name = opts.name;
      if (opts.cohortEvent) attrs.cohort_event = opts.cohortEvent;
      if (opts.retentionEvent) attrs.retention_event = opts.retentionEvent;
      if (opts.grain) attrs.cohort_grain = opts.grain;
      if (opts.days) attrs.retention_days = opts.days.split(",").map((day) => parseInt(day.trim()));
      if (opts.range) attrs.date_range = opts.range;
      if (Object.keys(attrs).length === 0) throw new Error("Provide at least one field to update.");
      const data = await client.updateRetention(requireProjectId(opts.project), id, attrs);
      output.json(data.retention);
    });

  retention
    .command("execute")
    .description("Execute a saved retention analysis")
    .argument("<id>", "Retention ID")
    .option("--project <id>", "Project ID")
    .option("--json", "Output as JSON")
    .action(async (id: string, opts: { project?: string; json?: boolean }) => {
      auth.requireToken();
      const projectId = requireProjectId(opts.project);
      const result = await client.executeRetention(projectId, id);

      if (opts.json) {
        output.json(result);
        return;
      }

      const results = result.results as {
        cohorts?: { cohort_date: string; cohort_size: number; retention: number[] }[];
        periods?: string[];
      };

      if (results.cohorts && results.periods) {
        const headers = ["Cohort", "Size", ...results.periods];
        const rows = results.cohorts.map((c) => [
          c.cohort_date,
          output.formatNumber(c.cohort_size),
          ...c.retention.map((r) => `${r}%`),
        ]);
        output.table(headers, rows);
      } else {
        output.json(results);
      }
    });

  retention
    .command("delete")
    .description("Delete a retention analysis")
    .argument("<id>", "Retention ID")
    .option("--project <id>", "Project ID")
    .option("-y, --yes", "Confirm deletion")
    .option("--no-input", "Fail rather than prompt for confirmation")
    .option("--json", "Output as JSON")
    .action(async (id: string, opts: { project?: string; yes?: boolean; input?: boolean; json?: boolean }) => {
      auth.requireToken();
      const projectId = requireProjectId(opts.project);
      await requireConfirmation(opts, `Delete retention analysis ${id}`);
      const data = await client.deleteRetention(projectId, id);
      if (opts.json) {
        output.json(data);
        return;
      }
      console.log("Retention analysis deleted.");
    });
}
