import { Command } from "commander";
import * as client from "../client.js";
import * as auth from "../auth.js";
import * as output from "../output.js";
import { requireProjectId } from "../context.js";
import { requireConfirmation } from "../runtime.js";

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
    .argument("<type>", "Widget type: stat, pulse, query, funnel, retention, or text")
    .option("--query <id>", "Saved query ID (required for query widgets)")
    .option("--funnel <id>", "Saved funnel ID (required for funnel widgets)")
    .option("--retention <id>", "Saved retention ID (required for retention widgets)")
    .option("--stat-type <type>", "Stat type (required for stat widgets)")
    .option("--title <title>", "Title (for text widgets)")
    .option("--content <content>", "Content (for text widgets)")
    .option("--width <n>", "Widget width")
    .option("--height <n>", "Widget height")
    .option("--col <n>", "Dashboard column")
    .option("--row <n>", "Dashboard row")
    .option("--project <id>", "Project ID")
    .option("--json", "Output as JSON")
    .action(async (type: string, opts: {
      query?: string;
      funnel?: string;
      retention?: string;
      statType?: string;
      title?: string;
      content?: string;
      width?: string;
      height?: string;
      col?: string;
      row?: string;
      project?: string;
      json?: boolean;
    }) => {
      auth.requireToken();
      const projectId = requireProjectId(opts.project);

      const attrs: Record<string, unknown> = { widget_type: type };
      if (opts.query) attrs.saved_query_id = opts.query;
      if (opts.funnel) attrs.saved_funnel_id = opts.funnel;
      if (opts.retention) attrs.saved_retention_id = opts.retention;
      if (opts.statType) attrs.stat_type = opts.statType;
      if (opts.title) attrs.title = opts.title;
      if (opts.content) attrs.content = opts.content;
      if (opts.width) attrs.width = parseInt(opts.width, 10);
      if (opts.height) attrs.height = parseInt(opts.height, 10);
      if (opts.col) attrs.col = parseInt(opts.col, 10);
      if (opts.row) attrs.row = parseInt(opts.row, 10);

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
    .option("--json", "Output as JSON")
    .action(async (id: string, opts: { project?: string; json?: boolean }) => {
      auth.requireToken();
      const projectId = requireProjectId(opts.project);
      await requireConfirmation(`Remove widget ${id}`);
      const data = await client.deleteWidget(projectId, id);
      if (opts.json) {
        output.json(data);
        return;
      }
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
      await requireConfirmation("Reset dashboard widgets to defaults");
      const data = await client.resetWidgets(projectId);

      if (opts.json) {
        output.json(data.widgets);
        return;
      }

      console.log(`Widgets reset. ${data.widgets.length} default widget(s) restored.`);
    });
}
