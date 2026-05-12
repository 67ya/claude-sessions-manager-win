export interface SessionInfo {
  id: string;
  title: string;
  customName?: string;
  category?: string;
  tags: string[];
  archived: boolean;
  pinned: boolean;
  firstMessage: string;
  messageCount: number;
  sizeBytes: number;
  createdAt: string;
  lastActivityAt: string;
  provider?: "api" | "subscription" | "mixed" | "unknown";
}

export interface SessionDetail {
  info: SessionInfo;
  messages: Array<{
    type: string;
    timestamp?: string;
    message?: { role: string; content: string };
    content?: string;
  }>;
}

export interface SessionsResponse {
  sessions: SessionInfo[];
  categories: string[];
}

export interface GithubConfig {
  repo: string;
  branch: string;
  hasToken: boolean;
  lastSync: string | null;
}

// Node Management
export interface ManagedNode {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authMethod: "password" | "key";
  group: string;
  tags: string[];
  lastSeen?: string;
  status?: "online" | "offline" | "unknown";
  hasPassword?: boolean;
  hasKey?: boolean;
}

export interface NodesResponse {
  nodes: ManagedNode[];
  groups: string[];
}

// File Management
export interface FileListing {
  path: string;
  entries: Array<{
    name: string;
    type: "file" | "directory" | "symlink";
    size: number;
    mtime: number;
    permissions: string;
  }>;
}

// Resource Monitor
export interface MonitorSnapshot {
  hostname: string;
  uptime: string;
  loadAvg: { "1min": number; "5min": number; "10min": number };
  cpu: { model: string; cores: number; usagePercent: number };
  memory: { total: string; used: string; free: string; usagePercent: number };
  disk: Array<{ filesystem: string; size: string; used: string; available: string; mountpoint: string; usagePercent: number }>;
  processes: { total: number; top5: Array<{ pid: string; cpu: string; mem: string; command: string }> };
  network: { hostname: string; interfaces: Array<{ name: string; ip: string }> };
  error?: string;
}

// Deploy
export interface DeployPreset {
  id: string;
  name: string;
  repoUrl: string;
  branch: string;
  script: string;
  description?: string;
}

export interface DeployJob {
  id: string;
  nodeId: string;
  nodeName: string;
  host: string;
  repoUrl: string;
  branch: string;
  script: string;
  status: "pending" | "running" | "success" | "failed";
  logs: string[];
  createdAt: string;
  finishedAt?: string;
}

// Proxy Pool
export interface ProxyPoolSlot {
  slot_id: string;
  ip: string;
  port: number;
  concurrent_count: number;
  max_concurrent: number;
  available: boolean;
  alive: boolean;
  is_expired: boolean;
  fetched_at: string;
  expires_at: string;
  remaining_seconds: number;
  total_requests: number;
  fail_count: number;
}

export interface ProxyPoolUsageItem {
  name: string;
  daily_limit: number;
  used: number;
  expire_date: string;
}

export interface ProxyPoolStatus {
  active_slots: ProxyPoolSlot[];
  dead_slots: ProxyPoolSlot[];
  total_active: number;
  total_concurrent: number;
  queue_length: number;
  logs: Array<{ time: string; msg: string }>;
  usage: ProxyPoolUsageItem[];
  timestamp: string;
  error?: string;
  notFound?: boolean;
}

export interface MonitorHistory {
  nodeId: string;
  history: Array<{ timestamp: number } & MonitorSnapshot>;
}

export interface DeployLogEntry {
  jobId: string;
  createdAt: string;
  nodeName: string;
  status: string;
  repoUrl: string;
}

// Profile-based user management
export interface ProfileInfo {
  name: string;
  email: string;
  displayName: string;
  subscriptionType: string | null;
  hasToken: boolean;
  tokenExpiresAt: number | null;
  tags: string[];
  label?: string;
}

export interface ApiConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface UsersResponse {
  profiles: ProfileInfo[];
  apiConfig: ApiConfig;
  activeMode: "api" | "subscription";
  activeProfile: string | null;
  currentUser: {
    email: string | null;
    subscriptionType: string | null;
    displayName: string | null;
  };
}

export interface UsageWindow {
  utilization: number;
  resetsAt: string | null;
}

export interface UsageSummary {
  activeUserEmail: string | null;
  tokenExpiresAt: number | null;
  tokenExpiresIn: string | null;
  subscriptionType: string | null;
  fiveHour: UsageWindow | null;
  sevenDay: UsageWindow | null;
  sevenDayOpus: UsageWindow | null;
  extraUsage: {
    isEnabled: boolean;
    monthlyLimit: number | null;
    usedCredits: number | null;
    utilization: number | null;
  } | null;
}

export interface SessionProvider {
  provider: "api" | "subscription" | "mixed" | "unknown";
  models: string[];
  dominantProvider: "api" | "subscription" | "unknown";
  preferredProvider?: "api" | "subscription";
}

export interface LoginState {
  status: "idle" | "waiting_code" | "submitting" | "done" | "error";
  url: string | null;
  message: string;
}
