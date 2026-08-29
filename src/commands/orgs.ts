import { Command } from "commander";
import * as client from "../client.js";
import * as auth from "../auth.js";
import * as output from "../output.js";

export function registerOrgsCommands(program: Command): void {
  const orgs = program
    .command("orgs")
    .description("Manage organizations");

  orgs
    .command("list")
    .description("List organizations")
    .option("--json", "Output as JSON")
    .action(async (opts: { json?: boolean }) => {
      auth.requireToken();
      const data = await client.listOrganizations();

      if (opts.json) {
        output.json(data.organizations);
        return;
      }

      if (data.organizations.length === 0) {
        console.log("No organizations found. Create one with `mgm orgs create`.");
        return;
      }

      output.table(
        ["Name", "Slug", "Plan", "Role"],
        data.organizations.map((o) => [o.name, o.slug, o.plan ?? "-", o.role ?? "-"]),
      );
    });

  orgs
    .command("show")
    .description("Show organization details and projects")
    .argument("<slug>", "Organization slug")
    .option("--json", "Output as JSON")
    .action(async (slug: string, opts: { json?: boolean }) => {
      auth.requireToken();
      const data = await client.getOrganization(slug);

      if (opts.json) {
        output.json(data);
        return;
      }

      const o = data.organization;
      console.log(`Name: ${o.name}`);
      console.log(`Slug: ${o.slug}`);
      if (o.plan) console.log(`Plan: ${o.plan}`);
      if (o.events_per_month_limit !== undefined) {
        console.log(`Events/month limit: ${output.formatNumber(o.events_per_month_limit)}`);
      }

      if (data.projects.length > 0) {
        console.log();
        console.log("Projects:");
        output.table(
          ["ID", "Name", "Timezone"],
          data.projects.map((p) => [p.id, p.name, p.timezone]),
        );
      }
    });

  orgs
    .command("create")
    .description("Create a new organization")
    .argument("<name>", "Organization name")
    .option("--json", "Output as JSON")
    .action(async (name: string, opts: { json?: boolean }) => {
      auth.requireToken();
      const data = await client.createOrganization(name);

      if (opts.json) {
        output.json(data.organization);
        return;
      }

      console.log(`Organization created: ${data.organization.name}`);
      console.log(`Slug: ${data.organization.slug}`);
    });

  orgs
    .command("invite")
    .description("Invite a member to an organization")
    .argument("<email>", "Email address to invite")
    .option("--org <slug>", "Organization slug (defaults to your first org)")
    .option("--role <role>", "Role (member, admin)", "member")
    .option("--json", "Output as JSON")
    .action(async (email: string, opts: { org?: string; role: string; json?: boolean }) => {
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

      const data = await client.inviteMember(orgSlug, email, opts.role);
      if (opts.json) {
        output.json(data);
        return;
      }
      console.log(`Invitation sent to ${email} (${orgSlug}, role: ${opts.role}).`);
    });
}
