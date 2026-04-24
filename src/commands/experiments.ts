import { Command } from "commander";
import * as client from "../client.js";
import * as auth from "../auth.js";
import * as output from "../output.js";
import { requireProjectId } from "../context.js";

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
    .command("start")
    .description("Start an experiment")
    .argument("<id>", "Experiment ID")
    .option("--project <id>", "Project ID")
    .action(async (id: string, opts: { project?: string }) => {
      auth.requireToken();
      const projectId = requireProjectId(opts.project);
      await client.startExperiment(projectId, id);
      console.log("Experiment started.");
    });

  experiments
    .command("stop")
    .description("Stop an experiment")
    .argument("<id>", "Experiment ID")
    .option("--project <id>", "Project ID")
    .action(async (id: string, opts: { project?: string }) => {
      auth.requireToken();
      const projectId = requireProjectId(opts.project);
      await client.stopExperiment(projectId, id);
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
      // Full results would come from the API response
      output.json(data);
    });
}
