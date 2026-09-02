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
});
