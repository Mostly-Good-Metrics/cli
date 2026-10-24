import { getToken } from "./auth.js";

const BASE_URL = process.env.MGM_API_URL ?? "https://api.mostlygoodmetrics.com/api/v2";
const INGEST_EVENTS_URL = process.env.MGM_INGEST_URL
  ?? "https://ingest.mostlygoodmetrics.com/v1/events";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  method: string,
  path: string,
  options: { body?: unknown; token?: string; params?: Record<string, string> } = {},
): Promise<T> {
  const token = options.token ?? getToken();
  const url = new URL(`${BASE_URL}${path}`);
  if (options.params) {
    for (const [k, v] of Object.entries(options.params)) {
      if (v !== undefined) url.searchParams.set(k, v);
    }
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (options.body) headers["Content-Type"] = "application/json";

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    let code = "unknown";
    let message = `HTTP ${res.status}`;
    try {
      const err = (await res.json()) as { error?: string; message?: string };
      code = err.error ?? code;
      message = err.message ?? message;
    } catch {}
    throw new ApiError(res.status, code, message);
  }

  if (res.status === 204) return {} as T;
  return (await res.json()) as T;
}

// Auth
export const sendMagicLink = (email: string) =>
  request<{ status: string; message: string }>("POST", "/auth/magic-link", {
    body: { email },
  });

export const verifyMagicLink = (token: string) =>
  request<{ token: string; user: User; organizations: Org[] }>("GET", `/auth/magic-link/${token}`);

export const completeRegistration = (token: string) =>
  request<{ token: string; user: User; organizations: Org[] }>("GET", `/auth/register/${token}`);

export const getMe = () => request<{ user: User; organizations: Org[] }>("GET", "/auth/me");

export const logout = () => request<{ status: string }>("DELETE", "/auth/session");

// Organizations
export const listOrganizations = () =>
  request<{ organizations: Org[] }>("GET", "/organizations");

export const getOrganization = (slug: string) =>
  request<{ organization: Org; projects: Project[] }>("GET", `/organizations/${slug}`);

export const createOrganization = (name: string) =>
  request<{ organization: Org }>("POST", "/organizations", { body: { name } });

export const inviteMember = (orgSlug: string, email: string, role: string = "member") =>
  request<{ invitation: unknown }>("POST", `/organizations/${orgSlug}/invitations`, {
    body: { email, role },
  });

// Projects
export const listProjects = () =>
  request<{ projects: Project[] }>("GET", "/projects");

export const getProject = (id: string) =>
  request<{ project: Project }>("GET", `/projects/${id}`);

export const createProject = (orgSlug: string, name: string, timezone?: string) =>
  request<{ project: Project }>("POST", `/organizations/${orgSlug}/projects`, {
    body: { name, ...(timezone ? { timezone } : {}) },
  });

export const updateProject = (id: string, attrs: Record<string, unknown>) =>
  request<{ project: Project }>("PATCH", `/projects/${id}`, { body: attrs });

export const deleteProject = (id: string) =>
  request<{ status: string }>("DELETE", `/projects/${id}`);

// API Keys
export const listApiKeys = (projectId: string) =>
  request<{ api_keys: ApiKey[] }>("GET", `/projects/${projectId}/api-keys`);

export const createApiKey = (
  projectId: string,
  name: string,
  options: { environment?: string; allowedIdentifiers?: string[] } = {},
) =>
  request<{ api_key: ApiKey & { key: string } }>("POST", `/projects/${projectId}/api-keys`, {
    body: {
      name,
      ...(options.environment ? { environment: options.environment } : {}),
      ...(options.allowedIdentifiers?.length
        ? { allowed_identifiers: options.allowedIdentifiers }
        : {}),
    },
  });

export const revokeApiKey = (projectId: string, keyId: string) =>
  request<{ status: string }>("DELETE", `/projects/${projectId}/api-keys/${keyId}`);

// Dashboard
export const getDashboard = (projectId: string, params?: Record<string, string>) =>
  request<DashboardResponse>("GET", `/projects/${projectId}/dashboard`, { params });

export const getDashboardFilters = (projectId: string) =>
  request<FiltersResponse>("GET", `/projects/${projectId}/dashboard/filters`);

// Events
export const listEvents = (projectId: string, params?: Record<string, string>) =>
  request<{ events: Event[] }>("GET", `/projects/${projectId}/events`, { params });

export const listEventTypes = (projectId: string, params?: Record<string, string>) =>
  request<{ event_types: EventType[] }>("GET", `/projects/${projectId}/events/types`, { params });

export const listEventDefinitions = (projectId: string) =>
  request<{ definitions: EventDefinition[] }>("GET", `/projects/${projectId}/events/definitions`);

export const createEventDefinition = (projectId: string, attrs: Record<string, unknown>) =>
  request<{ definition: EventDefinition }>("POST", `/projects/${projectId}/events/definitions`, { body: attrs });

export async function sendTestEvent(
  projectId: string,
  event: Record<string, unknown>,
): Promise<void> {
  let temporaryKey: (ApiKey & { key: string }) | undefined;
  let sendError: unknown;

  try {
    let data: { api_key: ApiKey & { key: string } };
    try {
      data = await createApiKey(projectId, "CLI test event", {
        environment: "development",
        allowedIdentifiers: ["localhost"],
      });
    } catch (error) {
      throw temporaryKeySetupError(error, projectId);
    }
    temporaryKey = data.api_key;

    if (!temporaryKey.id
      || !temporaryKey.key
      || temporaryKey.environment !== "development"
      || temporaryKey.allowed_identifiers?.length !== 1
      || temporaryKey.allowed_identifiers[0] !== "localhost") {
      throw new ApiError(
        422,
        "temporary_key_invalid",
        "The API did not return the requested restricted development key.",
      );
    }

    const res = await fetch(INGEST_EVENTS_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${temporaryKey.key}`,
        "X-MGM-SDK": "cli",
        "X-MGM-Platform": "cli",
      },
      body: JSON.stringify({ events: [event] }),
    });

    if (!res.ok) {
      const detail = await ingestionErrorDetail(res);
      throw ingestionError(res.status, detail);
    }
  } catch (error) {
    sendError = error;
  }

  if (temporaryKey && typeof temporaryKey.id === "string") {
    try {
      await revokeApiKey(projectId, temporaryKey.id);
    } catch (cleanupError) {
      const cleanupMessage = cleanupError instanceof Error ? cleanupError.message : "unknown error";
      const prefix = sendError instanceof Error ? `${sendError.message} ` : "";
      throw new ApiError(
        500,
        "temporary_key_cleanup_failed",
        `${prefix}The temporary API key could not be revoked (${cleanupMessage}). Revoke key ${temporaryKey.id} with: mgm keys revoke ${temporaryKey.id} --project ${projectId}`,
      );
    }
  }

  if (sendError) throw sendError;
}

function temporaryKeySetupError(error: unknown, projectId: string): unknown {
  if (!(error instanceof ApiError)) return error;

  switch (error.status) {
    case 401:
      return new ApiError(401, "unauthorized", "Authentication expired. Run `mgm login` again.");
    case 403:
      return new ApiError(403, "forbidden", `You do not have permission to send events to project ${projectId}.`);
    case 400:
    case 422:
      return new ApiError(error.status, "temporary_key_rejected", `The API could not create a temporary project key: ${error.message}`);
    default:
      return error;
  }
}

async function ingestionErrorDetail(res: Response): Promise<string | undefined> {
  try {
    const body = await res.text();
    if (!body) return undefined;
    try {
      const parsed = JSON.parse(body) as { error?: unknown; message?: unknown; details?: unknown };
      const detail = parsed.message ?? parsed.details ?? parsed.error;
      return typeof detail === "string" ? detail : JSON.stringify(detail);
    } catch {
      return body;
    }
  } catch {
    return undefined;
  }
}

function ingestionError(status: number, detail?: string): ApiError {
  const suffix = detail ? `: ${detail}` : ".";
  switch (status) {
    case 401:
      return new ApiError(status, "ingestion_unauthorized", `Ingestion rejected the temporary project API key${suffix}`);
    case 403:
      return new ApiError(status, "ingestion_forbidden", `Ingestion denied this test event for the selected project${suffix}`);
    case 400:
    case 422:
      return new ApiError(status, "invalid_event", `Ingestion rejected the event payload${suffix}`);
    default:
      return new ApiError(status, "ingestion_failed", `Failed to send the test event (HTTP ${status})${detail ? `: ${detail}` : "."}`);
  }
}

// Insights (Saved Queries)
export const listInsights = (projectId: string) =>
  request<{ queries: SavedQuery[] }>("GET", `/projects/${projectId}/insights`);

export const getInsight = (projectId: string, id: string) =>
  request<{ query: SavedQuery }>("GET", `/projects/${projectId}/insights/${id}`);

export const createInsight = (projectId: string, attrs: Record<string, unknown>) =>
  request<{ query: SavedQuery }>("POST", `/projects/${projectId}/insights`, { body: attrs });

export const updateInsight = (projectId: string, id: string, attrs: Record<string, unknown>) =>
  request<{ query: SavedQuery }>("PATCH", `/projects/${projectId}/insights/${id}`, { body: attrs });

export const deleteInsight = (projectId: string, id: string) =>
  request<{ status: string }>("DELETE", `/projects/${projectId}/insights/${id}`);

export const executeInsight = (projectId: string, id: string) =>
  request<{ query: SavedQuery; results: unknown }>("GET", `/projects/${projectId}/insights/${id}/execute`);

export const executeAdHocQuery = (projectId: string, query: Record<string, unknown>) =>
  request<{ results: unknown }>("POST", `/projects/${projectId}/insights/execute`, { body: query });

// Funnels
export const listFunnels = (projectId: string) =>
  request<{ funnels: Funnel[] }>("GET", `/projects/${projectId}/funnels`);

export const getFunnel = (projectId: string, id: string) =>
  request<{ funnel: Funnel }>("GET", `/projects/${projectId}/funnels/${id}`);

export const createFunnel = (projectId: string, attrs: Record<string, unknown>) =>
  request<{ funnel: Funnel }>("POST", `/projects/${projectId}/funnels`, { body: attrs });

export const updateFunnel = (projectId: string, id: string, attrs: Record<string, unknown>) =>
  request<{ funnel: Funnel }>("PATCH", `/projects/${projectId}/funnels/${id}`, { body: attrs });

export const deleteFunnel = (projectId: string, id: string) =>
  request<{ status: string }>("DELETE", `/projects/${projectId}/funnels/${id}`);

export const executeFunnel = (projectId: string, id: string) =>
  request<{ funnel: Funnel; results: unknown }>("GET", `/projects/${projectId}/funnels/${id}/execute`);

export const executeAdHocFunnel = (projectId: string, funnel: Record<string, unknown>) =>
  request<{ results: unknown }>("POST", `/projects/${projectId}/funnels/execute`, { body: funnel });

// Retention
export const listRetentions = (projectId: string) =>
  request<{ retentions: Retention[] }>("GET", `/projects/${projectId}/retention`);

export const getRetention = (projectId: string, id: string) =>
  request<{ retention: Retention }>("GET", `/projects/${projectId}/retention/${id}`);

export const createRetention = (projectId: string, attrs: Record<string, unknown>) =>
  request<{ retention: Retention }>("POST", `/projects/${projectId}/retention`, { body: attrs });

export const updateRetention = (projectId: string, id: string, attrs: Record<string, unknown>) =>
  request<{ retention: Retention }>("PATCH", `/projects/${projectId}/retention/${id}`, { body: attrs });

export const deleteRetention = (projectId: string, id: string) =>
  request<{ status: string }>("DELETE", `/projects/${projectId}/retention/${id}`);

export const executeRetention = (projectId: string, id: string) =>
  request<{ retention: Retention; results: unknown }>("GET", `/projects/${projectId}/retention/${id}/execute`);

export const executeAdHocRetention = (projectId: string, retention: Record<string, unknown>) =>
  request<{ results: unknown }>("POST", `/projects/${projectId}/retention/execute`, { body: retention });

// Experiments
export const listExperiments = (projectId: string) =>
  request<{ experiments: Experiment[] }>("GET", `/projects/${projectId}/experiments`);

export const getExperiment = (projectId: string, id: string, params?: Record<string, string>) =>
  request<{ experiment: Experiment; results?: unknown }>("GET", `/projects/${projectId}/experiments/${id}`, { params });

export const createExperiment = (projectId: string, attrs: Record<string, unknown>) =>
  request<{ experiment: Experiment }>("POST", `/projects/${projectId}/experiments`, { body: attrs });

export const updateExperiment = (projectId: string, id: string, attrs: Record<string, unknown>) =>
  request<{ experiment: Experiment }>("PATCH", `/projects/${projectId}/experiments/${id}`, { body: attrs });

export const deleteExperiment = (projectId: string, id: string) =>
  request<{ status: string }>("DELETE", `/projects/${projectId}/experiments/${id}`);

export const startExperiment = (projectId: string, id: string) =>
  request<{ experiment: Experiment }>("POST", `/projects/${projectId}/experiments/${id}/start`);

export const stopExperiment = (projectId: string, id: string) =>
  request<{ experiment: Experiment }>("POST", `/projects/${projectId}/experiments/${id}/stop`);

// Goals
export const listGoals = (projectId: string) =>
  request<{ goals: Goal[] }>("GET", `/projects/${projectId}/goals`);

export const listGoalSnapshots = (projectId: string) =>
  request<{ goals: GoalSnapshot[] }>("GET", `/projects/${projectId}/goals`, {
    params: { snapshots: "true" },
  });

export const getGoal = (projectId: string, id: string) =>
  request<{ goal: Goal }>("GET", `/projects/${projectId}/goals/${id}`);

export const getGoalSnapshot = (projectId: string, id: string) =>
  request<{ snapshot: GoalSnapshot }>("GET", `/projects/${projectId}/goals/${id}/snapshot`);

export const createGoal = (projectId: string, attrs: Record<string, unknown>) =>
  request<{ goal: Goal }>("POST", `/projects/${projectId}/goals`, { body: attrs });

// Widgets
export const listWidgets = (projectId: string) =>
  request<{ widgets: Widget[] }>("GET", `/projects/${projectId}/widgets`);

export const createWidget = (projectId: string, attrs: Record<string, unknown>) =>
  request<{ widget: Widget }>("POST", `/projects/${projectId}/widgets`, { body: attrs });

export const updateWidget = (projectId: string, id: string, attrs: Record<string, unknown>) =>
  request<{ widget: Widget }>("PATCH", `/projects/${projectId}/widgets/${id}`, { body: attrs });

export const deleteWidget = (projectId: string, id: string) =>
  request<{ status: string }>("DELETE", `/projects/${projectId}/widgets/${id}`);

export const resetWidgets = (projectId: string) =>
  request<{ widgets: Widget[] }>("POST", `/projects/${projectId}/widgets/reset`);

// Types
export interface User {
  id: string;
  email: string;
  confirmed_at: string | null;
  is_admin: boolean;
}

export interface Org {
  id: string;
  name: string;
  slug: string;
  plan?: string;
  role?: string;
  events_per_month_limit?: number;
}

export interface Project {
  id: string;
  name: string;
  slug?: string;
  timezone: string;
  organization_id?: string;
}

export interface ApiKey {
  id: string;
  name: string;
  key_prefix?: string;
  last_used_at?: string;
  created_at?: string;
  inserted_at?: string;
  environment?: string;
  allowed_identifiers?: string[];
  request_count?: number;
}

export interface DashboardResponse {
  stats: {
    total_events: number;
    unique_users: number;
    events_trend: number;
    users_trend: number;
  };
  events_by_day: { date: string; count: number }[];
  top_events: { name: string; count: number }[];
}

export interface FiltersResponse {
  event_names: string[];
  platforms: string[];
  environments: string[];
  countries?: string[];
  app_versions?: string[];
}

export interface Event {
  id: string;
  name: string;
  user_id?: string;
  properties?: Record<string, unknown>;
  timestamp: string;
}

export interface EventType {
  name: string;
  count: number;
}

export interface EventDefinition {
  id: string;
  name: string;
  description?: string;
  event_count?: number;
  first_seen_at?: string | null;
}

export interface SavedQuery {
  id: string;
  name: string;
  description?: string;
  visualization?: string;
  query_definition?: Record<string, unknown>;
  last_run_at?: string;
  run_count?: number;
}

export interface Funnel {
  id: string;
  name: string;
  steps: { event_name: string; name?: string }[];
  conversion_window_minutes?: number;
  date_range?: string;
}

export interface Retention {
  id: string;
  name: string;
  cohort_event: string;
  retention_event?: string | null;
  cohort_grain: string;
  retention_days: number[];
  date_range?: string;
}

export interface Experiment {
  id: string;
  name: string;
  variants: string[];
  goal_event: string;
  status?: string;
}

export interface Goal {
  id: string;
  name: string;
  source: Record<string, unknown>;
  window: Record<string, unknown>;
  shape: "reach" | "growth" | "streak" | "threshold";
  goal: Record<string, unknown>;
  starts_on: string | null;
  ends_on: string | null;
  enabled: boolean;
  following: boolean;
  reached_on: string | null;
  description: string;
  inserted_at: string;
  updated_at: string;
}

export interface GoalSnapshot {
  goal_id: string;
  name: string;
  shape: Goal["shape"];
  enabled: boolean;
  value: number | null;
  baseline: number | null;
  progress: number | null;
  pace: Record<string, unknown> | null;
  projected_finish: { date?: string; assumption?: Record<string, unknown> } | null;
  status: string;
  milestones: { reached: number[]; crossed: number[] };
  as_of: string;
  availability: "available" | "unavailable" | "timeout" | "not_started" | "disabled";
  unavailable_reason: string | null;
}

export interface Widget {
  id: string;
  widget_type: string;
  position?: number;
  size?: string;
}
