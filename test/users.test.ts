import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as auth from "../src/auth.js";
import { ApiError } from "../src/client.js";
import { buildProgram } from "../src/program.js";
import { CliUsageError } from "../src/runtime.js";
import { makeTestable, run } from "./helpers.js";

const readlineMock = vi.hoisted(() => ({
  close: vi.fn(),
  createInterface: vi.fn(),
  question: vi.fn(),
}));

vi.mock("node:readline/promises", () => ({
  default: { createInterface: readlineMock.createInterface },
}));
vi.mock("../src/auth.js");

interface MockResponse {
  status?: number;
  json: unknown;
}

const originalIsTTY = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
let logs: string[];
let stdout: string;
let testDirectory: string;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.mocked(auth.requireToken).mockReturnValue("test-token");
  vi.mocked(auth.getToken).mockReturnValue("test-token");
  readlineMock.createInterface.mockReturnValue({
    close: readlineMock.close,
    question: readlineMock.question,
  });
  logs = [];
  stdout = "";
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  });
  vi.spyOn(process.stdout, "write").mockImplementation(((
    chunk: string | Uint8Array,
    encodingOrCallback?: BufferEncoding | ((error?: Error | null) => void),
    callback?: (error?: Error | null) => void,
  ) => {
    stdout += chunk.toString();
    const done = typeof encodingOrCallback === "function" ? encodingOrCallback : callback;
    done?.(null);
    return true;
  }) as typeof process.stdout.write);
  testDirectory = await mkdtemp(path.join(tmpdir(), "mgm-users-test-"));
  setTTY(false);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await rm(testDirectory, { recursive: true, force: true });
  if (originalIsTTY) {
    Object.defineProperty(process.stdin, "isTTY", originalIsTTY);
  } else {
    delete (process.stdin as { isTTY?: boolean }).isTTY;
  }
});

describe("users export", () => {
  it("follows cursors and writes one combined JSON document", async () => {
    const fetchMock = mockFetch(
      {
        json: {
          user_id: "account-1",
          resolved_user_ids: ["account-1", "device-1"],
          profiles: [{ user_id: "device-1", identified_user_id: "account-1" }],
          experiment_variant_assignments: [
            { experiment_id: "exp-1", user_id: "account-1", variant: "control" },
          ],
          events: [{ id: "event-1", name: "opened" }],
          pagination: {
            limit: 1000,
            has_more: true,
            next_cursor: "cursor-2",
            snapshot_at: "2026-10-31T18:00:00Z",
          },
        },
      },
      {
        json: {
          user_id: "account-1",
          resolved_user_ids: ["account-1", "device-1"],
          profiles: [{ user_id: "device-1", identified_user_id: "account-1" }],
          experiment_variant_assignments: [],
          events: [{ id: "event-2", name: "purchased" }],
          pagination: {
            limit: 1000,
            has_more: false,
            next_cursor: null,
            snapshot_at: "2026-10-31T18:00:00Z",
          },
        },
      },
    );
    const outputFile = path.join(testDirectory, "export.json");

    await run(
      makeTestable(buildProgram()),
      "users",
      "export",
      "account-1",
      "--project",
      "project-1",
      "--out",
      outputFile,
    );

    const exported = JSON.parse(await readFile(outputFile, "utf8"));
    expect(exported.user_id).toBe("account-1");
    expect(exported.resolved_user_ids).toEqual(["account-1", "device-1"]);
    expect(exported.profiles).toHaveLength(1);
    expect(exported.experiment_variant_assignments).toHaveLength(1);
    expect(exported.events).toEqual([
      { id: "event-1", name: "opened" },
      { id: "event-2", name: "purchased" },
    ]);
    expect(exported.pagination).toEqual({
      limit: 1000,
      has_more: false,
      next_cursor: null,
      snapshot_at: "2026-10-31T18:00:00Z",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstUrl = new URL(fetchMock.mock.calls[0][0] as string);
    const secondUrl = new URL(fetchMock.mock.calls[1][0] as string);
    expect(firstUrl.pathname).toBe("/api/v2/projects/project-1/users/export");
    expect(firstUrl.searchParams.get("user_id")).toBe("account-1");
    expect(firstUrl.searchParams.get("limit")).toBe("1000");
    expect(secondUrl.searchParams.get("cursor")).toBe("cursor-2");
  });

  it("writes JSON to stdout when --out is omitted", async () => {
    mockFetch({
      json: {
        user_id: "account-1",
        resolved_user_ids: ["account-1"],
        profiles: [],
        experiment_variant_assignments: [],
        events: [],
        pagination: {
          limit: 1000,
          has_more: false,
          next_cursor: null,
          snapshot_at: "2026-10-31T18:00:00Z",
        },
      },
    });

    await run(
      makeTestable(buildProgram()),
      "users",
      "export",
      "account-1",
      "--project",
      "project-1",
    );

    expect(JSON.parse(stdout).user_id).toBe("account-1");
  });

  it("preserves an existing output file when a later page fails", async () => {
    mockFetch(
      {
        json: {
          user_id: "account-1",
          resolved_user_ids: ["account-1"],
          profiles: [],
          experiment_variant_assignments: [],
          events: [{ id: "event-1" }],
          pagination: {
            limit: 1000,
            has_more: true,
            next_cursor: "cursor-2",
            snapshot_at: "2026-10-31T18:00:00Z",
          },
        },
      },
      { status: 500, json: { error: "internal_error", message: "Failed" } },
    );
    const outputFile = path.join(testDirectory, "export.json");
    await writeFile(outputFile, "existing export\n");

    await expect(run(
      makeTestable(buildProgram()),
      "users",
      "export",
      "account-1",
      "--project",
      "project-1",
      "--out",
      outputFile,
    )).rejects.toThrow("Failed");

    expect(await readFile(outputFile, "utf8")).toBe("existing export\n");
  });

  it.each([
    [401, { error: "unauthorized", message: "Invalid token" }, "owner or admin login"],
    [403, { error: "forbidden", message: "Forbidden" }, "owner or admin access"],
    [404, { error: "not_found", message: "Missing" }, "Project project-1 was not found"],
    [
      422,
      { error: "too_many_aliases", message: "User identity has more than 1000 linked ids" },
      "more than 1,000 linked IDs",
    ],
  ])("reports a clear %i error", async (status, body, message) => {
    mockFetch({ status, json: body });
    const outputFile = path.join(testDirectory, "export.json");

    const error = await run(
      makeTestable(buildProgram()),
      "users",
      "export",
      "account-1",
      "--project",
      "project-1",
      "--out",
      outputFile,
    ).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(status);
    expect((error as ApiError).message).toContain(message);
  });
});

describe("users erase", () => {
  it("shows the project and user in the confirmation prompt before erasing", async () => {
    setTTY(true);
    readlineMock.question.mockResolvedValue("yes");
    const fetchMock = mockFetch({ json: eraseResponse() });

    await run(
      makeTestable(buildProgram()),
      "users",
      "erase",
      "account-1",
      "--project",
      "project-1",
    );

    expect(readlineMock.question).toHaveBeenCalledWith(
      'Erase all data for user "account-1" from project "project-1". Continue? [y/N] ',
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({
      user_id: "account-1",
    });
    expect(logs.join("\n")).toContain("Events: 12");
    expect(logs.join("\n")).toContain("ClickHouse cleanup job: enqueued");
  });

  it("--yes erases without prompting and supports JSON output", async () => {
    mockFetch({ json: eraseResponse() });

    await run(
      makeTestable(buildProgram()),
      "users",
      "erase",
      "account-1",
      "--project",
      "project-1",
      "--yes",
      "--json",
    );

    expect(readlineMock.question).not.toHaveBeenCalled();
    expect(JSON.parse(logs.join("\n"))).toEqual(eraseResponse());
  });

  it("refuses non-interactive erasure without --yes", async () => {
    const fetchMock = mockFetch({ json: eraseResponse() });

    const error = await run(
      makeTestable(buildProgram()),
      "users",
      "erase",
      "account-1",
      "--project",
      "project-1",
    ).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(CliUsageError);
    expect((error as Error).message).toContain("requires --yes");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not erase when interactive confirmation is declined", async () => {
    setTTY(true);
    readlineMock.question.mockResolvedValue("no");
    const fetchMock = mockFetch({ json: eraseResponse() });

    await expect(run(
      makeTestable(buildProgram()),
      "users",
      "erase",
      "account-1",
      "--project",
      "project-1",
    )).rejects.toThrow("Cancelled");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

it.each(["export", "erase"])("rejects a blank user ID before an HTTP request", async (command) => {
  const fetchMock = mockFetch({ json: {} });

  await expect(run(
    makeTestable(buildProgram()),
    "users",
    command,
    "   ",
    "--project",
    "project-1",
    "--yes",
  )).rejects.toThrow("User ID must not be blank");
  expect(fetchMock).not.toHaveBeenCalled();
});

function mockFetch(...responses: MockResponse[]) {
  let index = 0;
  const fetchMock = vi.fn().mockImplementation(async () => {
    const response = responses[index++] ?? responses.at(-1);
    if (!response) throw new Error("No mock response configured");
    const status = response.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: vi.fn().mockResolvedValue(response.json),
    };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function eraseResponse() {
  return {
    status: "accepted",
    deletion: {
      events: 12,
      user_daily_events: 3,
      profiles: 1,
      experiment_variant_assignments: 1,
      aliases: 2,
      clickhouse_job_enqueued: true,
    },
  };
}

function setTTY(value: boolean): void {
  Object.defineProperty(process.stdin, "isTTY", {
    configurable: true,
    value,
  });
}
