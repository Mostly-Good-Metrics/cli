import { Command } from "commander";
import * as client from "../client.js";
import * as auth from "../auth.js";
import * as output from "../output.js";
import { requireProjectId } from "../context.js";
import { CliUsageError } from "../runtime.js";

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
    .command("define")
    .description("Define an event before it is observed")
    .argument("<name>", "Event name (e.g. checkout_completed)")
    .option("--description <text>", "Optional event description")
    .option("--project <id>", "Project ID")
    .option("--json", "Output as JSON")
    .action(async (name: string, opts: { description?: string; project?: string; json?: boolean }) => {
      auth.requireToken();
      const projectId = requireProjectId(opts.project);
      const data = await client.createEventDefinition(projectId, {
        name,
        ...(opts.description ? { description: opts.description } : {}),
      });

      if (opts.json) {
        output.json(data.definition);
        return;
      }

      console.log(`Event defined: ${data.definition.name}`);
      console.log("No analytics event was sent; it will populate after first ingestion.");
    });

  events
    .command("send")
    .description("Send a test event with MGM_API_KEY")
    .argument("<event>", "Event JSON (e.g. '{\"name\":\"test\"}')")
    .option("--project <id>", "Project ID")
    .option("--json", "Output as JSON")
    .action(async (eventJson: string, opts: { project?: string; json?: boolean }) => {
      auth.requireToken();
      const projectId = requireProjectId(opts.project);

      let event: Record<string, unknown>;
      try {
        const parsed: unknown = JSON.parse(eventJson);
        if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
          throw new Error("Event must be a JSON object.");
        }
        event = parsed as Record<string, unknown>;
      } catch {
        throw new CliUsageError("Invalid event JSON. Example: '{\"name\":\"test_event\"}'");
      }

      const apiKey = process.env.MGM_API_KEY;
      if (!apiKey) {
        throw new CliUsageError("Set MGM_API_KEY to an active API key for the selected project.");
      }

      const { api_keys: apiKeys } = await client.listApiKeys(projectId);
      const belongsToProject = apiKeys.some(
        (key) => !key.revoked_at && key.key_prefix && apiKey.startsWith(key.key_prefix),
      );
      if (!belongsToProject) {
        throw new CliUsageError("MGM_API_KEY does not match an active API key for the selected project.");
      }

      await client.sendEvents(apiKey, [event]);

      if (opts.json) {
        output.json({ status: "sent", project_id: projectId, event });
        return;
      }
      console.log("Event sent.");
    });
}
