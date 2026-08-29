import { Command } from "commander";
import * as client from "../client.js";
import * as auth from "../auth.js";
import * as output from "../output.js";
import { requireProjectId } from "../context.js";
import { requireConfirmation } from "../runtime.js";

export function registerExperimentsCommands(program: Command): void {
  const experiments = program
    .command("experiments")
    .description("Manage A/B experiments");

  experiments
    .command("list")
    .description("List experiments")
    .option("--project <id>", "Project ID")
    .option("--json", "Output as JSON")
    .action(async (opts: { project?: string; json?: boolean }) => {
      auth.requireToken();
      const projectId = requireProjectId(opts.project);
      const data = await client.listExperiments(projectId);

      if (opts.json) {
        output.json(data.experiments);
        return;
      }

      if (data.experiments.length === 0) {
        console.log("No experiments found.");
        return;
      }

      output.table(
        ["ID", "Name", "Status", "Variants", "Goal"],
        data.experiments.map((e) => [
          e.id,
          e.name,
          e.status ?? "-",
          e.variants.join(", "),
          e.goal_event,
        ]),
      );
    });

  experiments
    .command("create")
    .description("Create an experiment")
    .requiredOption("--name <name>", "Experiment name")
    .requiredOption("--variants <variants>", "Comma-separated variant names")
    .requiredOption("--goal <event>", "Goal event name")
    .option("--project <id>", "Project ID")
    .option("--json", "Output as JSON")
    .action(async (opts: {
      name: string;
      variants: string;
      goal: string;
      project?: string;
      json?: boolean;
    }) => {
      auth.requireToken();
      const projectId = requireProjectId(opts.project);

      const data = await client.createExperiment(projectId, {
        name: opts.name,
        variants: opts.variants.split(",").map((v) => v.trim()),
        goal_event: opts.goal,
      });

      if (opts.json) {
        output.json(data.experiment);
        return;
      }

      console.log(`Experiment created: ${data.experiment.name}`);
      console.log(`ID: ${data.experiment.id}`);
    });

  experiments
    .command("show")
    .description("Show an experiment and its results")
    .argument("<id>", "Experiment ID")
    .option("--window-days <days>", "Observation window in days")
    .option("--goal <event>", "Alternative goal event")
    .option("--project <id>", "Project ID")
    .option("--json", "Output as JSON")
    .action(async (id: string, opts: {
      windowDays?: string; goal?: string; project?: string; json?: boolean;
    }) => {
      auth.requireToken();
      const params: Record<string, string> = {};
      if (opts.windowDays) params.observation_window_days = opts.windowDays;
      if (opts.goal) params.goal_event = opts.goal;
      const data = await client.getExperiment(requireProjectId(opts.project), id, params);
      if (opts.json) {
        output.json(data);
        return;
      }
      console.log(`Experiment: ${data.experiment.name}`);
      console.log(`Status: ${data.experiment.status ?? "-"}`);
      console.log(`Goal: ${data.experiment.goal_event}`);
    });

  experiments
    .command("update")
    .description("Update an experiment")
    .argument("<id>", "Experiment ID")
    .option("--name <name>", "Experiment name")
    .option("--description <description>", "Experiment description")
    .option("--variants <variants>", "Comma-separated variant names")
    .option("--goal <event>", "Goal event name")
    .option("--conversion-window-days <days>", "Conversion window in days")
    .option("--project <id>", "Project ID")
    .option("--json", "Output as JSON")
    .action(async (id: string, opts: {
      name?: string; description?: string; variants?: string; goal?: string; conversionWindowDays?: string;
      project?: string; json?: boolean;
    }) => {
      auth.requireToken();
      const attrs: Record<string, unknown> = {};
      if (opts.name) attrs.name = opts.name;
      if (opts.description) attrs.description = opts.description;
      if (opts.variants) attrs.variants = opts.variants.split(",").map((variant) => variant.trim());
      if (opts.goal) attrs.goal_event = opts.goal;
      if (opts.conversionWindowDays) {
        if (!/^[1-9]\d*$/.test(opts.conversionWindowDays)) {
          throw new Error("--conversion-window-days must be a positive whole number.");
        }
        attrs.conversion_window_days = parseInt(opts.conversionWindowDays, 10);
      }
      if (Object.keys(attrs).length === 0) throw new Error("Provide at least one field to update.");
      const data = await client.updateExperiment(requireProjectId(opts.project), id, attrs);
      if (opts.json) {
        output.json(data.experiment);
        return;
      }
      console.log(`Experiment updated: ${data.experiment.name}`);
    });

  experiments
    .command("start")
    .description("Start an experiment")
    .argument("<id>", "Experiment ID")
    .option("--project <id>", "Project ID")
    .option("--json", "Output as JSON")
    .action(async (id: string, opts: { project?: string; json?: boolean }) => {
      auth.requireToken();
      const projectId = requireProjectId(opts.project);
      const data = await client.startExperiment(projectId, id);
      if (opts.json) {
        output.json(data);
        return;
      }
      console.log("Experiment started.");
    });

  experiments
    .command("stop")
    .description("Stop an experiment")
    .argument("<id>", "Experiment ID")
    .option("--project <id>", "Project ID")
    .option("--json", "Output as JSON")
    .action(async (id: string, opts: { project?: string; json?: boolean }) => {
      auth.requireToken();
      const projectId = requireProjectId(opts.project);
      await requireConfirmation(`Stop experiment ${id}`);
      const data = await client.stopExperiment(projectId, id);
      if (opts.json) {
        output.json(data.experiment);
        return;
      }
      console.log("Experiment stopped.");
    });

  experiments
    .command("results")
    .description("Show experiment results")
    .argument("<id>", "Experiment ID")
    .option("--project <id>", "Project ID")
    .option("--json", "Output as JSON")
    .action(async (id: string, opts: { project?: string; json?: boolean }) => {
      auth.requireToken();
      const projectId = requireProjectId(opts.project);
      const data = await client.getExperiment(projectId, id);

      if (opts.json) {
        output.json(data.experiment);
        return;
      }

      const exp = data.experiment;
      console.log(`Experiment: ${exp.name}`);
      console.log(`Status: ${exp.status ?? "-"}`);
      console.log(`Goal: ${exp.goal_event}`);
      console.log(`Variants: ${exp.variants.join(", ")}`);
      console.log();
      output.json(data.results ?? data.experiment);
    });

  experiments
    .command("delete")
    .description("Delete an experiment")
    .argument("<id>", "Experiment ID")
    .option("--project <id>", "Project ID")
    .option("--json", "Output as JSON")
    .action(async (id: string, opts: { project?: string; json?: boolean }) => {
      auth.requireToken();
      await requireConfirmation(`Delete experiment ${id}`);
      const data = await client.deleteExperiment(requireProjectId(opts.project), id);
      if (opts.json) {
        output.json(data);
        return;
      }
      console.log("Experiment deleted.");
    });
}
