import { Command } from "commander";
import { registerAuthCommands } from "./commands/auth.js";
import { registerProjectsCommands } from "./commands/projects.js";
import { registerOrgsCommands } from "./commands/orgs.js";
import { registerKeysCommands } from "./commands/keys.js";
import { registerInitCommand } from "./commands/init.js";
import { registerDashboardCommands } from "./commands/dashboard.js";
import { registerEventsCommands } from "./commands/events.js";
import { registerFunnelsCommands } from "./commands/funnels.js";
import { registerRetentionCommands } from "./commands/retention.js";
import { registerExperimentsCommands } from "./commands/experiments.js";
import { registerQueriesCommands } from "./commands/queries.js";
import { registerWidgetsCommands } from "./commands/widgets.js";
import { registerDiscoveryCommands } from "./commands/discovery.js";
import { registerSkillsCommands } from "./commands/skills.js";
import { configureRuntimeOptions } from "./runtime.js";

export const VERSION = "0.1.3";

export function buildProgram(): Command {
  const program = new Command();

  program
    .name("mgm")
    .description("MostlyGoodMetrics CLI")
    .version(VERSION)
    .option("--jq <expression>", "Filter JSON output with jq (requires jq)")
    .option("--no-input", "Fail rather than prompt for input")
    .option("-y, --yes", "Skip confirmation prompts");

  program.hook("preAction", () => {
    configureRuntimeOptions(program.opts());
  });

  registerAuthCommands(program);
  registerProjectsCommands(program);
  registerOrgsCommands(program);
  registerKeysCommands(program);
  registerInitCommand(program);
  registerDashboardCommands(program);
  registerEventsCommands(program);
  registerFunnelsCommands(program);
  registerRetentionCommands(program);
  registerExperimentsCommands(program);
  registerQueriesCommands(program);
  registerWidgetsCommands(program);
  registerDiscoveryCommands(program);
  registerSkillsCommands(program);

  return program;
}
