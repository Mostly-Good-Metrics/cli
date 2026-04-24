import { Command } from "commander";
import { registerAuthCommands } from "./commands/auth.js";
import { registerProjectsCommands } from "./commands/projects.js";
import { registerKeysCommands } from "./commands/keys.js";
import { registerInitCommand } from "./commands/init.js";
import { registerDashboardCommands } from "./commands/dashboard.js";
import { registerEventsCommands } from "./commands/events.js";
import { registerFunnelsCommands } from "./commands/funnels.js";
import { registerRetentionCommands } from "./commands/retention.js";
import { registerExperimentsCommands } from "./commands/experiments.js";
import { registerQueriesCommands } from "./commands/queries.js";
import { ApiError } from "./client.js";

const program = new Command();

program
  .name("mgm")
  .description("MostlyGoodMetrics CLI")
  .version("0.1.0");

registerAuthCommands(program);
registerProjectsCommands(program);
registerKeysCommands(program);
registerInitCommand(program);
registerDashboardCommands(program);
registerEventsCommands(program);
registerFunnelsCommands(program);
registerRetentionCommands(program);
registerExperimentsCommands(program);
registerQueriesCommands(program);

program.hook("postAction", () => {});

// Global error handler
const originalParse = program.parseAsync.bind(program);
program.parseAsync = async (argv?: string[]) => {
  try {
    return await originalParse(argv);
  } catch (err) {
    if (err instanceof ApiError) {
      console.error(`Error: ${err.message} (${err.code})`);
      process.exit(1);
    }
    throw err;
  }
};

program.parseAsync();
