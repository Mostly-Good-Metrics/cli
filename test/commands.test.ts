import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import { buildProgram } from "../src/program.js";
import * as client from "../src/client.js";
import * as auth from "../src/auth.js";
import { makeTestable, run } from "./helpers.js";

vi.mock("../src/client.js");
vi.mock("../src/auth.js");

class NotLoggedInError extends Error {
  constructor() {
    super("Not logged in. Run `mgm login` first.");
  }
}

let program: Command;
let logs: string[];

function output(): string {
  return logs.join("\n");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth.requireToken).mockReturnValue("test-token");
  vi.mocked(auth.getToken).mockReturnValue("test-token");
  logs = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  program = makeTestable(buildProgram());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("auth-required commands fail without a token", () => {
  const cases: [string[], () => unknown][] = [
    [["whoami"], () => client.getMe],
    [["projects", "list"], () => client.listProjects],
    [["orgs", "list"], () => client.listOrganizations],
    [["keys", "list", "--project", "p_1"], () => client.listApiKeys],
    [["dashboard", "--project", "p_1"], () => client.getDashboard],
    [["events", "list", "--project", "p_1"], () => client.listEvents],
    [["funnels", "list", "--project", "p_1"], () => client.listFunnels],
    [["queries", "list", "--project", "p_1"], () => client.listInsights],
    [["widgets", "list", "--project", "p_1"], () => client.listWidgets],
  ];

  it.each(cases.map(([args, fn]) => [args.join(" "), args, fn] as const))(
    "mgm %s requires login",
    async (_label, args, clientFn) => {
      vi.mocked(auth.requireToken).mockImplementation(() => {
        throw new NotLoggedInError();
      });

      await expect(run(program, ...args)).rejects.toThrow(NotLoggedInError);
      expect(clientFn()).not.toHaveBeenCalled();
    },
  );
});

describe("whoami", () => {
  it("prints the current user and organizations", async () => {
    vi.mocked(client.getMe).mockResolvedValue({
      user: { id: "u_1", email: "josh@example.com", confirmed_at: null, is_admin: false },
      organizations: [{ id: "o_1", name: "Acme", slug: "acme", plan: "pro", role: "owner" }],
    });

    await run(program, "whoami");

    expect(output()).toContain("josh@example.com");
    expect(output()).toContain("acme");
  });
});

describe("projects", () => {
  it("list prints a table of projects", async () => {
    vi.mocked(client.listProjects).mockResolvedValue({
      projects: [{ id: "p_1", name: "My App", timezone: "America/Chicago" }],
    });

    await run(program, "projects", "list");

    expect(client.listProjects).toHaveBeenCalledOnce();
    expect(output()).toContain("My App");
    expect(output()).toContain("America/Chicago");
  });

  it("list --json prints raw JSON", async () => {
    const projects = [{ id: "p_1", name: "My App", timezone: "UTC" }];
    vi.mocked(client.listProjects).mockResolvedValue({ projects });

    await run(program, "projects", "list", "--json");

    expect(JSON.parse(output())).toEqual(projects);
  });

  it("create uses the provided --org slug without fetching orgs", async () => {
    vi.mocked(client.createProject).mockResolvedValue({
      project: { id: "p_2", name: "New App", timezone: "UTC" },
    });

    await run(program, "projects", "create", "New App", "--org", "acme", "--timezone", "UTC");

    expect(client.createProject).toHaveBeenCalledWith("acme", "New App", "UTC");
    expect(client.getMe).not.toHaveBeenCalled();
    expect(output()).toContain("p_2");
  });

  it("create falls back to the first organization", async () => {
    vi.mocked(client.getMe).mockResolvedValue({
      user: { id: "u_1", email: "a@b.com", confirmed_at: null, is_admin: false },
      organizations: [{ id: "o_1", name: "Acme", slug: "acme" }],
    });
    vi.mocked(client.createProject).mockResolvedValue({
      project: { id: "p_3", name: "Another", timezone: "UTC" },
    });

    await run(program, "projects", "create", "Another");

    expect(client.createProject).toHaveBeenCalledWith("acme", "Another", undefined);
  });

  it("show fetches the project by id", async () => {
    vi.mocked(client.getProject).mockResolvedValue({
      project: { id: "p_1", name: "My App", timezone: "UTC", organization_id: "o_1" },
    });

    await run(program, "projects", "show", "p_1");

    expect(client.getProject).toHaveBeenCalledWith("p_1");
    expect(output()).toContain("My App");
  });
});

describe("orgs", () => {
  it("list prints organizations", async () => {
    vi.mocked(client.listOrganizations).mockResolvedValue({
      organizations: [{ id: "o_1", name: "Acme", slug: "acme", plan: "free", role: "owner" }],
    });

    await run(program, "orgs", "list");

    expect(output()).toContain("Acme");
    expect(output()).toContain("free");
  });

  it("show prints org details and projects", async () => {
    vi.mocked(client.getOrganization).mockResolvedValue({
      organization: { id: "o_1", name: "Acme", slug: "acme", plan: "pro", events_per_month_limit: 1000000 },
      projects: [{ id: "p_1", name: "My App", timezone: "UTC" }],
    });

    await run(program, "orgs", "show", "acme");

    expect(client.getOrganization).toHaveBeenCalledWith("acme");
    expect(output()).toContain("Acme");
    expect(output()).toContain("My App");
  });

  it("create creates an organization", async () => {
    vi.mocked(client.createOrganization).mockResolvedValue({
      organization: { id: "o_2", name: "New Org", slug: "new-org" },
    });

    await run(program, "orgs", "create", "New Org");

    expect(client.createOrganization).toHaveBeenCalledWith("New Org");
    expect(output()).toContain("new-org");
  });

  it("invite sends an invitation with an explicit org and role", async () => {
    vi.mocked(client.inviteMember).mockResolvedValue({ invitation: {} });

    await run(program, "orgs", "invite", "new@example.com", "--org", "acme", "--role", "admin");

    expect(client.inviteMember).toHaveBeenCalledWith("acme", "new@example.com", "admin");
    expect(client.getMe).not.toHaveBeenCalled();
  });

  it("invite defaults to the first org and member role", async () => {
    vi.mocked(client.getMe).mockResolvedValue({
      user: { id: "u_1", email: "a@b.com", confirmed_at: null, is_admin: false },
      organizations: [{ id: "o_1", name: "Acme", slug: "acme" }],
    });
    vi.mocked(client.inviteMember).mockResolvedValue({ invitation: {} });

    await run(program, "orgs", "invite", "new@example.com");

    expect(client.inviteMember).toHaveBeenCalledWith("acme", "new@example.com", "member");
  });
});

describe("keys", () => {
  it("list passes the project id", async () => {
    vi.mocked(client.listApiKeys).mockResolvedValue({
      api_keys: [{ id: "k_1", name: "Dev", key_prefix: "mgm_ab", created_at: "2026-01-01" }],
    });

    await run(program, "keys", "list", "--project", "p_1");

    expect(client.listApiKeys).toHaveBeenCalledWith("p_1");
    expect(output()).toContain("mgm_ab");
  });

  it("create prints the one-time secret key", async () => {
    vi.mocked(client.createApiKey).mockResolvedValue({
      api_key: { id: "k_1", name: "Dev", key: "mgm_secret_123" },
    });

    await run(program, "keys", "create", "Dev", "--project", "p_1");

    expect(client.createApiKey).toHaveBeenCalledWith("p_1", "Dev");
    expect(output()).toContain("mgm_secret_123");
    expect(output()).toContain("won't be shown again");
  });

  it("revoke deletes the key", async () => {
    vi.mocked(client.revokeApiKey).mockResolvedValue({ status: "ok" });

    await run(program, "keys", "revoke", "k_9", "--project", "p_1", "--yes");

    expect(client.revokeApiKey).toHaveBeenCalledWith("p_1", "k_9");
    expect(output()).toContain("revoked");
  });
});

describe("dashboard", () => {
  it("builds filter params from flags", async () => {
    vi.mocked(client.getDashboard).mockResolvedValue({
      stats: { total_events: 1234, unique_users: 56, events_trend: 0.12, users_trend: -0.05 },
      events_by_day: [{ date: "2026-07-01", count: 100 }],
      top_events: [{ name: "app_open", count: 900 }],
    });

    await run(program, "dashboard", "--project", "p_1", "--range", "30d", "--platform", "ios");

    expect(client.getDashboard).toHaveBeenCalledWith("p_1", {
      date_range: "30d",
      platform: "ios",
    });
    expect(output()).toContain("1,234");
    expect(output()).toContain("app_open");
  });

  it("filters retrieves the available dashboard filter values", async () => {
    vi.mocked(client.getDashboardFilters).mockResolvedValue({
      event_names: ["app_open"],
      platforms: ["ios"],
      environments: ["production"],
    });

    await run(program, "dashboard", "filters", "--project", "p_1", "--json");

    expect(client.getDashboardFilters).toHaveBeenCalledWith("p_1");
    expect(JSON.parse(output())).toEqual({
      event_names: ["app_open"],
      platforms: ["ios"],
      environments: ["production"],
    });
  });
});

describe("events", () => {
  it("list passes limit and range params", async () => {
    vi.mocked(client.listEvents).mockResolvedValue({
      events: [{ id: "e_1", name: "app_open", user_id: "u_1", timestamp: "2026-07-01T00:00:00Z" }],
    });

    await run(program, "events", "list", "--project", "p_1", "--limit", "10", "--range", "7d");

    expect(client.listEvents).toHaveBeenCalledWith("p_1", { limit: "10", date_range: "7d" });
    expect(output()).toContain("app_open");
  });

  it("types prints event counts", async () => {
    vi.mocked(client.listEventTypes).mockResolvedValue({
      event_types: [{ name: "purchase", count: 4321 }],
    });

    await run(program, "events", "types", "--project", "p_1");

    expect(output()).toContain("purchase");
    expect(output()).toContain("4,321");
  });
});

describe("funnels", () => {
  it("create parses steps and converts the window to minutes", async () => {
    vi.mocked(client.createFunnel).mockResolvedValue({
      funnel: { id: "f_1", name: "Checkout", steps: [] },
    });

    await run(
      program,
      "funnels", "create",
      "--name", "Checkout",
      "--steps", "view, add_to_cart ,purchase",
      "--window", "7d",
      "--range", "30d",
      "--project", "p_1",
    );

    expect(client.createFunnel).toHaveBeenCalledWith("p_1", {
      name: "Checkout",
      steps: [
        { event_name: "view", name: "view" },
        { event_name: "add_to_cart", name: "add_to_cart" },
        { event_name: "purchase", name: "purchase" },
      ],
      conversion_window_minutes: 7 * 24 * 60,
      date_range: "30d",
    });
  });

  it("create without required --name is a parse error", async () => {
    await expect(
      run(program, "funnels", "create", "--steps", "a,b", "--project", "p_1"),
    ).rejects.toThrow();
    expect(client.createFunnel).not.toHaveBeenCalled();
  });

  it("execute runs a saved funnel and prints conversions", async () => {
    vi.mocked(client.executeFunnel).mockResolvedValue({
      funnel: { id: "f_1", name: "Checkout", steps: [] },
      results: {
        steps: [
          { name: "view", count: 100, conversion_rate: 1 },
          { name: "purchase", count: 25, conversion_rate: 0.25 },
        ],
        overall_conversion: 0.25,
      },
    });

    await run(program, "funnels", "execute", "f_1", "--project", "p_1");

    expect(client.executeFunnel).toHaveBeenCalledWith("p_1", "f_1");
    expect(output()).toContain("25.0%");
  });

  it("execute with --steps runs an ad-hoc funnel", async () => {
    vi.mocked(client.executeAdHocFunnel).mockResolvedValue({ results: {} });

    await run(program, "funnels", "execute", "--steps", "a,b", "--range", "14d", "--project", "p_1");

    expect(client.executeAdHocFunnel).toHaveBeenCalledWith("p_1", {
      steps: [
        { event_name: "a", name: "a" },
        { event_name: "b", name: "b" },
      ],
      date_range: "14d",
    });
    expect(client.executeFunnel).not.toHaveBeenCalled();
  });

  it("show retrieves a saved funnel", async () => {
    const funnel = { id: "f_1", name: "Checkout", steps: [{ event_name: "purchase" }] };
    vi.mocked(client.getFunnel).mockResolvedValue({ funnel });

    await run(program, "funnels", "show", "f_1", "--project", "p_1", "--json");

    expect(client.getFunnel).toHaveBeenCalledWith("p_1", "f_1");
    expect(JSON.parse(output())).toEqual(funnel);
  });

  it("update sends only the supplied funnel fields", async () => {
    vi.mocked(client.updateFunnel).mockResolvedValue({
      funnel: { id: "f_1", name: "Checkout v2", steps: [] },
    });

    await run(program, "funnels", "update", "f_1", "--name", "Checkout v2", "--window", "14d", "--project", "p_1");

    expect(client.updateFunnel).toHaveBeenCalledWith("p_1", "f_1", {
      name: "Checkout v2",
      conversion_window_minutes: 14 * 24 * 60,
    });
  });
});

describe("queries", () => {
  it("execute with --metric runs an ad-hoc query", async () => {
    vi.mocked(client.executeAdHocQuery).mockResolvedValue({ results: {} });

    await run(
      program,
      "queries", "execute",
      "--metric", "unique_users",
      "--group-by", "date",
      "--range", "7d",
      "--project", "p_1",
    );

    expect(client.executeAdHocQuery).toHaveBeenCalledWith("p_1", {
      metric: "unique_users",
      group_by: "date",
      date_range: "7d",
    });
  });

  it("delete removes a saved query", async () => {
    vi.mocked(client.deleteInsight).mockResolvedValue({ status: "ok" });

    await run(program, "queries", "delete", "q_1", "--project", "p_1", "--yes");

    expect(client.deleteInsight).toHaveBeenCalledWith("p_1", "q_1");
  });

  it("update builds a partial query definition", async () => {
    vi.mocked(client.updateInsight).mockResolvedValue({
      insight: { id: "q_1", name: "Daily users" },
    });

    await run(program, "queries", "update", "q_1", "--metric", "unique_users", "--range", "30d", "--project", "p_1");

    expect(client.updateInsight).toHaveBeenCalledWith("p_1", "q_1", {
      query_definition: { metric: "unique_users", date_range: "30d" },
    });
  });
});

describe("retention", () => {
  it("update sends only the supplied retention fields", async () => {
    vi.mocked(client.updateRetention).mockResolvedValue({
      retention: {
        id: "r_1", name: "Weekly", cohort_event: "signup", cohort_grain: "week", retention_days: [1, 7],
      },
    });

    await run(program, "retention", "update", "r_1", "--days", "1,7", "--grain", "day", "--project", "p_1");

    expect(client.updateRetention).toHaveBeenCalledWith("p_1", "r_1", {
      cohort_grain: "day",
      retention_days: [1, 7],
    });
  });
});

describe("experiments", () => {
  it("show forwards result-analysis options", async () => {
    vi.mocked(client.getExperiment).mockResolvedValue({
      experiment: { id: "e_1", name: "Pricing", variants: ["control", "test"], goal_event: "purchase" },
      results: { total_enrollments: 20 },
    });

    await run(program, "experiments", "show", "e_1", "--window-days", "14", "--goal", "upgrade", "--project", "p_1");

    expect(client.getExperiment).toHaveBeenCalledWith("p_1", "e_1", {
      observation_window_days: "14",
      goal_event: "upgrade",
    });
  });

  it("update and delete cover the experiment lifecycle", async () => {
    vi.mocked(client.updateExperiment).mockResolvedValue({
      experiment: { id: "e_1", name: "Pricing", variants: ["control", "test"], goal_event: "purchase" },
    });
    vi.mocked(client.deleteExperiment).mockResolvedValue({ status: "ok" });

    await run(program, "experiments", "update", "e_1", "--description", "New copy", "--conversion-window-days", "7", "--project", "p_1");
    await run(program, "experiments", "delete", "e_1", "--project", "p_1", "--yes");

    expect(client.updateExperiment).toHaveBeenCalledWith("p_1", "e_1", {
      description: "New copy",
      conversion_window_days: 7,
    });
    expect(client.deleteExperiment).toHaveBeenCalledWith("p_1", "e_1");
  });
});

describe("widgets", () => {
  it("list prints widgets", async () => {
    vi.mocked(client.listWidgets).mockResolvedValue({
      widgets: [{ id: "w_1", widget_type: "top_events", position: 1, size: "large" }],
    });

    await run(program, "widgets", "list", "--project", "p_1");

    expect(client.listWidgets).toHaveBeenCalledWith("p_1");
    expect(output()).toContain("top_events");
    expect(output()).toContain("large");
  });

  it("add creates a widget with size and position", async () => {
    vi.mocked(client.createWidget).mockResolvedValue({
      widget: { id: "w_2", widget_type: "stats" },
    });

    await run(
      program,
      "widgets", "add", "stats",
      "--size", "small",
      "--position", "2",
      "--project", "p_1",
    );

    expect(client.createWidget).toHaveBeenCalledWith("p_1", {
      widget_type: "stats",
      size: "small",
      position: 2,
    });
    expect(output()).toContain("w_2");
  });

  it("remove deletes the widget", async () => {
    vi.mocked(client.deleteWidget).mockResolvedValue({ status: "ok" });

    await run(program, "widgets", "remove", "w_1", "--project", "p_1", "--yes");

    expect(client.deleteWidget).toHaveBeenCalledWith("p_1", "w_1");
    expect(output()).toContain("removed");
  });

  it("reset restores default widgets", async () => {
    vi.mocked(client.resetWidgets).mockResolvedValue({
      widgets: [
        { id: "w_1", widget_type: "stats" },
        { id: "w_2", widget_type: "top_events" },
      ],
    });

    await run(program, "widgets", "reset", "--project", "p_1", "--yes");

    expect(client.resetWidgets).toHaveBeenCalledWith("p_1");
    expect(output()).toContain("2");
  });
});

describe("parsing", () => {
  it("exposes the full command tree as JSON", async () => {
    await run(program, "commands", "--json");

    const commands = JSON.parse(output()) as { path: string; options: { flags: string }[] }[];
    expect(commands.some((command) => command.path === "experiments update")).toBe(true);
    expect(commands.some((command) => command.path === "dashboard filters")).toBe(true);
  });

  it("returns a structured schema for a command path", async () => {
    await run(program, "schema", "experiments", "update", "--json");

    const schema = JSON.parse(output()) as { path: string; options: { flags: string }[] };
    expect(schema.path).toBe("experiments update");
    expect(schema.options.some((option) => option.flags.includes("--conversion-window-days"))).toBe(true);
  });

  it("requires --yes for destructive commands in non-interactive mode", async () => {
    await expect(run(program, "queries", "delete", "q_1", "--project", "p_1", "--no-input"))
      .rejects.toThrow("requires --yes");
    expect(client.deleteInsight).not.toHaveBeenCalled();
  });

  it("rejects browser login in no-input mode without a token", async () => {
    await expect(run(program, "login", "--no-input"))
      .rejects.toThrow("requires --token");
  });

  it("rejects unknown commands", async () => {
    const err = await run(program, "definitely-not-a-command").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as { code?: string }).code).toBe("commander.unknownCommand");
  });

  it("reports the CLI version", async () => {
    const err = await run(program, "--version").catch((e: unknown) => e);
    expect((err as { code?: string }).code).toBe("commander.version");
  });
});
