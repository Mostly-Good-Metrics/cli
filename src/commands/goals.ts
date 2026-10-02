import { Command } from "commander";
import * as auth from "../auth.js";
import * as client from "../client.js";
import { requireProjectId } from "../context.js";
import * as output from "../output.js";
import { CliUsageError } from "../runtime.js";

function parseObject(value: string, flag: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error();
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new CliUsageError(`${flag} must be a JSON object.`);
  }
}

function parseTarget(value: string): number {
  const target = Number(value);
  if (!Number.isFinite(target) || target < 0) {
    throw new CliUsageError("--target must be a non-negative number.");
  }
  return target;
}

function printGoal(goal: client.Goal): void {
  console.log(`Goal: ${goal.id}`);
  console.log(`Source: ${String(goal.source.type ?? "-")}`);
  console.log(`Target: ${goal.target_type} ${goal.target}`);
  console.log(`Current: ${goal.current_value ?? "-"}`);
  console.log(`Progress: ${goal.percent_complete === null ? "unavailable" : `${goal.percent_complete}%`}`);
  console.log(`Pace: ${goal.pace_line_text}`);
  if (goal.evaluation_status === "unavailable") {
    console.log(`Evaluation error: ${goal.evaluation_error ?? "evaluation_failed"}`);
  }
  console.log(`Projected finish: ${goal.projected_finish ?? "-"}`);
  console.log(`Notify on: ${goal.notify_on}`);
}

export function registerGoalsCommands(program: Command): void {
  const goals = program.command("goals").description("Manage metric goals");

  goals
    .command("list")
    .description("List goals with live progress and pace")
    .option("--project <id>", "Project ID")
    .option("--json", "Output as JSON")
    .action(async (opts: { project?: string; json?: boolean }) => {
      auth.requireToken();
      const data = await client.listGoals(requireProjectId(opts.project));

      if (opts.json) {
        output.json(data.goals);
        return;
      }

      if (data.goals.length === 0) {
        console.log("No goals found.");
        return;
      }

      output.table(
        ["ID", "Source", "Target", "Current", "Progress", "Pace"],
        data.goals.map((goal) => [
          goal.id,
          String(goal.source.type ?? "-"),
          `${goal.target_type} ${goal.target}`,
          goal.current_value === null ? "-" : String(goal.current_value),
          goal.percent_complete === null ? "unavailable" : `${goal.percent_complete}%`,
          goal.pace_line_text,
        ]),
      );
    });

  goals
    .command("create")
    .description("Create a goal from source and window JSON definitions")
    .requiredOption("--source <json>", "Source definition JSON")
    .requiredOption("--target-type <type>", "Target type: reach, threshold, growth, or streak")
    .requiredOption("--target <number>", "Target value")
    .requiredOption("--window <json>", "Window definition JSON")
    .option("--notify-on <mode>", "Notification mode: milestone, off_pace, both, or off", "both")
    .option("--project <id>", "Project ID")
    .option("--json", "Output as JSON")
    .action(async (opts: {
      source: string;
      targetType: string;
      target: string;
      window: string;
      notifyOn: string;
      project?: string;
      json?: boolean;
    }) => {
      auth.requireToken();
      const data = await client.createGoal(requireProjectId(opts.project), {
        source: parseObject(opts.source, "--source"),
        target_type: opts.targetType,
        target: parseTarget(opts.target),
        window: parseObject(opts.window, "--window"),
        notify_on: opts.notifyOn,
      });

      if (opts.json) {
        output.json(data.goal);
        return;
      }

      console.log("Goal created.");
      printGoal(data.goal);
    });

  goals
    .command("show")
    .description("Show a goal with live progress and pace")
    .argument("<id>", "Goal ID")
    .option("--project <id>", "Project ID")
    .option("--json", "Output as JSON")
    .action(async (id: string, opts: { project?: string; json?: boolean }) => {
      auth.requireToken();
      const data = await client.getGoal(requireProjectId(opts.project), id);

      if (opts.json) {
        output.json(data.goal);
        return;
      }

      printGoal(data.goal);
    });
}
