import { getToken } from "./auth.js";

const BASE_URL = "https://api.mostlygoodmetrics.com/api/v2";

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

export const createApiKey = (projectId: string, name: string) =>
  request<{ api_key: ApiKey & { key: string } }>("POST", `/projects/${projectId}/api-keys`, {
    body: { name },
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
  request<{ event_definitions: EventDefinition[] }>("GET", `/projects/${projectId}/events/definitions`);

// Insights (Saved Queries)
export const listInsights = (projectId: string) =>
  request<{ insights: SavedQuery[] }>("GET", `/projects/${projectId}/insights`);

export const getInsight = (projectId: string, id: string) =>
  request<{ insight: SavedQuery }>("GET", `/projects/${projectId}/insights/${id}`);

export const createInsight = (projectId: string, attrs: Record<string, unknown>) =>
  request<{ insight: SavedQuery }>("POST", `/projects/${projectId}/insights`, { body: attrs });

export const updateInsight = (projectId: string, id: string, attrs: Record<string, unknown>) =>
  request<{ insight: SavedQuery }>("PATCH", `/projects/${projectId}/insights/${id}`, { body: attrs });

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

export const getExperiment = (projectId: string, id: string) =>
  request<{ experiment: Experiment }>("GET", `/projects/${projectId}/experiments/${id}`);

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

export interface Widget {
  id: string;
  widget_type: string;
  position?: number;
  size?: string;
}
