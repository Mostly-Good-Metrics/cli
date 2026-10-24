import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as client from "../src/client.js";
import * as auth from "../src/auth.js";

vi.mock("../src/auth.js");

const BASE = "https://api.mostlygoodmetrics.com/api/v2";

function mockFetch(response: {
  status?: number;
  ok?: boolean;
  json?: unknown;
  jsonThrows?: boolean;
}) {
  const status = response.status ?? 200;
  const fetchMock = vi.fn().mockResolvedValue({
    ok: response.ok ?? (status >= 200 && status < 300),
    status,
    json: response.jsonThrows
      ? vi.fn().mockRejectedValue(new Error("invalid json"))
      : vi.fn().mockResolvedValue(response.json ?? {}),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function lastRequest(fetchMock: ReturnType<typeof vi.fn>) {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return { url, init, headers: init.headers as Record<string, string> };
}

beforeEach(() => {
  vi.mocked(auth.getToken).mockReturnValue("stored-token");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("API client", () => {
  it("sends GET requests with the stored bearer token", async () => {
    const fetchMock = mockFetch({ json: { projects: [] } });
    const data = await client.listProjects();

    const { url, init, headers } = lastRequest(fetchMock);
    expect(url).toBe(`${BASE}/projects`);
    expect(init.method).toBe("GET");
    expect(headers.Authorization).toBe("Bearer stored-token");
    expect(headers.Accept).toBe("application/json");
    expect(data).toEqual({ projects: [] });
  });

  it("omits the Authorization header when no token is stored", async () => {
    vi.mocked(auth.getToken).mockReturnValue(undefined);
    const fetchMock = mockFetch({ json: { status: "ok" } });
    await client.sendMagicLink("me@example.com");

    const { headers } = lastRequest(fetchMock);
    expect(headers.Authorization).toBeUndefined();
  });

  it("serializes query params", async () => {
    const fetchMock = mockFetch({ json: { events: [] } });
    await client.listEvents("p_1", { limit: "10", date_range: "7d" });

    const { url } = lastRequest(fetchMock);
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/api/v2/projects/p_1/events");
    expect(parsed.searchParams.get("limit")).toBe("10");
    expect(parsed.searchParams.get("date_range")).toBe("7d");
  });

  it("sends JSON bodies with Content-Type on POST", async () => {
    const fetchMock = mockFetch({ json: { api_key: { id: "k_1", name: "Dev", key: "sk" } } });
    await client.createApiKey("p_1", "Dev", {
      environment: "production",
      allowedIdentifiers: ["com.example.app"],
    });

    const { url, init, headers } = lastRequest(fetchMock);
    expect(url).toBe(`${BASE}/projects/p_1/api-keys`);
    expect(init.method).toBe("POST");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({
      name: "Dev",
      environment: "production",
      allowed_identifiers: ["com.example.app"],
    });
  });

  it("omits an empty identifier allowlist when creating a key", async () => {
    const fetchMock = mockFetch({ json: { api_key: { id: "k_1", name: "Dev", key: "sk" } } });
    await client.createApiKey("p_1", "Dev", {
      environment: "production",
      allowedIdentifiers: [],
    });

    const { init } = lastRequest(fetchMock);
    expect(JSON.parse(init.body as string)).toEqual({
      name: "Dev",
      environment: "production",
    });
  });

  it("sends PATCH bodies for updates", async () => {
    const fetchMock = mockFetch({ json: { project: { id: "p_1" } } });
    await client.updateProject("p_1", { name: "Renamed" });

    const { url, init } = lastRequest(fetchMock);
    expect(url).toBe(`${BASE}/projects/p_1`);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ name: "Renamed" });
  });

  it("sends DELETE for revocations", async () => {
    const fetchMock = mockFetch({ json: { status: "ok" } });
    await client.revokeApiKey("p_1", "k_9");

    const { url, init } = lastRequest(fetchMock);
    expect(url).toBe(`${BASE}/projects/p_1/api-keys/k_9`);
    expect(init.method).toBe("DELETE");
  });

  it("hits the widgets endpoints", async () => {
    const fetchMock = mockFetch({ json: { widgets: [] } });
    await client.listWidgets("p_1");
    expect(lastRequest(fetchMock).url).toBe(`${BASE}/projects/p_1/widgets`);
  });

  it("hits goal list, snapshot, show, and create endpoints with goal keys", async () => {
    const fetchMock = mockFetch({ json: { goals: [] } });

    await client.listGoals("p_1");
    expect(lastRequest(fetchMock).url).toBe(`${BASE}/projects/p_1/goals`);

    fetchMock.mockClear();
    await client.listGoalSnapshots("p_1");
    expect(lastRequest(fetchMock).url).toBe(`${BASE}/projects/p_1/goals?snapshots=true`);

    fetchMock.mockClear();
    await client.getGoal("p_1", "g_1");
    expect(lastRequest(fetchMock).url).toBe(`${BASE}/projects/p_1/goals/g_1`);

    fetchMock.mockClear();
    await client.getGoalSnapshot("p_1", "g_1");
    expect(lastRequest(fetchMock).url).toBe(`${BASE}/projects/p_1/goals/g_1/snapshot`);

    fetchMock.mockClear();
    await client.createGoal("p_1", { goal: { value: 100 } });
    const { url, init } = lastRequest(fetchMock);
    expect(url).toBe(`${BASE}/projects/p_1/goals`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ goal: { value: 100 } });
  });

  it("throws ApiError with server-provided code and message", async () => {
    mockFetch({
      status: 401,
      json: { error: "unauthorized", message: "Invalid token" },
    });

    const err = await client.getMe().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(client.ApiError);
    const apiErr = err as client.ApiError;
    expect(apiErr.status).toBe(401);
    expect(apiErr.code).toBe("unauthorized");
    expect(apiErr.message).toBe("Invalid token");
  });

  it("falls back to HTTP status when the error body is not JSON", async () => {
    mockFetch({ status: 500, jsonThrows: true });

    const err = await client.listProjects().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(client.ApiError);
    const apiErr = err as client.ApiError;
    expect(apiErr.status).toBe(500);
    expect(apiErr.code).toBe("unknown");
    expect(apiErr.message).toBe("HTTP 500");
  });

  it("returns an empty object for 204 responses", async () => {
    mockFetch({ status: 204, ok: true, jsonThrows: true });
    const data = await client.deleteProject("p_1");
    expect(data).toEqual({});
  });

  it("sends a test event with a temporary key for the selected project and revokes it", async () => {
    const event = {
      name: "cli_test_event",
      timestamp: "2026-10-24T12:00:00.000Z",
      client_event_id: "7d74f02f-293f-444f-9c6f-31b3e4b3e59e",
      platform: "cli",
      environment: "development",
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: vi.fn().mockResolvedValue({
          api_key: {
            id: "key_temp",
            name: "CLI test event",
            key: "mgm_proj_temporary",
            environment: "development",
            allowed_identifiers: ["localhost"],
          },
        }),
      })
      .mockResolvedValueOnce({ ok: true, status: 204 })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ revoked: true }),
      });
    vi.stubGlobal("fetch", fetchMock);

    await client.sendTestEvent("p_selected", event);

    const [createUrl, createInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(createUrl).toBe(`${BASE}/projects/p_selected/api-keys`);
    expect(createInit.headers).toMatchObject({ Authorization: "Bearer stored-token" });
    expect(JSON.parse(createInit.body as string)).toEqual({
      name: "CLI test event",
      environment: "development",
      allowed_identifiers: ["localhost"],
    });

    const [ingestUrl, ingestInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(ingestUrl).toBe("https://ingest.mostlygoodmetrics.com/v1/events");
    expect(ingestInit.method).toBe("POST");
    expect(ingestInit.headers).toMatchObject({
      Authorization: "Bearer mgm_proj_temporary",
      "Content-Type": "application/json",
      "X-MGM-SDK": "cli",
      "X-MGM-Platform": "cli",
    });
    expect(JSON.parse(ingestInit.body as string)).toEqual({ events: [event] });

    const [revokeUrl, revokeInit] = fetchMock.mock.calls[2] as [string, RequestInit];
    expect(revokeUrl).toBe(`${BASE}/projects/p_selected/api-keys/key_temp`);
    expect(revokeInit.method).toBe("DELETE");
  });

  it.each([
    [401, "ingestion_unauthorized", "rejected the temporary project API key"],
    [403, "ingestion_forbidden", "denied this test event"],
    [422, "invalid_event", "rejected the event payload"],
  ] as const)("reports a clear %i ingestion error and still revokes the temporary key", async (
    status,
    code,
    message,
  ) => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: vi.fn().mockResolvedValue({
          api_key: {
            id: "key_temp",
            key: "mgm_proj_temporary",
            environment: "development",
            allowed_identifiers: ["localhost"],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status,
        text: vi.fn().mockResolvedValue(JSON.stringify({ error: "backend detail" })),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ revoked: true }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const error = await client.sendTestEvent("p_selected", { name: "test" })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(client.ApiError);
    expect(error).toMatchObject({ status, code });
    expect((error as Error).message).toContain(message);
    expect((error as Error).message).toContain("backend detail");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
