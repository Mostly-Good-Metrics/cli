import { Command } from "commander";
import * as client from "../client.js";
import * as auth from "../auth.js";
import * as output from "../output.js";
import { requireProjectId } from "../context.js";

export function registerEventsCommands(program: Command): void {
  const events = program
    .command("events")
    .description("View and send events");

  events
    .command("list")
    .description("List recent events")
    .option("--project <id>", "Project ID")
    .option("--limit <n>", "Number of events (max 200)", "50")
    .option("--range <range>", "Date range (default 7d)")
    .option("--json", "Output as JSON")
    .action(async (opts: { project?: string; limit?: string; range?: string; json?: boolean }) => {
      auth.requireToken();
      const projectId = requireProjectId(opts.project);

      const params: Record<string, string> = {};
      if (opts.limit) params.limit = opts.limit;
      if (opts.range) params.date_range = opts.range;

      const data = await client.listEvents(projectId, params);

      if (opts.json) {
        output.json(data.events);
        return;
      }

      if (data.events.length === 0) {
        console.log("No events found.");
        return;
      }

      output.table(
        ["Timestamp", "Event", "User ID"],
        data.events.map((e) => [
          e.timestamp,
          e.name,
          e.user_id ?? "-",
        ]),
      );
    });

  events
    .command("types")
    .description("List event types with counts")
    .option("--project <id>", "Project ID")
    .option("--range <range>", "Date range (default 30d)")
    .option("--json", "Output as JSON")
    .action(async (opts: { project?: string; range?: string; json?: boolean }) => {
      auth.requireToken();
      const projectId = requireProjectId(opts.project);

      const params: Record<string, string> = {};
      if (opts.range) params.date_range = opts.range;

      const data = await client.listEventTypes(projectId, params);

      if (opts.json) {
        output.json(data.event_types);
        return;
      }

      if (data.event_types.length === 0) {
        console.log("No event types found.");
        return;
      }

      output.table(
        ["Event", "Count"],
        data.event_types.map((t) => [t.name, output.formatNumber(t.count)]),
      );
    });

  events
    .command("send")
    .description("Send a test event")
    .argument("<event>", "Event JSON (e.g. '{\"name\":\"test\"}')")
    .option("--project <id>", "Project ID")
    .action(async (eventJson: string, opts: { project?: string }) => {
      auth.requireToken();
      const projectId = requireProjectId(opts.project);

      let event: Record<string, unknown>;
      try {
        event = JSON.parse(eventJson);
      } catch {
        console.error("Invalid JSON. Example: '{\"name\":\"test_event\"}'");
        process.exit(1);
      }

      // Send via the ingestion endpoint
      const res = await fetch("https://ingest.mostlygoodmetrics.com/v1/events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth.requireToken()}`,
        },
        body: JSON.stringify({ events: [event] }),
      });

      if (!res.ok) {
        const body = await res.text();
        console.error(`Failed to send event: ${res.status} ${body}`);
        process.exit(1);
      }

      console.log("Event sent.");
    });
}
