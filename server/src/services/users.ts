import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import type { ClaudeUser, ApiConfig } from "../types";

const USERS_PATH = "/home/ctyun/.claude/claude-users.json";
const PROFILES_DIR = "/home/ctyun/.claude-profiles";
const SETTINGS_PATH = "/home/ctyun/.claude/settings.json";
const CREDENTIALS_PATH = "/home/ctyun/.claude/.credentials.json";
const CLAUDE_JSON_PATH = "/home/ctyun/.claude.json";

// OAuth constants (same as claude-switcher)
const OAUTH_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const OAUTH_AUTHORIZE_URL = "https://claude.com/cai/oauth/authorize";
const OAUTH_TOKEN_URL = "https://platform.claude.com/v1/oauth/token";
const OAUTH_REDIRECT_URI = "https://platform.claude.com/oauth/code/callback";
const OAUTH_PROFILE_URL = "https://api.anthropic.com/api/oauth/profile";
const OAUTH_BETA_HEADER = "oauth-2025-04-20";
const OAUTH_SCOPES = [
  "org:create_api_key",
  "user:profile",
  "user:inference",
  "user:sessions:claude_code",
  "user:mcp_servers",
  "user:file_upload",
];

// ── Profile metadata store (tags/labels only — tokens live in ~/.claude-profiles/) ──

interface ProfileMeta {
  tags: string[];
  label?: string;
}

interface UsersStore {
  version: 1;
  profiles: Record<string, ProfileMeta>;
  apiConfig: ApiConfig;
  activeMode: "api" | "subscription";
  activeProfile: string | null;
}

function loadUsersStore(): UsersStore {
  try {
    if (fs.existsSync(USERS_PATH)) {
      return JSON.parse(fs.readFileSync(USERS_PATH, "utf-8"));
    }
  } catch {}
  return {
    version: 1,
    profiles: {},
    apiConfig: { apiKey: "", baseUrl: "https://api.deepseek.com/anthropic", model: "deepseek-v4-pro" },
    activeMode: "api",
    activeProfile: null,
  };
}

function saveUsersStore(store: UsersStore): void {
  fs.mkdirSync(path.dirname(USERS_PATH), { recursive: true });
  fs.writeFileSync(USERS_PATH, JSON.stringify(store, null, 2));
}

function readJson(filePath: string): any {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
  } catch {}
  return {};
}

function writeJson(filePath: string, data: any): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// ── Profile operations (filesystem, compatible with claude-switcher) ──

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

export function listProfiles(): ProfileInfo[] {
  const store = loadUsersStore();
  const profiles: ProfileInfo[] = [];

  if (!fs.existsSync(PROFILES_DIR)) return profiles;

  for (const entry of fs.readdirSync(PROFILES_DIR).sort()) {
    const profileDir = path.join(PROFILES_DIR, entry);
    if (!fs.statSync(profileDir).isDirectory()) continue;

    const metaFile = path.join(profileDir, "claude.json");
    const credsFile = path.join(profileDir, "credentials.json");
    const meta = readJson(metaFile);
    const acct = meta.oauthAccount || {};

    let tokenExpiresAt: number | null = null;
    if (fs.existsSync(credsFile)) {
      const creds = readJson(credsFile);
      const oauth = creds.claudeAiOauth || creds;
      tokenExpiresAt = oauth.expiresAt || null;
    }

    const profileMeta = store.profiles[entry] || { tags: [] };

    profiles.push({
      name: entry,
      email: acct.emailAddress || "unknown",
      displayName: acct.displayName || "",
      subscriptionType: oauthFromProfile(entry)?.subscriptionType || null,
      hasToken: fs.existsSync(credsFile),
      tokenExpiresAt,
      tags: profileMeta.tags || [],
      label: profileMeta.label,
    });
  }

  return profiles;
}

function oauthFromProfile(name: string): any | null {
  const credsFile = path.join(PROFILES_DIR, name, "credentials.json");
  if (!fs.existsSync(credsFile)) return null;
  const creds = readJson(credsFile);
  return creds.claudeAiOauth || creds;
}

export function getCurrentActiveUser(): { email: string | null; subscriptionType: string | null; displayName: string | null } {
  const cj = readJson(CLAUDE_JSON_PATH);
  const acct = cj.oauthAccount || {};
  const creds = readJson(CREDENTIALS_PATH);
  const oauth = creds.claudeAiOauth || creds;
  return {
    email: acct.emailAddress || null,
    subscriptionType: oauth.subscriptionType || null,
    displayName: acct.displayName || null,
  };
}

// ── Save / Restore profiles (compatible with claude-switcher) ──

export function saveCurrentToProfile(name: string): { ok: boolean; error?: string } {
  if (!name || !/^[\w\-]+$/.test(name)) {
    return { ok: false, error: "Invalid profile name (only letters, digits, underscore, dash)" };
  }
  const profileDir = path.join(PROFILES_DIR, name);
  fs.mkdirSync(profileDir, { recursive: true });

  if (fs.existsSync(CLAUDE_JSON_PATH)) {
    fs.copyFileSync(CLAUDE_JSON_PATH, path.join(profileDir, "claude.json"));
  }
  if (fs.existsSync(CREDENTIALS_PATH)) {
    fs.copyFileSync(CREDENTIALS_PATH, path.join(profileDir, "credentials.json"));
  }

  // Ensure metadata exists
  const store = loadUsersStore();
  if (!store.profiles[name]) {
    store.profiles[name] = { tags: [] };
    saveUsersStore(store);
  }

  return { ok: true };
}

export function restoreProfile(name: string): { ok: boolean; error?: string } {
  const profileDir = path.join(PROFILES_DIR, name);
  const claudeBackup = path.join(profileDir, "claude.json");
  const credsBackup = path.join(profileDir, "credentials.json");

  if (!fs.existsSync(claudeBackup)) {
    return { ok: false, error: "Profile not found" };
  }

  fs.copyFileSync(claudeBackup, CLAUDE_JSON_PATH);
  if (fs.existsSync(credsBackup)) {
    fs.copyFileSync(credsBackup, CREDENTIALS_PATH);
  } else {
    try { fs.unlinkSync(CREDENTIALS_PATH); } catch {}
  }

  // Clear API mode env vars from settings
  clearApiEnvFromSettings();

  // Update active state
  const store = loadUsersStore();
  store.activeMode = "subscription";
  store.activeProfile = name;
  saveUsersStore(store);

  return { ok: true };
}

export function deleteProfile(name: string): boolean {
  const profileDir = path.join(PROFILES_DIR, name);
  if (!fs.existsSync(profileDir)) return false;

  // rmdirSync recursive
  fs.rmSync(profileDir, { recursive: true, force: true });

  const store = loadUsersStore();
  delete store.profiles[name];
  if (store.activeProfile === name) {
    store.activeProfile = null;
    store.activeMode = "api";
    clearApiEnvFromSettings();
  }
  saveUsersStore(store);
  return true;
}

// ── Profile metadata (tags/labels) ──

export function updateProfileMeta(name: string, data: { tags?: string[]; label?: string }): boolean {
  const profileDir = path.join(PROFILES_DIR, name);
  if (!fs.existsSync(profileDir)) return false;

  const store = loadUsersStore();
  if (!store.profiles[name]) store.profiles[name] = { tags: [] };
  if (data.tags !== undefined) store.profiles[name].tags = data.tags;
  if (data.label !== undefined) store.profiles[name].label = data.label;
  saveUsersStore(store);
  return true;
}

// ── OAuth PKCE login ──

interface LoginState {
  status: "idle" | "waiting_code" | "submitting" | "done" | "error";
  url: string | null;
  message: string;
}

let loginState: LoginState = { status: "idle", url: null, message: "" };
let loginCodeVerifier: string | null = null;
let loginOauthState: string | null = null;
let loginTargetProfile: string | null = null; // if set, save to this profile instead of current

function b64url(data: Buffer): string {
  return data.toString("base64url").replace(/=+$/, "");
}

function generatePkce(): { verifier: string; challenge: string } {
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

async function httpJson(url: string, options: {
  data?: any;
  headers?: Record<string, string>;
  method?: string;
  timeout?: number;
}): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeout || 15000);

  try {
    const res = await fetch(url, {
      method: options.method || (options.data ? "POST" : "GET"),
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "claude-cli/2.1.116",
        ...options.headers,
      },
      body: options.data ? JSON.stringify(options.data) : undefined,
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const err: any = new Error(`HTTP ${res.status}: ${body}`);
      err.status = res.status;
      err.body = body;
      throw err;
    }

    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

export function loginStart(force = false, updateProfile?: string): { ok: boolean; error?: string; canForce?: boolean } {
  if (loginState.status === "waiting_code" && !force) {
    return { ok: false, error: "Login already in progress", canForce: true };
  }

  // Reset
  loginState = { status: "idle", url: null, message: "" };
  loginCodeVerifier = null;
  loginOauthState = null;
  loginTargetProfile = updateProfile || null;

  const { verifier, challenge } = generatePkce();
  const state = b64url(crypto.randomBytes(32));
  loginCodeVerifier = verifier;
  loginOauthState = state;

  const authUrl = `${OAUTH_AUTHORIZE_URL}?${new URLSearchParams({
    code: "true",
    client_id: OAUTH_CLIENT_ID,
    response_type: "code",
    redirect_uri: OAUTH_REDIRECT_URI,
    scope: OAUTH_SCOPES.join(" "),
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  })}`;

  loginState = {
    status: "waiting_code",
    url: authUrl,
    message: "Open the authorization URL and paste back the code",
  };

  return { ok: true };
}

export function loginCancel(): void {
  loginState = { status: "idle", url: null, message: "" };
  loginCodeVerifier = null;
  loginOauthState = null;
  loginTargetProfile = null;
}

export function loginSubmit(code: string): { ok: boolean; error?: string } {
  if (!loginCodeVerifier || !loginOauthState) {
    return { ok: false, error: "Login flow expired, please restart" };
  }

  loginState = { ...loginState, status: "submitting", message: "Verifying..." };

  // Run async exchange in background
  doTokenExchange(code).catch((e) => {
    loginState = { status: "error", url: null, message: String(e.message || e) };
  });

  return { ok: true };
}

async function doTokenExchange(code: string): Promise<void> {
  try {
    let authCode = code;
    // Handle code with embedded state (from redirect URL fragment)
    if (code.includes("#")) {
      const parts = code.split("#", 1);
      authCode = parts[0].trim();
    }

    // Exchange code for tokens
    const tokenResp = await httpJson(OAUTH_TOKEN_URL, {
      data: {
        grant_type: "authorization_code",
        code: authCode,
        redirect_uri: OAUTH_REDIRECT_URI,
        client_id: OAUTH_CLIENT_ID,
        code_verifier: loginCodeVerifier,
        state: loginOauthState,
      },
      timeout: 15000,
    });

    // Fetch profile
    let profile: any = {};
    try {
      profile = await httpJson(OAUTH_PROFILE_URL, {
        headers: { Authorization: `Bearer ${tokenResp.access_token}` },
        method: "GET",
        timeout: 10000,
      });
    } catch {}

    if (loginTargetProfile) {
      writeTokensToProfile(tokenResp, profile, loginTargetProfile);
      loginState = { status: "done", url: null, message: `updated:${loginTargetProfile}` };
    } else {
      writeTokensToCurrent(tokenResp, profile);
      loginState = { status: "done", url: null, message: "Login successful!" };
    }
  } catch (e: any) {
    loginState = { status: "error", url: null, message: e.message || String(e) };
  }
}

function writeTokensToCurrent(tokenResp: any, profile: any): void {
  const expiresAt = Date.now() + parseInt(tokenResp.expires_in) * 1000;
  const scopes = (tokenResp.scope || "").split(" ").filter(Boolean);

  const org = profile.organization || {};
  const account = profile.account || {};

  const orgType = org.organization_type;
  const subType: string | undefined = {
    claude_max: "max",
    claude_pro: "pro",
    claude_enterprise: "enterprise",
    claude_team: "team",
  }[orgType];

  // Write credentials.json
  const creds = {
    claudeAiOauth: {
      accessToken: tokenResp.access_token,
      refreshToken: tokenResp.refresh_token,
      expiresAt,
      scopes,
      subscriptionType: subType,
      rateLimitTier: org.rate_limit_tier,
    },
  };
  writeJson(CREDENTIALS_PATH, creds);
  try { fs.chmodSync(CREDENTIALS_PATH, 0o600); } catch {}

  // Update claude.json
  const cj = readJson(CLAUDE_JSON_PATH);
  cj.oauthAccount = {
    accountUuid: account.uuid,
    emailAddress: account.email_address || account.email,
    organizationUuid: org.uuid,
    hasExtraUsageEnabled: org.has_extra_usage_enabled,
    billingType: org.billing_type,
    accountCreatedAt: account.created_at,
    subscriptionCreatedAt: org.subscription_created_at,
    displayName: account.display_name,
    organizationRole: org.role || org.organization_role,
    workspaceRole: org.workspace_role,
    organizationName: org.name,
  };
  writeJson(CLAUDE_JSON_PATH, cj);
}

function writeTokensToProfile(tokenResp: any, profile: any, name: string): void {
  const profileDir = path.join(PROFILES_DIR, name);
  fs.mkdirSync(profileDir, { recursive: true });

  const expiresAt = Date.now() + parseInt(tokenResp.expires_in) * 1000;
  const scopes = (tokenResp.scope || "").split(" ").filter(Boolean);

  const org = profile.organization || {};
  const account = profile.account || {};

  const orgType = org.organization_type;
  const subType: string | undefined = {
    claude_max: "max",
    claude_pro: "pro",
    claude_enterprise: "enterprise",
    claude_team: "team",
  }[orgType];

  // Write credentials.json in profile
  writeJson(path.join(profileDir, "credentials.json"), {
    claudeAiOauth: {
      accessToken: tokenResp.access_token,
      refreshToken: tokenResp.refresh_token,
      expiresAt,
      scopes,
      subscriptionType: subType,
      rateLimitTier: org.rate_limit_tier,
    },
  });
  try { fs.chmodSync(path.join(profileDir, "credentials.json"), 0o600); } catch {}

  // Write claude.json in profile
  writeJson(path.join(profileDir, "claude.json"), {
    oauthAccount: {
      accountUuid: account.uuid,
      emailAddress: account.email_address || account.email,
      organizationUuid: org.uuid,
      hasExtraUsageEnabled: org.has_extra_usage_enabled,
      billingType: org.billing_type,
      accountCreatedAt: account.created_at,
      subscriptionCreatedAt: org.subscription_created_at,
      displayName: account.display_name,
      organizationRole: org.role || org.organization_role,
      workspaceRole: org.workspace_role,
      organizationName: org.name,
    },
  });

  // Ensure metadata exists
  const store = loadUsersStore();
  if (!store.profiles[name]) {
    store.profiles[name] = { tags: [] };
    saveUsersStore(store);
  }
}

export function getLoginState(): LoginState {
  return { ...loginState };
}

// ── Token refresh ──

export async function refreshProfileToken(name: string): Promise<{ ok: boolean; error?: string; expiresAt?: number }> {
  const credsFile = path.join(PROFILES_DIR, name, "credentials.json");
  if (!fs.existsSync(credsFile)) {
    return { ok: false, error: "No token to refresh" };
  }

  const creds = readJson(credsFile);
  const oauth = creds.claudeAiOauth || creds;
  const refreshToken = oauth.refreshToken;
  if (!refreshToken) {
    return { ok: false, error: "No refresh token available" };
  }

  try {
    const tokenResp = await httpJson(OAUTH_TOKEN_URL, {
      data: {
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: OAUTH_CLIENT_ID,
        scope: OAUTH_SCOPES.join(" "),
      },
      timeout: 15000,
    });

    const expiresAt = Date.now() + parseInt(tokenResp.expires_in) * 1000;
    oauth.accessToken = tokenResp.access_token;
    oauth.refreshToken = tokenResp.refresh_token || refreshToken;
    oauth.expiresAt = expiresAt;

    // Persist back
    if (creds.claudeAiOauth) {
      creds.claudeAiOauth = oauth;
      writeJson(credsFile, creds);
    } else {
      writeJson(credsFile, { claudeAiOauth: oauth });
    }
    try { fs.chmodSync(credsFile, 0o600); } catch {}

    return { ok: true, expiresAt };
  } catch (e: any) {
    if (e.status === 400) {
      return { ok: false, error: "Token expired, please re-login" };
    }
    return { ok: false, error: e.message || "Refresh failed" };
  }
}

// ── API config ──

export function getApiConfig(): ApiConfig {
  return loadUsersStore().apiConfig;
}

export function updateApiConfig(data: Partial<ApiConfig>): ApiConfig {
  const store = loadUsersStore();
  if (data.apiKey !== undefined) store.apiConfig.apiKey = data.apiKey;
  if (data.baseUrl !== undefined) store.apiConfig.baseUrl = data.baseUrl;
  if (data.model !== undefined) store.apiConfig.model = data.model;
  saveUsersStore(store);

  // If in API mode, update settings.json too
  if (store.activeMode === "api") {
    writeApiEnvToSettings(store.apiConfig);
  }
  return store.apiConfig;
}

// ── Mode switching ──

function clearApiEnvFromSettings(): void {
  _writeSettingsEnv(null, null, null);
}

function writeApiEnvToSettings(config: ApiConfig): void {
  _writeSettingsEnv(config.baseUrl, config.apiKey, config.model);
}

function _writeSettingsEnv(baseUrl: string | null, apiKey: string | null, model: string | null): void {
  const settings = readJson(SETTINGS_PATH);
  if (!settings.env) settings.env = {};

  const apiEnvKeys = ["ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_MODEL", "API_TIMEOUT_MS"];
  for (const k of apiEnvKeys) {
    delete settings.env[k];
  }

  if (baseUrl && apiKey) {
    settings.env.ANTHROPIC_BASE_URL = baseUrl;
    settings.env.ANTHROPIC_AUTH_TOKEN = apiKey;
    settings.env.API_TIMEOUT_MS = "3000000";
    if (model) settings.env.ANTHROPIC_MODEL = model;
  }

  if (Object.keys(settings.env).length === 0) {
    delete settings.env;
  }

  writeJson(SETTINGS_PATH, settings);
}

export function switchMode(
  mode: "api" | "subscription",
  profileName?: string | null
): { ok: boolean; error?: string } {
  const store = loadUsersStore();

  if (mode === "api") {
    writeApiEnvToSettings(store.apiConfig);
    // Clear OAuth credentials
    try { fs.unlinkSync(CREDENTIALS_PATH); } catch {}
    store.activeMode = "api";
    store.activeProfile = null;
    saveUsersStore(store);
    return { ok: true };
  }

  if (mode === "subscription") {
    let name = profileName || store.activeProfile;
    // Auto-select first available profile if none specified
    if (!name) {
      const profiles = listProfiles();
      if (profiles.length === 0) return { ok: false, error: "No profiles configured - please add a subscription account first" };
      name = profiles[0].name;
    }

    // Restore profile files to active location
    const profileDir = path.join(PROFILES_DIR, name);
    const claudeFile = path.join(profileDir, "claude.json");
    const credsFile = path.join(profileDir, "credentials.json");

    if (!fs.existsSync(claudeFile)) {
      return { ok: false, error: `Profile '${name}' not found` };
    }

    fs.copyFileSync(claudeFile, CLAUDE_JSON_PATH);
    if (fs.existsSync(credsFile)) {
      fs.copyFileSync(credsFile, CREDENTIALS_PATH);
    }

    clearApiEnvFromSettings();
    store.activeMode = "subscription";
    store.activeProfile = name;
    saveUsersStore(store);
    return { ok: true };
  }

  return { ok: false, error: "Invalid mode" };
}

export function getActiveState(): {
  mode: string;
  activeProfile: string | null;
  currentUser: { email: string | null; subscriptionType: string | null; displayName: string | null };
} {
  const store = loadUsersStore();
  return {
    mode: store.activeMode,
    activeProfile: store.activeProfile,
    currentUser: getCurrentActiveUser(),
  };
}
