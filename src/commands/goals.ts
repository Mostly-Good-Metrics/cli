import { Command } from "commander";
import * as auth from "../auth.js";
import * as client from "../client.js";
import { requireProjectId } from "../context.js";
import * as output from "../output.js";
import { CliUsageError } from "../runtime.js";

const GOAL_SHAPES = ["reach", "growth", "streak", "threshold"] as const;

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

function parseShape(value: string): client.Goal["shape"] {
  if (!GOAL_SHAPES.includes(value as client.Goal["shape"])) {
    throw new CliUsageError(`--shape must be one of: ${GOAL_SHAPES.join(", ")}.`);
  }
  return value as client.Goal["shape"];
}

function formatProgress(snapshot: client.GoalSnapshot): string {
  return snapshot.progress === null ? "unavailable" : `${snapshot.progress}%`;
}

function printGoal(goal: client.Goal): void {
  console.log(`Goal: ${goal.id}`);
  console.log(`Name: ${goal.name}`);
  console.log(`Source: ${String(goal.source.type ?? "-")}`);
  console.log(`Shape: ${goal.shape}`);
  console.log(`Goal configuration: ${JSON.stringify(goal.goal)}`);
  console.log(`Enabled: ${goal.enabled ? "yes" : "no"}`);
  console.log(`Following: ${goal.following ? "yes" : "no"}`);
  console.log(`Reached on: ${goal.reached_on ?? "-"}`);
}

function printSnapshot(snapshot: client.GoalSnapshot): void {
  console.log(`Current: ${snapshot.value ?? "-"}`);
  console.log(`Progress: ${formatProgress(snapshot)}`);
  console.log(`Status: ${snapshot.status}`);
  console.log(`Projected finish: ${snapshot.projected_finish?.date ?? "-"}`);
  if (snapshot.availability !== "available") {
    console.log(`Availability: ${snapshot.availability}`);
    console.log(`Unavailable reason: ${snapshot.unavailable_reason ?? "-"}`);
  }
}

export function registerGoalsCommands(program: Command): void {
  const goals = program.command("goals").description("Manage metric goals (limited preview)");

  goals
    .command("list")
    .description("List goals with live progress and pace")
    .option("--project <id>", "Project ID")
    .option("--json", "Output as JSON")
    .action(async (opts: { project?: string; json?: boolean }) => {
      auth.requireToken();
      const data = await client.listGoalSnapshots(requireProjectId(opts.project));

      if (opts.json) {
        output.json(data.goals);
        return;
      }

      if (data.goals.length === 0) {
        console.log("No goals found.");
        return;
      }

      output.table(
        ["ID", "Name", "Shape", "Current", "Progress", "Status"],
        data.goals.map((snapshot) => [
          snapshot.goal_id,
          snapshot.name,
          snapshot.shape,
          snapshot.value === null ? "-" : String(snapshot.value),
          formatProgress(snapshot),
          snapshot.status,
        ]),
      );
    });

  goals
    .command("create")
    .description("Create a goal from source, window, and goal JSON definitions")
    .requiredOption("--name <name>", "Goal name")
    .requiredOption("--source <json>", "Source definition JSON")
    .requiredOption("--shape <shape>", "Goal shape: reach, growth, streak, or threshold")
    .requiredOption("--goal <json>", "Shape-specific goal configuration JSON")
    .requiredOption("--window <json>", "Window definition JSON")
    .option("--starts-on <date>", "Optional lifecycle start date (YYYY-MM-DD)")
    .option("--ends-on <date>", "Optional lifecycle end date (YYYY-MM-DD)")
    .option("--disabled", "Create the goal with evaluation disabled")
    .option("--project <id>", "Project ID")
    .option("--json", "Output as JSON")
    .action(async (opts: {
      name: string;
      source: string;
      shape: string;
      goal: string;
      window: string;
      startsOn?: string;
      endsOn?: string;
      disabled?: boolean;
      project?: string;
      json?: boolean;
    }) => {
      auth.requireToken();
      const data = await client.createGoal(requireProjectId(opts.project), {
        name: opts.name,
        source: parseObject(opts.source, "--source"),
        shape: parseShape(opts.shape),
        goal: parseObject(opts.goal, "--goal"),
        window: parseObject(opts.window, "--window"),
        ...(opts.startsOn ? { starts_on: opts.startsOn } : {}),
        ...(opts.endsOn ? { ends_on: opts.endsOn } : {}),
        enabled: !opts.disabled,
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
    .description("Show a goal with its live snapshot")
    .argument("<id>", "Goal ID")
    .option("--project <id>", "Project ID")
    .option("--json", "Output as JSON")
    .action(async (id: string, opts: { project?: string; json?: boolean }) => {
      auth.requireToken();
      const projectId = requireProjectId(opts.project);
      const [goalData, snapshotData] = await Promise.all([
        client.getGoal(projectId, id),
        client.getGoalSnapshot(projectId, id),
      ]);

      if (opts.json) {
        output.json({ ...goalData.goal, snapshot: snapshotData.snapshot });
        return;
      }

      printGoal(goalData.goal);
      printSnapshot(snapshotData.snapshot);
    });
}
