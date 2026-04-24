import { Command } from "commander";
import * as client from "../client.js";
import * as auth from "../auth.js";
import * as output from "../output.js";
import { requireProjectId } from "../context.js";

export function registerDashboardCommands(program: Command): void {
  program
    .command("dashboard")
    .description("Show dashboard stats for current project")
    .option("--project <id>", "Project ID")
    .option("--range <range>", "Date range (e.g. 7d, 30d, 90d)")
    .option("--start <date>", "Start date (YYYY-MM-DD)")
    .option("--end <date>", "End date (YYYY-MM-DD)")
    .option("--environment <env>", "Filter by environment")
    .option("--platform <platform>", "Filter by platform")
    .option("--event <name>", "Filter by event name")
    .option("--json", "Output as JSON")
    .action(async (opts: {
      project?: string;
      range?: string;
      start?: string;
      end?: string;
      environment?: string;
      platform?: string;
      event?: string;
      json?: boolean;
    }) => {
      auth.requireToken();
      const projectId = requireProjectId(opts.project);

      const params: Record<string, string> = {};
      if (opts.range) params.date_range = opts.range;
      if (opts.start) params.start_date = opts.start;
      if (opts.end) params.end_date = opts.end;
      if (opts.environment) params.environment = opts.environment;
      if (opts.platform) params.platform = opts.platform;
      if (opts.event) params.event_name = opts.event;

      const data = await client.getDashboard(projectId, params);

      if (opts.json) {
        output.json(data);
        return;
      }

      const { stats } = data;
      console.log("Dashboard Stats");
      console.log("===============");
      console.log(`Total Events:  ${output.formatNumber(stats.total_events)} (${output.formatTrend(stats.events_trend)})`);
      console.log(`Unique Users:  ${output.formatNumber(stats.unique_users)} (${output.formatTrend(stats.users_trend)})`);

      if (data.top_events.length > 0) {
        console.log();
        console.log("Top Events");
        output.table(
          ["Event", "Count"],
          data.top_events.map((e) => [e.name, output.formatNumber(e.count)]),
        );
      }

      if (data.events_by_day.length > 0) {
        console.log();
        console.log("Events by Day");
        output.table(
          ["Date", "Count"],
          data.events_by_day.map((d) => [d.date, output.formatNumber(d.count)]),
        );
      }
    });
}
