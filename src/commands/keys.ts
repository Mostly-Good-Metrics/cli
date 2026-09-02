import { Command } from "commander";
import * as client from "../client.js";
import * as auth from "../auth.js";
import * as output from "../output.js";
import { requireProjectId } from "../context.js";
import { CliUsageError, requireConfirmation } from "../runtime.js";

export function normalizeIdentifiers(identifiers: string[] | undefined): string[] {
  return [...new Set((identifiers ?? []).map((identifier) => identifier.trim()).filter(Boolean))];
}

export function identifiersMatch(requested: string[], returned: string[] | undefined): boolean {
  if (returned === undefined) return false;
  const sortedRequested = [...requested].sort();
  const sortedReturned = normalizeIdentifiers(returned).sort();
  return sortedRequested.length === sortedReturned.length
    && sortedRequested.every((identifier, index) => identifier === sortedReturned[index]);
}

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
        ["ID", "Name", "Environment", "Access", "Prefix", "Created"],
        data.api_keys.map((k) => [
          k.id,
          k.name,
          k.environment ?? "-",
          k.allowed_identifiers === undefined
            ? "Unknown"
            : k.allowed_identifiers.length === 0
              ? "Unrestricted (allows all)"
              : `Restricted (${k.allowed_identifiers.length})`,
          k.key_prefix ?? "-",
          k.created_at ?? k.inserted_at ?? "-",
        ]),
      );
    });

  keys
    .command("create")
    .description("Create an API key with --allow or --unrestricted")
    .argument("<name>", "Key name")
    .option("--project <id>", "Project ID")
    .option("--environment <environment>", "API key environment", "production")
    .option("--allow <identifier...>", "Allowed Apple bundle IDs, Android package names, or web domains")
    .option(
      "--unrestricted",
      "Allow every app identifier and web domain (confirm interactively or pass global --yes)",
    )
    .option("--json", "Output as JSON")
    .action(async (
      name: string,
      opts: {
        project?: string;
        environment?: string;
        allow?: string[];
        unrestricted?: boolean;
        json?: boolean;
      },
    ) => {
      auth.requireToken();
      const projectId = requireProjectId(opts.project);
      const allowedIdentifiers = normalizeIdentifiers(opts.allow);
      const isRestricted = allowedIdentifiers.length > 0;

      if (isRestricted === Boolean(opts.unrestricted)) {
        throw new CliUsageError(
          "Choose exactly one API key access mode: --allow <identifier...> or --unrestricted.",
        );
      }

      if (opts.unrestricted) {
        await requireConfirmation("Create an unrestricted API key that allows all app identifiers and web domains");
      }

      const environment = opts.environment ?? "production";
      const data = await client.createApiKey(projectId, name, {
        environment,
        allowedIdentifiers: isRestricted ? allowedIdentifiers : undefined,
      });

      const expectedIdentifiers = isRestricted ? allowedIdentifiers : [];
      if (data.api_key.environment !== environment
        || !identifiersMatch(expectedIdentifiers, data.api_key.allowed_identifiers)) {
        throw new CliUsageError(
          `WARNING: API key ${data.api_key.id} was created, but the server did not apply the requested environment and access restrictions. The raw key has been withheld. Revoke it now with: mgm keys revoke ${data.api_key.id} --project ${projectId}`,
        );
      }

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
    .option("--json", "Output as JSON")
    .action(async (id: string, opts: { project?: string; json?: boolean }) => {
      auth.requireToken();
      const projectId = requireProjectId(opts.project);
      await requireConfirmation(`Revoke API key ${id}`);
      const data = await client.revokeApiKey(projectId, id);
      if (opts.json) {
        output.json(data);
        return;
      }
      console.log("API key revoked.");
    });
}
