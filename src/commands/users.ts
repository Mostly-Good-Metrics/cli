import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { rename, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Writable } from "node:stream";
import { finished } from "node:stream/promises";
import { Command } from "commander";
import * as auth from "../auth.js";
import * as client from "../client.js";
import { requireProjectId } from "../context.js";
import * as output from "../output.js";
import { CliUsageError, requireConfirmation } from "../runtime.js";

interface ExportOptions {
  out?: string;
  project?: string;
}

interface EraseOptions {
  json?: boolean;
  project?: string;
}

export function registerUsersCommands(program: Command): void {
  const users = program
    .command("users")
    .description("Export or erase end-user data");

  users
    .command("export")
    .description("Export all data for one end user as JSON")
    .argument("<user_id>", "End-user ID")
    .option("--project <id>", "Project ID")
    .option("--out <file>", "Write JSON to a file instead of stdout")
    .action(async (userId: string, opts: ExportOptions) => {
      auth.requireToken();
      requireUserId(userId);
      const projectId = requireProjectId(opts.project);
      await exportUserData(projectId, userId, opts.out);
    });

  users
    .command("erase")
    .description("Permanently erase all data for one end user")
    .argument("<user_id>", "End-user ID")
    .option("--project <id>", "Project ID")
    .option("--json", "Output as JSON")
    .action(async (userId: string, opts: EraseOptions) => {
      auth.requireToken();
      requireUserId(userId);
      const projectId = requireProjectId(opts.project);
      await requireConfirmation(
        `Erase all data for user ${JSON.stringify(userId)} from project ${JSON.stringify(projectId)}`,
      );
      const response = await client.eraseUserData(projectId, userId);

      if (opts.json) {
        output.json(response);
        return;
      }

      console.log("User data erasure accepted.");
      console.log(`Project: ${projectId}`);
      console.log(`User ID: ${JSON.stringify(userId)}`);
      console.log(`Events: ${response.deletion.events}`);
      console.log(`User daily event rows: ${response.deletion.user_daily_events}`);
      console.log(`Profiles: ${response.deletion.profiles}`);
      console.log(
        `Experiment assignments: ${response.deletion.experiment_variant_assignments}`,
      );
      console.log(`Aliases: ${response.deletion.aliases}`);
      console.log(
        `ClickHouse cleanup job: ${response.deletion.clickhouse_job_enqueued ? "enqueued" : "not enqueued"}`,
      );
    });
}

function requireUserId(userId: string): void {
  if (userId.trim().length === 0) {
    throw new CliUsageError("User ID must not be blank.");
  }
}

async function exportUserData(
  projectId: string,
  userId: string,
  outFile?: string,
): Promise<void> {
  const destination = outFile ? path.resolve(outFile) : undefined;
  const directory = destination ? path.dirname(destination) : tmpdir();
  const basename = destination ? path.basename(destination) : "mgm-user-export.json";
  const stagedFile = path.join(directory, `.${basename}.${randomUUID()}.tmp`);
  const stream = createWriteStream(stagedFile, {
    encoding: "utf8",
    flags: "wx",
    mode: 0o600,
  });
  const streamFinished = finished(stream);
  void streamFinished.catch(() => {});

  try {
    await writeCombinedExport(stream, projectId, userId);
    stream.end();
    await streamFinished;

    if (destination) {
      await rename(stagedFile, destination);
      console.log(`User data exported to ${destination}.`);
      return;
    }

    for await (const chunk of createReadStream(stagedFile)) {
      await writeChunk(process.stdout, chunk);
    }
  } catch (error) {
    stream.destroy();
    await streamFinished.catch(() => {});
    throw error;
  } finally {
    await unlink(stagedFile).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}

async function writeCombinedExport(
  stream: Writable,
  projectId: string,
  userId: string,
): Promise<void> {
  let page = await client.exportUserDataPage(projectId, userId);
  const firstPage = page;
  const seenCursors = new Set<string>();
  let wroteEvent = false;

  await writeChunk(stream, "{\n");
  await writeField(stream, "user_id", firstPage.user_id);
  await writeField(stream, "resolved_user_ids", firstPage.resolved_user_ids);
  await writeField(stream, "profiles", firstPage.profiles);
  await writeField(
    stream,
    "experiment_variant_assignments",
    firstPage.experiment_variant_assignments,
  );
  await writeChunk(stream, '  "events": [');

  while (true) {
    for (const event of page.events) {
      const serialized = JSON.stringify(event, null, 2).replace(/\n/g, "\n    ");
      await writeChunk(stream, `${wroteEvent ? "," : ""}\n    ${serialized}`);
      wroteEvent = true;
    }

    if (!page.pagination.has_more) break;
    const cursor = page.pagination.next_cursor;
    if (!cursor) {
      throw new Error("The export API reported more data without providing a cursor.");
    }
    if (seenCursors.has(cursor)) {
      throw new Error("The export API repeated a cursor before the export completed.");
    }
    seenCursors.add(cursor);
    page = await client.exportUserDataPage(projectId, userId, cursor);
  }

  await writeChunk(stream, wroteEvent ? "\n  ],\n" : "],\n");
  await writeLastField(stream, "pagination", page.pagination);
  await writeChunk(stream, "}\n");
}

async function writeField(stream: Writable, name: string, value: unknown): Promise<void> {
  const serialized = JSON.stringify(value, null, 2).replace(/\n/g, "\n  ");
  await writeChunk(stream, `  ${JSON.stringify(name)}: ${serialized},\n`);
}

async function writeLastField(stream: Writable, name: string, value: unknown): Promise<void> {
  const serialized = JSON.stringify(value, null, 2).replace(/\n/g, "\n  ");
  await writeChunk(stream, `  ${JSON.stringify(name)}: ${serialized}\n`);
}

async function writeChunk(stream: Writable, chunk: string | Buffer): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    stream.write(chunk, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
