import { Command } from "commander";
import * as client from "../client.js";
import * as auth from "../auth.js";
import * as output from "../output.js";

export function registerProjectsCommands(program: Command): void {
  const projects = program
    .command("projects")
    .description("Manage projects");

  projects
    .command("list")
    .description("List all projects")
    .option("--json", "Output as JSON")
    .action(async (opts: { json?: boolean }) => {
      auth.requireToken();
      const data = await client.listProjects();

      if (opts.json) {
        output.json(data.projects);
        return;
      }

      if (data.projects.length === 0) {
        console.log("No projects found. Create one with `mgm projects create`.");
        return;
      }

      output.table(
        ["ID", "Name", "Timezone"],
        data.projects.map((p) => [p.id, p.name, p.timezone]),
      );
    });

  projects
    .command("create")
    .description("Create a new project")
    .argument("<name>", "Project name")
    .option("--org <slug>", "Organization slug")
    .option("--timezone <tz>", "Timezone (e.g. America/New_York)")
    .option("--json", "Output as JSON")
    .action(async (name: string, opts: { org?: string; timezone?: string; json?: boolean }) => {
      auth.requireToken();

      let orgSlug = opts.org;
      if (!orgSlug) {
        const { organizations } = await client.getMe();
        if (organizations.length === 0) {
          console.error("No organizations found. Create one first.");
          process.exit(1);
        }
        orgSlug = organizations[0].slug;
      }

      const data = await client.createProject(orgSlug, name, opts.timezone);

      if (opts.json) {
        output.json(data.project);
        return;
      }

      console.log(`Project created: ${data.project.name}`);
      console.log(`ID: ${data.project.id}`);
    });

  projects
    .command("show")
    .description("Show project details")
    .argument("<id>", "Project ID")
    .option("--json", "Output as JSON")
    .action(async (id: string, opts: { json?: boolean }) => {
      auth.requireToken();
      const data = await client.getProject(id);

      if (opts.json) {
        output.json(data.project);
        return;
      }

      const p = data.project;
      console.log(`Name: ${p.name}`);
      console.log(`ID: ${p.id}`);
      console.log(`Timezone: ${p.timezone}`);
      if (p.organization_id) console.log(`Organization: ${p.organization_id}`);
    });
}
