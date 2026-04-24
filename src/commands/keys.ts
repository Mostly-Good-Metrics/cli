import { Command } from "commander";
import * as client from "../client.js";
import * as auth from "../auth.js";
import * as output from "../output.js";
import { requireProjectId } from "../context.js";

export function registerKeysCommands(program: Command): void {
  const keys = program
    .command("keys")
    .description("Manage API keys");

  keys
    .command("list")
    .description("List API keys for current project")
    .option("--project <id>", "Project ID")
    .option("--json", "Output as JSON")
    .action(async (opts: { project?: string; json?: boolean }) => {
      auth.requireToken();
      const projectId = requireProjectId(opts.project);
      const data = await client.listApiKeys(projectId);

      if (opts.json) {
        output.json(data.api_keys);
        return;
      }

      if (data.api_keys.length === 0) {
        console.log("No API keys found. Create one with `mgm keys create`.");
        return;
      }

      output.table(
        ["ID", "Name", "Prefix", "Created"],
        data.api_keys.map((k) => [
          k.id,
          k.name,
          k.key_prefix ?? "-",
          k.created_at ?? "-",
        ]),
      );
    });

  keys
    .command("create")
    .description("Create a new API key")
    .argument("<name>", "Key name")
    .option("--project <id>", "Project ID")
    .option("--json", "Output as JSON")
    .action(async (name: string, opts: { project?: string; json?: boolean }) => {
      auth.requireToken();
      const projectId = requireProjectId(opts.project);
      const data = await client.createApiKey(projectId, name);

      if (opts.json) {
        output.json(data.api_key);
        return;
      }

      console.log(`API key created: ${data.api_key.name}`);
      console.log(`Key: ${data.api_key.key}`);
      console.log();
      console.log("Save this key — it won't be shown again.");
    });

  keys
    .command("revoke")
    .description("Revoke an API key")
    .argument("<id>", "Key ID")
    .option("--project <id>", "Project ID")
    .action(async (id: string, opts: { project?: string }) => {
      auth.requireToken();
      const projectId = requireProjectId(opts.project);
      await client.revokeApiKey(projectId, id);
      console.log("API key revoked.");
    });
}
