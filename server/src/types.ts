export interface SessionMeta {
  id: string;
  customName?: string;
  category?: string;
  tags: string[];
  archived: boolean;
  pinned: boolean;
  preferredProvider?: "api" | "subscription";
  sessionApiConfig?: ApiConfig;
  sessionProfile?: string;
  lastCompressedLineCount?: number;
}

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

export interface SessionsMetadata {
  version: 1;
  sessions: Record<string, SessionMeta>;
  categories: string[];
}

// Node Management
export interface ManagedNode {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authMethod: "password" | "key";
  password?: string;
  privateKey?: string;
  group: string;
  tags: string[];
  lastSeen?: string;
  status?: "online" | "offline" | "unknown";
}

export interface NodesStore {
  version: 1;
  nodes: Record<string, ManagedNode>;
  groups: string[];
}

// Profile-based user management (compatible with claude-switcher)
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

// Proxy Pool monitoring
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
  // Added by our fetcher
  error?: string;
  notFound?: boolean;
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
}
