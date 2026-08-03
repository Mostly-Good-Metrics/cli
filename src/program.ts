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

export const VERSION = "0.1.0";

export function buildProgram(): Command {
  const program = new Command();

  program
    .name("mgm")
    .description("MostlyGoodMetrics CLI")
    .version(VERSION);

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

  return program;
}
