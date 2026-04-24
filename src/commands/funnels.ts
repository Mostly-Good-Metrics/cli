import { Command } from "commander";
import * as client from "../client.js";
import * as auth from "../auth.js";
import * as output from "../output.js";
import { requireProjectId } from "../context.js";

export function registerFunnelsCommands(program: Command): void {
  const funnels = program
    .command("funnels")
    .description("Manage and execute funnels");

  funnels
    .command("list")
    .description("List saved funnels")
    .option("--project <id>", "Project ID")
    .option("--json", "Output as JSON")
    .action(async (opts: { project?: string; json?: boolean }) => {
      auth.requireToken();
      const projectId = requireProjectId(opts.project);
      const data = await client.listFunnels(projectId);

      if (opts.json) {
        output.json(data.funnels);
        return;
      }

      if (data.funnels.length === 0) {
        console.log("No funnels found. Create one with `mgm funnels create`.");
        return;
      }

      output.table(
        ["ID", "Name", "Steps"],
        data.funnels.map((f) => [
          f.id,
          f.name,
          f.steps.map((s) => s.event_name).join(" -> "),
        ]),
      );
    });

  funnels
    .command("create")
    .description("Create a funnel")
    .requiredOption("--name <name>", "Funnel name")
    .requiredOption("--steps <steps>", "Comma-separated event names")
    .option("--window <window>", "Conversion window (e.g. 7d)")
    .option("--range <range>", "Date range (e.g. 30d)")
    .option("--project <id>", "Project ID")
    .option("--json", "Output as JSON")
    .action(async (opts: {
      name: string;
      steps: string;
      window?: string;
      range?: string;
      project?: string;
      json?: boolean;
    }) => {
      auth.requireToken();
      const projectId = requireProjectId(opts.project);

      const steps = opts.steps.split(",").map((s) => ({
        event_name: s.trim(),
        name: s.trim(),
      }));

      const attrs: Record<string, unknown> = {
        name: opts.name,
        steps,
      };

      if (opts.window) {
        const match = opts.window.match(/^(\d+)d$/);
        if (match) {
          attrs.conversion_window_minutes = parseInt(match[1]) * 24 * 60;
        }
      }
      if (opts.range) attrs.date_range = opts.range;

      const data = await client.createFunnel(projectId, attrs);

      if (opts.json) {
        output.json(data.funnel);
        return;
      }

      console.log(`Funnel created: ${data.funnel.name}`);
      console.log(`ID: ${data.funnel.id}`);
    });

  funnels
    .command("execute")
    .description("Execute a saved or ad-hoc funnel")
    .argument("[id]", "Funnel ID (omit for ad-hoc)")
    .option("--steps <steps>", "Comma-separated event names (ad-hoc)")
    .option("--range <range>", "Date range")
    .option("--project <id>", "Project ID")
    .option("--json", "Output as JSON")
    .action(async (id: string | undefined, opts: {
      steps?: string;
      range?: string;
      project?: string;
      json?: boolean;
    }) => {
      auth.requireToken();
      const projectId = requireProjectId(opts.project);

      let result: { results: unknown };

      if (id) {
        result = await client.executeFunnel(projectId, id);
      } else if (opts.steps) {
        const steps = opts.steps.split(",").map((s) => ({
          event_name: s.trim(),
          name: s.trim(),
        }));
        const body: Record<string, unknown> = { steps };
        if (opts.range) body.date_range = opts.range;
        result = await client.executeAdHocFunnel(projectId, body);
      } else {
        console.error("Provide a funnel ID or --steps for ad-hoc execution.");
        process.exit(1);
      }

      if (opts.json) {
        output.json(result);
        return;
      }

      const results = result.results as {
        steps?: { name: string; count: number; conversion_rate: number }[];
        overall_conversion?: number;
      };

      if (results.steps) {
        output.table(
          ["Step", "Count", "Conversion"],
          results.steps.map((s) => [
            s.name,
            output.formatNumber(s.count),
            `${(s.conversion_rate * 100).toFixed(1)}%`,
          ]),
        );
        if (results.overall_conversion !== undefined) {
          console.log(`\nOverall: ${(results.overall_conversion * 100).toFixed(1)}%`);
        }
      } else {
        output.json(results);
      }
    });

  funnels
    .command("delete")
    .description("Delete a funnel")
    .argument("<id>", "Funnel ID")
    .option("--project <id>", "Project ID")
    .action(async (id: string, opts: { project?: string }) => {
      auth.requireToken();
      const projectId = requireProjectId(opts.project);
      await client.deleteFunnel(projectId, id);
      console.log("Funnel deleted.");
    });
}
