import type { SessionDetail, SessionsResponse, GithubConfig, ManagedNode, NodesResponse, FileListing, MonitorSnapshot, MonitorHistory, DeployJob, DeployPreset, DeployLogEntry, UsersResponse, UsageSummary, SessionProvider, ApiConfig, ProfileInfo, LoginState, ProxyPoolStatus } from "./types";

const BASE = "/api";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

// ── Sessions ──

export async function fetchSessions(params?: {
  search?: string;
  category?: string;
  archived?: string;
  sort?: string;
}): Promise<SessionsResponse> {
  const qs = new URLSearchParams();
  if (params?.search) qs.set("search", params.search);
  if (params?.category) qs.set("category", params.category);
  if (params?.archived) qs.set("archived", params.archived);
  if (params?.sort) qs.set("sort", params.sort);
  const q = qs.toString();
  return request<SessionsResponse>(`/sessions${q ? `?${q}` : ""}`);
}

export async function fetchSessionDetail(id: string, limit = 50): Promise<SessionDetail> {
  return request<SessionDetail>(`/sessions/${id}?limit=${limit}`);
}

export async function updateSessionMeta(
  id: string,
  data: Partial<{
    customName: string;
    category: string;
    tags: string[];
    archived: boolean;
    pinned: boolean;
  }>
) {
  return request(`/sessions/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function resumeSession(id: string) {
  return request<{ success: boolean; output: string }>(`/sessions/${id}/resume`, {
    method: "POST",
  });
}

export async function toggleArchive(id: string) {
  return request(`/sessions/${id}/archive`, { method: "POST" });
}

export async function deleteSession(id: string) {
  return request(`/sessions/${id}`, { method: "DELETE" });
}

export async function fetchGithubConfig(): Promise<GithubConfig> {
  return request<GithubConfig>("/github/config");
}

export async function saveGithubConfig(data: { token?: string; repo?: string; branch?: string }) {
  return request("/github/config", { method: "POST", body: JSON.stringify(data) });
}

export async function compressSession(id: string, keepLast = 100) {
  return request<{
    success?: boolean;
    skipped?: boolean;
    message?: string;
    originalSize: number;
    compressedSize: number;
    removedCount: number;
    keptCount: number;
    summaryLength: number;
    backupPath: string;
  }>(`/sessions/${id}/compress`, {
    method: "POST",
    body: JSON.stringify({ keepLast }),
  });
}

export async function aiCompressSession(id: string, keepLast = 100, stripThinking = false) {
  return request<{
    success?: boolean;
    skipped?: boolean;
    message?: string;
    originalSize: number;
    compressedSize: number;
    removedCount: number;
    keptCount: number;
    summaryLength: number;
    backupPath: string;
  }>(`/sessions/${id}/ai-compress`, {
    method: "POST",
    body: JSON.stringify({ keepLast, stripThinking }),
  });
}

export async function bulkAction(ids: string[], action: string) {
  return request<{ success: boolean }>("/sessions/bulk", {
    method: "POST",
    body: JSON.stringify({ ids, action }),
  });
}

export async function syncToGithub(sessionIds: string[]) {
  return request<{ success: boolean; error?: string; lastSync?: string }>("/github/sync", {
    method: "POST",
    body: JSON.stringify({ sessionIds }),
  });
}

// ── Node Management ──

export async function fetchNodes(): Promise<NodesResponse> {
  return request<NodesResponse>("/nodes");
}

export async function fetchNode(id: string): Promise<ManagedNode> {
  return request<ManagedNode>(`/nodes/${id}`);
}

export async function addNode(data: {
  name: string;
  host: string;
  port?: number;
  username: string;
  authMethod: string;
  password?: string;
  privateKey?: string;
  group?: string;
  tags?: string[];
}): Promise<ManagedNode> {
  return request<ManagedNode>("/nodes", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateNode(
  id: string,
  data: Partial<{
    name: string;
    host: string;
    port: number;
    username: string;
    authMethod: string;
    password: string;
    privateKey: string;
    group: string;
    tags: string[];
  }>
): Promise<ManagedNode> {
  return request<ManagedNode>(`/nodes/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteNode(id: string) {
  return request<{ success: boolean }>(`/nodes/${id}`, { method: "DELETE" });
}

export async function testNodeConnection(id: string) {
  return request<{ ok: boolean; error?: string }>(`/nodes/${id}/test`, {
    method: "POST",
  });
}

// ── File Management ──

export async function listFiles(nodeId: string, path: string): Promise<FileListing> {
  return request<FileListing>(`/nodes/${nodeId}/files?path=${encodeURIComponent(path)}`);
}

export function getDownloadUrl(nodeId: string, path: string): string {
  return `${BASE}/nodes/${nodeId}/files/download?path=${encodeURIComponent(path)}`;
}

export async function uploadFiles(nodeId: string, path: string, files: FileList | File[]): Promise<{
  results: Array<{ name: string; success: boolean; error?: string }>;
}> {
  const formData = new FormData();
  formData.append("path", path);
  for (const file of files) {
    formData.append("files", file);
  }
  const res = await fetch(`${BASE}/nodes/${nodeId}/files/upload`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export async function deleteFile(nodeId: string, path: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/nodes/${nodeId}/files?path=${encodeURIComponent(path)}`, {
    method: "DELETE",
  });
}

// ── Resource Monitor ──

export async function fetchMonitor(nodeId: string): Promise<MonitorSnapshot> {
  return request<MonitorSnapshot>(`/nodes/${nodeId}/monitor`);
}

export async function fetchMonitorHistory(nodeId: string): Promise<MonitorHistory> {
  return request<MonitorHistory>(`/nodes/${nodeId}/monitor/history`);
}

// ── Proxy Pool ──

export async function fetchProxyPool(nodeId: string): Promise<ProxyPoolStatus> {
  return request<ProxyPoolStatus>(`/nodes/${nodeId}/proxy-pool`);
}

export async function fetchProxyPoolConfig(nodeId: string): Promise<{ max_ip_count: number | string; max_concurrent_per_ip: number; wait_timeout_sec: number }> {
  return request(`/nodes/${nodeId}/proxy-pool/config`);
}

export async function updateProxyPoolConfig(nodeId: string, config: { max_ip_count?: number }): Promise<{ max_ip_count: number | string; max_concurrent_per_ip: number; wait_timeout_sec: number }> {
  return request(`/nodes/${nodeId}/proxy-pool/config`, {
    method: "POST",
    body: JSON.stringify(config),
  });
}

// ── Deploy ──

export async function startDeploy(data: {
  nodeId: string;
  repoUrl?: string;
  branch?: string;
  script?: string;
}): Promise<DeployJob> {
  return request<DeployJob>("/deploy", {
    method: "POST",
    body: JSON.stringify({ ...data, repoUrl: data.repoUrl || "" }),
  });
}

export async function fetchDeployJobs(): Promise<{ jobs: DeployJob[] }> {
  return request<{ jobs: DeployJob[] }>("/deploy");
}

export async function fetchDeployJob(jobId: string): Promise<DeployJob> {
  return request<DeployJob>(`/deploy/${jobId}`);
}

export function getDeployLogsUrl(jobId: string): string {
  return `${BASE}/deploy/${jobId}/logs`;
}

export async function fetchDeployLogs(days = 30): Promise<{ logs: DeployLogEntry[] }> {
  return request<{ logs: DeployLogEntry[] }>(`/deploy/logs?days=${days}`);
}

export async function fetchDeployLog(jobId: string): Promise<DeployJob> {
  return request<DeployJob>(`/deploy/logs/${jobId}`);
}

// Deploy Presets
export async function fetchDeployPresets(): Promise<{ presets: DeployPreset[] }> {
  return request<{ presets: DeployPreset[] }>("/deploy/presets");
}

export async function addDeployPreset(data: {
  name: string;
  repoUrl?: string;
  branch?: string;
  script?: string;
  description?: string;
}): Promise<DeployPreset> {
  return request<DeployPreset>("/deploy/presets", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateDeployPreset(
  id: string,
  data: Partial<{ name: string; repoUrl: string; branch: string; script: string; description: string }>
): Promise<DeployPreset> {
  return request<DeployPreset>(`/deploy/presets/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteDeployPreset(id: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/deploy/presets/${id}`, {
    method: "DELETE",
  });
}

// ── Provider switching / Users ──

export async function fetchUsers(): Promise<UsersResponse> {
  return request<UsersResponse>("/users");
}

// Save current tokens as a profile
export async function saveProfile(name: string): Promise<{ success: boolean; message: string }> {
  return request("/users/profiles", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

// Switch to a profile (restore to active ~/.claude*)
export async function switchProfile(name: string): Promise<{ success: boolean; message: string }> {
  return request("/users/profiles/switch", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

// Delete a profile
export async function deleteProfile(name: string): Promise<{ success: boolean }> {
  return request(`/users/profiles/${encodeURIComponent(name)}`, { method: "DELETE" });
}

// Update profile metadata (tags/label)
export async function updateProfileMeta(
  name: string,
  data: { tags?: string[]; label?: string }
): Promise<{ success: boolean }> {
  return request(`/users/profiles/${encodeURIComponent(name)}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// Switch mode (api/subscription)
export async function switchMode(data: { mode: "api" | "subscription"; profileName?: string }): Promise<{ success: boolean; mode: string }> {
  return request<{ success: boolean; mode: string }>("/users/switch", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// Update API config
export async function updateApiConfig(data: Partial<ApiConfig>): Promise<ApiConfig> {
  return request<ApiConfig>("/users/api-config", {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// OAuth login - start PKCE flow
export async function loginStart(updateProfile?: string): Promise<{ ok: boolean; url: string; message: string }> {
  return request("/users/login/start", {
    method: "POST",
    body: JSON.stringify({ update_profile: updateProfile }),
  });
}

// OAuth login - cancel
export async function loginCancel(): Promise<{ ok: boolean }> {
  return request("/users/login/cancel", { method: "POST" });
}

// OAuth login - submit code
export async function loginSubmit(code: string): Promise<{ ok: boolean }> {
  return request("/users/login/submit", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

// OAuth login - get current state
export async function loginGetState(): Promise<LoginState> {
  return request<LoginState>("/users/login/state");
}

// Get SSE stream URL for login status
export function getLoginStreamUrl(): string {
  return `${BASE}/users/login/stream`;
}

// Refresh token for a profile
export async function refreshToken(name: string): Promise<{ ok: boolean; expiresAt?: number; error?: string }> {
  return request(`/users/profiles/${encodeURIComponent(name)}/refresh`, {
    method: "POST",
  });
}

// ── Usage ──

export async function fetchUsage(): Promise<UsageSummary> {
  return request<UsageSummary>("/usage");
}

// ── Session provider ──

export async function fetchSessionProvider(id: string): Promise<SessionProvider> {
  return request<SessionProvider>(`/sessions/${id}/provider`);
}

export async function switchSessionProvider(id: string, toMode: "api" | "subscription"): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/sessions/${id}/switch-provider`, {
    method: "POST",
    body: JSON.stringify({ toMode }),
  });
}

export async function fetchGlobalMode(): Promise<{ mode: "api" | "subscription" | "unknown"; model: string | null }> {
  return request<{ mode: "api" | "subscription" | "unknown"; model: string | null }>("/sessions/mode");
}

export async function switchGlobalMode(toMode: "api" | "subscription"): Promise<{ success: boolean; mode: string }> {
  return request<{ success: boolean; mode: string }>("/sessions/mode/switch", {
    method: "POST",
    body: JSON.stringify({ toMode }),
  });
}

export async function getProcessingSessions(): Promise<{
  sessions: Array<{ id: string; customName?: string; title: string; currentMode: string; messageCount: number }>;
}> {
  return request("/sessions/processing");
}

export async function forceUnstickSession(sessionId: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/sessions/${sessionId}/force-unstick`, {
    method: "POST",
  });
}
