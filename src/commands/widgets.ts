import { Command } from "commander";
import * as client from "../client.js";
import * as auth from "../auth.js";
import * as output from "../output.js";
import { requireProjectId } from "../context.js";

export function registerWidgetsCommands(program: Command): void {
  const widgets = program
    .command("widgets")
    .description("Manage dashboard widgets");

  widgets
    .command("list")
    .description("List dashboard widgets")
    .option("--project <id>", "Project ID")
    .option("--json", "Output as JSON")
    .action(async (opts: { project?: string; json?: boolean }) => {
      auth.requireToken();
      const projectId = requireProjectId(opts.project);
      const data = await client.listWidgets(projectId);

      if (opts.json) {
        output.json(data.widgets);
        return;
      }

      if (data.widgets.length === 0) {
        console.log("No widgets found. Add one with `mgm widgets add`.");
        return;
      }

      output.table(
        ["ID", "Type", "Position", "Size"],
        data.widgets.map((w) => [
          w.id,
          w.widget_type,
          w.position !== undefined ? String(w.position) : "-",
          w.size ?? "-",
        ]),
      );
    });

  widgets
    .command("add")
    .description("Add a widget to the dashboard")
    .argument("<type>", "Widget type (e.g. stats, top_events, events_by_day)")
    .option("--size <size>", "Widget size (e.g. small, medium, large)")
    .option("--position <n>", "Position on the dashboard")
    .option("--project <id>", "Project ID")
    .option("--json", "Output as JSON")
    .action(async (type: string, opts: {
      size?: string;
      position?: string;
      project?: string;
      json?: boolean;
    }) => {
      auth.requireToken();
      const projectId = requireProjectId(opts.project);

      const attrs: Record<string, unknown> = { widget_type: type };
      if (opts.size) attrs.size = opts.size;
      if (opts.position !== undefined) attrs.position = parseInt(opts.position, 10);

      const data = await client.createWidget(projectId, attrs);

      if (opts.json) {
        output.json(data.widget);
        return;
      }

      console.log(`Widget added: ${data.widget.widget_type}`);
      console.log(`ID: ${data.widget.id}`);
    });

  widgets
    .command("remove")
    .description("Remove a widget from the dashboard")
    .argument("<id>", "Widget ID")
    .option("--project <id>", "Project ID")
    .action(async (id: string, opts: { project?: string }) => {
      auth.requireToken();
      const projectId = requireProjectId(opts.project);
      await client.deleteWidget(projectId, id);
      console.log("Widget removed.");
    });

  widgets
    .command("reset")
    .description("Reset dashboard widgets to defaults")
    .option("--project <id>", "Project ID")
    .option("--json", "Output as JSON")
    .action(async (opts: { project?: string; json?: boolean }) => {
      auth.requireToken();
      const projectId = requireProjectId(opts.project);
      const data = await client.resetWidgets(projectId);

      if (opts.json) {
        output.json(data.widgets);
        return;
      }

      console.log(`Widgets reset. ${data.widgets.length} default widget(s) restored.`);
    });
}
