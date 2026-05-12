import * as fs from "fs";
import type { UsageSummary } from "../types";
import { CLAUDE_JSON_PATH, CREDENTIALS_PATH } from "../config";
const OAUTH_USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const OAUTH_BETA_HEADER = "oauth-2025-04-20";

interface OAuthUsageResponse {
  five_hour: { utilization: number; resets_at: string } | null;
  seven_day: { utilization: number; resets_at: string } | null;
  seven_day_opus: { utilization: number; resets_at: string } | null;
  extra_usage: {
    is_enabled: boolean;
    monthly_limit: number | null;
    used_credits: number | null;
    utilization: number | null;
  } | null;
}

function loadCredentials() {
  try {
    if (fs.existsSync(CREDENTIALS_PATH)) {
      return JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf-8"));
    }
  } catch {}
  return {};
}

function loadClaudeJson() {
  try {
    if (fs.existsSync(CLAUDE_JSON_PATH)) {
      return JSON.parse(fs.readFileSync(CLAUDE_JSON_PATH, "utf-8"));
    }
  } catch {}
  return {};
}

function getTokenInfo(oauth: Record<string, any>) {
  const exp = oauth?.expiresAt;
  let expiresIn: string | null = null;
  if (exp) {
    const remaining = exp - Date.now();
    if (remaining <= 0) {
      expiresIn = "expired";
    } else {
      const days = Math.floor(remaining / 86400000);
      const hours = Math.floor((remaining % 86400000) / 3600000);
      const mins = Math.floor((remaining % 3600000) / 60000);
      const parts: string[] = [];
      if (days > 0) parts.push(`${days}d`);
      if (hours > 0) parts.push(`${hours}h`);
      if (parts.length === 0) parts.push(`${mins}m`);
      expiresIn = parts.join(" ");
    }
  }
  return { expiresAt: exp || null, expiresIn };
}

export async function getUsageSummary(): Promise<UsageSummary> {
  const cred = loadCredentials();
  const cj = loadClaudeJson();
  const oauth = cred?.claudeAiOauth ?? {};
  const { expiresAt, expiresIn } = getTokenInfo(oauth);

  const email = oauth?.emailAddress || cj?.oauthAccount?.emailAddress || null;
  const subscriptionType = oauth?.subscriptionType || cj?.oauthAccount?.billingType?.replace("_subscription", "") || null;

  let fiveHour: UsageSummary["fiveHour"] = null;
  let sevenDay: UsageSummary["sevenDay"] = null;
  let sevenDayOpus: UsageSummary["sevenDayOpus"] = null;
  let extraUsage: UsageSummary["extraUsage"] = null;

  const token = oauth?.accessToken;
  if (token) {
    try {
      const res = await fetch(OAUTH_USAGE_URL, {
        headers: {
          "Authorization": `Bearer ${token}`,
          "anthropic-beta": OAUTH_BETA_HEADER,
        },
      });
      if (res.ok) {
        const data: OAuthUsageResponse = await res.json();
        fiveHour = data.five_hour
          ? { utilization: data.five_hour.utilization, resetsAt: data.five_hour.resets_at }
          : null;
        sevenDay = data.seven_day
          ? { utilization: data.seven_day.utilization, resetsAt: data.seven_day.resets_at }
          : null;
        sevenDayOpus = data.seven_day_opus
          ? { utilization: data.seven_day_opus.utilization, resetsAt: data.seven_day_opus.resets_at }
          : null;
        if (data.extra_usage) {
          extraUsage = {
            isEnabled: data.extra_usage.is_enabled,
            monthlyLimit: data.extra_usage.monthly_limit,
            usedCredits: data.extra_usage.used_credits,
            utilization: data.extra_usage.utilization,
          };
        }
      }
    } catch {}
  }

  return {
    activeUserEmail: email,
    tokenExpiresAt: expiresAt,
    tokenExpiresIn: expiresIn,
    subscriptionType,
    fiveHour,
    sevenDay,
    sevenDayOpus,
    extraUsage,
  };
}
