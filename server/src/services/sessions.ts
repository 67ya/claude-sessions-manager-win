import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import type { SessionInfo, SessionMeta, SessionsMetadata, ApiConfig } from "../types";
import {
  SESSIONS_DIR,
  METADATA_PATH,
  USERS_PATH,
  SETTINGS_PATH,
  CREDENTIALS_PATH,
  CLAUDE_JSON_PATH,
  PROFILES_DIR,
  CLAUDE_DIR,
  HOME_DIR,
  IS_WINDOWS,
} from "../config";

function loadMetadata(): SessionsMetadata {
  try {
    if (fs.existsSync(METADATA_PATH)) {
      const raw = fs.readFileSync(METADATA_PATH, "utf-8");
      return JSON.parse(raw) as SessionsMetadata;
    }
  } catch {}
  return { version: 1, sessions: {}, categories: [] };
}

function saveMetadata(meta: SessionsMetadata): void {
  fs.mkdirSync(path.dirname(METADATA_PATH), { recursive: true });
  fs.writeFileSync(METADATA_PATH, JSON.stringify(meta, null, 2));
}

function ensureMeta(meta: SessionsMetadata, id: string): SessionMeta {
  if (!meta.sessions[id]) {
    meta.sessions[id] = {
      id,
      tags: [],
      archived: false,
      pinned: false,
    };
  }
  return meta.sessions[id];
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

export function getSessionMeta(id: string): SessionMeta | undefined {
  const meta = loadMetadata();
  return meta.sessions[id];
}

export function updateSessionMeta(
  id: string,
  updates: Partial<Pick<SessionMeta, "customName" | "category" | "tags" | "archived" | "pinned" | "lastCompressedLineCount"> & { preferredProvider?: "api" | "subscription"; sessionApiConfig?: ApiConfig; sessionProfile?: string }>
): SessionMeta {
  const meta = loadMetadata();
  const session = ensureMeta(meta, id);
  if (updates.customName !== undefined) session.customName = updates.customName || undefined;
  if (updates.category !== undefined) {
    session.category = updates.category || undefined;
    if (updates.category && !meta.categories.includes(updates.category)) {
      meta.categories.push(updates.category);
    }
  }
  if (updates.tags !== undefined) session.tags = updates.tags;
  if (updates.archived !== undefined) session.archived = updates.archived;
  if (updates.pinned !== undefined) session.pinned = updates.pinned;
  if (updates.preferredProvider !== undefined) session.preferredProvider = updates.preferredProvider;
  if ("sessionApiConfig" in updates) session.sessionApiConfig = updates.sessionApiConfig || undefined;
  if ("sessionProfile" in updates) session.sessionProfile = updates.sessionProfile || undefined;
  if (updates.lastCompressedLineCount !== undefined) session.lastCompressedLineCount = updates.lastCompressedLineCount;
  saveMetadata(meta);
  return session;
}

export function getCategories(): string[] {
  return loadMetadata().categories;
}

export function getAllSessions(
  search?: string,
  category?: string,
  archived?: string,
  sort?: string
): SessionInfo[] {
  const meta = loadMetadata();

  if (!fs.existsSync(SESSIONS_DIR)) return [];

  const files = fs.readdirSync(SESSIONS_DIR).filter((f) => f.endsWith(".jsonl"));
  const sessions: SessionInfo[] = [];

  for (const fileName of files) {
    const id = fileName.replace(".jsonl", "");
    const filePath = path.join(SESSIONS_DIR, fileName);
    const stat = fs.statSync(filePath);
    const sizeBytes = stat.size;
    if (sizeBytes === 0) continue;

    const raw = fs.readFileSync(filePath, "utf-8");
    const lines = raw.trim().split("\n");
    const messageCount = lines.length;

    let firstMessage = "";
    let createdAt = "";
    let lastActivityAt = "";
    let apiCount = 0;
    let subCount = 0;

    for (const line of lines) {
      try {
        const d = JSON.parse(line);
        if (d.timestamp) {
          if (!createdAt) createdAt = d.timestamp;
          lastActivityAt = d.timestamp;
        }
        if (!firstMessage) {
          if (d.type === "user" && d.message?.content) {
            firstMessage = d.message.content;
          } else if (d.content && typeof d.content === "string" && d.type === "queue-operation" && d.operation === "enqueue") {
            firstMessage = d.content;
          }
        }
        // Detect provider from model field
        const model = d.model || d.message?.model;
        if (model) {
          if (model.startsWith("claude-")) subCount++;
          else if (model.startsWith("deepseek-")) apiCount++;
        }
      } catch {}
    }

    const sessionMeta = meta.sessions[id];

    let provider: SessionInfo["provider"] = "unknown";
    // Prefer stored preference over model scanning
    if (sessionMeta?.preferredProvider) {
      provider = sessionMeta.preferredProvider;
    } else if (apiCount > 0 && subCount > 0) {
      provider = "mixed";
    } else if (apiCount > 0) {
      provider = "api";
    } else if (subCount > 0) {
      provider = "subscription";
    }
    const title =
      sessionMeta?.customName ||
      firstMessage.slice(0, 80).replace(/\n/g, " ").trim() ||
      "(空对话)";

    sessions.push({
      id,
      title,
      customName: sessionMeta?.customName,
      category: sessionMeta?.category,
      tags: sessionMeta?.tags ?? [],
      archived: sessionMeta?.archived ?? false,
      pinned: sessionMeta?.pinned ?? false,
      firstMessage,
      messageCount,
      sizeBytes,
      createdAt,
      lastActivityAt,
      provider,
    });
  }

  let result = sessions;
  const showArchived = archived === "only";

  if (showArchived) {
    result = result.filter((s) => s.archived);
  } else if (archived !== "true") {
    result = result.filter((s) => !s.archived);
  }

  if (category) {
    result = result.filter((s) => s.category === category);
  }

  if (search) {
    const q = search.toLowerCase();
    result = result.filter(
      (s) =>
        s.id.toLowerCase().includes(q) ||
        s.title.toLowerCase().includes(q) ||
        s.firstMessage.toLowerCase().includes(q) ||
        s.category?.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q))
    );
  }

  result.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    switch (sort) {
      case "messages-desc":
        return b.messageCount - a.messageCount;
      case "messages-asc":
        return a.messageCount - b.messageCount;
      case "size-desc":
        return b.sizeBytes - a.sizeBytes;
      case "size-asc":
        return a.sizeBytes - b.sizeBytes;
      case "created-desc":
        return b.createdAt.localeCompare(a.createdAt);
      case "created-asc":
        return a.createdAt.localeCompare(b.createdAt);
      default:
        return b.lastActivityAt.localeCompare(a.lastActivityAt);
    }
  });

  return result;
}

export function getSessionDetail(
  id: string,
  limit = 50
): { info: SessionInfo; messages: object[] } | null {
  const filePath = path.join(SESSIONS_DIR, `${id}.jsonl`);
  if (!fs.existsSync(filePath)) return null;

  const raw = fs.readFileSync(filePath, "utf-8");
  const meta = loadMetadata();
  const lines = raw.trim().split("\n");
  const messages: object[] = [];
  let firstMessage = "";
  let createdAt = "";
  let lastActivityAt = "";

  // Scan all lines for metadata (first message, timestamps)
  for (const line of lines) {
    try {
      const d = JSON.parse(line);
      if (d.timestamp) {
        if (!createdAt) createdAt = d.timestamp;
        lastActivityAt = d.timestamp;
      }
      if (!firstMessage) {
        if (d.type === "user" && d.message?.content) {
          firstMessage = d.message.content;
        } else if (d.content && typeof d.content === "string" && d.type === "queue-operation" && d.operation === "enqueue") {
          firstMessage = d.content;
        }
      }
    } catch {}
  }

  // Take tail for message preview - only user/assistant messages
  for (let i = lines.length - 1; i >= 0 && messages.length < limit; i--) {
    try {
      const d = JSON.parse(lines[i]);
      if (d.type === "user" || d.type === "assistant") {
        messages.unshift(d);
      }
    } catch {}
  }

  const sessionMeta = meta.sessions[id];
  const title =
    sessionMeta?.customName ||
    firstMessage.slice(0, 80).replace(/\n/g, " ").trim() ||
    "(空对话)";

  return {
    info: {
      id,
      title,
      customName: sessionMeta?.customName,
      category: sessionMeta?.category,
      tags: sessionMeta?.tags ?? [],
      archived: sessionMeta?.archived ?? false,
      pinned: sessionMeta?.pinned ?? false,
      firstMessage,
      messageCount: lines.length,
      sizeBytes: fs.statSync(filePath).size,
      createdAt,
      lastActivityAt,
    },
    messages,
  };
}

export interface CompressResult {
  originalSize: number;
  compressedSize: number;
  removedCount: number;
  keptCount: number;
  summaryLength: number;
  backupPath: string;
}

export function compressSession(id: string, keepLast = 100): CompressResult | null {
  const filePath = path.join(SESSIONS_DIR, `${id}.jsonl`);
  if (!fs.existsSync(filePath)) return null;

  const raw = fs.readFileSync(filePath, "utf-8");
  const lines = raw.trim().split("\n");
  if (lines.length <= keepLast) return null; // Nothing to compress

  const originalSize = lines.length;

  // Parse all messages
  const parsed: { line: string; obj: any }[] = [];
  for (const line of lines) {
    try {
      parsed.push({ line, obj: JSON.parse(line) });
    } catch {
      parsed.push({ line, obj: null });
    }
  }

  // Find the cutoff: keep last N user/assistant messages plus surrounding system messages
  const userAssistantIndices: number[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const t = parsed[i].obj?.type;
    if (t === "user" || t === "assistant") {
      userAssistantIndices.push(i);
    }
  }

  if (userAssistantIndices.length <= keepLast) return null;

  const cutoffIndex = userAssistantIndices[userAssistantIndices.length - keepLast];

  // Extract summary from old messages (before cutoff)
  const oldMessages = parsed.slice(0, cutoffIndex);
  const summaryParts: string[] = [];

  const userQuestions: string[] = [];
  const assistantActions: string[] = [];
  const filesTouched = new Set<string>();
  const decisions: string[] = [];

  for (const { obj } of oldMessages) {
    if (!obj) continue;

    if (obj.type === "user" && obj.message?.content) {
      // Only extract plain-text user messages (skip tool results)
      if (typeof obj.message.content === "string") {
        const preview = obj.message.content.slice(0, 200).replace(/\n/g, " ");
        if (preview.trim() && !userQuestions.includes(preview)) {
          userQuestions.push(preview);
        }
        // Detect decisions
        if (/^(是|对|好|可以|行|ok|yes|确认|同意)/i.test(preview.trim())) {
          decisions.push(preview.trim().slice(0, 80));
        }
      }
    }

    if (obj.type === "assistant" && obj.message?.content) {
      // Extract non-tool-call text content
      const blocks = Array.isArray(obj.message.content) ? obj.message.content : [{ type: "text", text: obj.message.content }];
      for (const block of blocks) {
        if (block.type === "text" && block.text) {
          const text = block.text.slice(0, 150).replace(/\n/g, " ");
          if (text.trim()) {
            assistantActions.push(text);
            break;
          }
        }
        if (block.type === "tool_use") {
          if (block.name === "Write" || block.name === "Edit") {
            const fp = block.input?.file_path;
            if (fp) filesTouched.add(fp);
          }
          assistantActions.push(`[${block.name}]`);
        }
      }
    }

  }

  // Build summary header
  summaryParts.push("=== 对话压缩摘要 ===");
  summaryParts.push(`压缩时间: ${new Date().toISOString()}`);
  summaryParts.push(`原始消息数: ${originalSize}, 保留最近: ${keepLast} 轮`);
  summaryParts.push("");

  if (userQuestions.length > 0) {
    summaryParts.push("## 用户请求历史");
    const sampled = userQuestions.length <= 15
      ? userQuestions
      : userQuestions.slice(0, 5).concat(
          ["... (省略中间部分) ..."],
          userQuestions.slice(-10)
        );
    for (const q of sampled) {
      summaryParts.push(`- ${q}`);
    }
    summaryParts.push("");
  }

  if (filesTouched.size > 0) {
    summaryParts.push("## 涉及文件");
    for (const f of [...filesTouched].slice(0, 20)) {
      summaryParts.push(`- ${f}`);
    }
    summaryParts.push("");
  }

  if (decisions.length > 0) {
    summaryParts.push("## 关键确认/决策");
    for (const d of [...new Set(decisions)].slice(0, 10)) {
      summaryParts.push(`- ${d}`);
    }
    summaryParts.push("");
  }

  summaryParts.push("---");
  summaryParts.push("以下是保留的最近对话消息:");
  summaryParts.push("");

  const summaryText = summaryParts.join("\n");

  // Create backup before modifying
  const backupPath = `${filePath}.backup-${Date.now()}`;
  fs.copyFileSync(filePath, backupPath);

  // Collect UUIDs of all kept messages (for parentUuid repair)
  const keptUuids = new Set<string>();
  const keptMessageObjs: any[] = [];
  for (let i = cutoffIndex; i < parsed.length; i++) {
    if (parsed[i].obj?.uuid) keptUuids.add(parsed[i].obj.uuid);
    keptMessageObjs.push(parsed[i].obj);
  }

  // Find a real user message to use as field template for the summary
  let template: any = {
    cwd: HOME_DIR,
    entrypoint: "claude",
    gitBranch: "",
    isSidechain: false,
    parentUuid: null,
    permissionMode: "default",
    sessionId: id,
    timestamp: new Date().toISOString(),
    userType: "external",
    version: "1.0",
  };
  for (let i = 0; i < parsed.length; i++) {
    const obj = parsed[i].obj;
    if (obj?.type === "user" && obj?.message?.content && typeof obj.message.content === "string" && !obj.uuid?.startsWith("compress-")) {
      template = {
        cwd: obj.cwd || HOME_DIR,
        entrypoint: obj.entrypoint || "claude",
        gitBranch: obj.gitBranch || "",
        isSidechain: false,
        parentUuid: null,
        permissionMode: obj.permissionMode || "default",
        sessionId: id,
        userType: obj.userType || "external",
        version: obj.version || "1.0",
      };
      break;
    }
  }

  // Find the first real user message to preserve (for title continuity)
  let firstUserMsg: string | null = null;
  let firstUserIdx = -1;
  for (let i = 0; i < parsed.length; i++) {
    const obj = parsed[i].obj;
    if (obj?.type === "user" && obj?.message?.content && typeof obj.message.content === "string" && !obj.uuid?.startsWith("compress-")) {
      firstUserMsg = parsed[i].line;
      firstUserIdx = i;
      break;
    }
  }

  // Build kept lines
  const keptLines: string[] = [];

  // Preserve the first user message (for title)
  if (firstUserMsg && firstUserIdx < cutoffIndex) {
    keptLines.push(firstUserMsg);
    if (parsed[firstUserIdx].obj?.uuid) keptUuids.add(parsed[firstUserIdx].obj.uuid);
  }

  // Inject summary with all required fields
  const summaryUuid = `compress-${Date.now()}`;
  keptUuids.add(summaryUuid);
  const summaryLine = JSON.stringify({
    ...template,
    parentUuid: null,
    isSidechain: false,
    promptId: summaryUuid,
    type: "user",
    message: {
      role: "user",
      content: summaryText,
    },
    uuid: summaryUuid,
    timestamp: new Date().toISOString(),
    sessionId: id,
  });
  keptLines.push(summaryLine);

  // Add all messages from the cutoff point, repairing orphaned parentUuids
  for (let i = cutoffIndex; i < parsed.length; i++) {
    // Skip the first user message if already added
    if (i === firstUserIdx) continue;

    const obj = parsed[i].obj;
    let line = parsed[i].line;

    // Repair broken parentUuid references
    if (obj && obj.parentUuid && !keptUuids.has(obj.parentUuid) && !obj.parentUuid.startsWith("compress-")) {
      try {
        const fixed = JSON.parse(line);
        fixed.parentUuid = summaryUuid;
        line = JSON.stringify(fixed);
      } catch {
        // Leave line as-is if parsing fails
      }
    }

    keptLines.push(line);
  }

  const compressedContent = keptLines.join("\n") + "\n";
  fs.writeFileSync(filePath, compressedContent);

  const keptLineCount = keptLines.length;

  const result: CompressResult = {
    originalSize,
    compressedSize: keptLineCount,
    removedCount: originalSize - keptLineCount + 1, // +1 for added summary
    keptCount: keptLineCount - 1, // exclude summary from kept count
    summaryLength: summaryText.length,
    backupPath,
  };

  return result;
}

const DEEPSEEK_DEFAULT_URL = "https://api.deepseek.com/v1/chat/completions";
const DEEPSEEK_DEFAULT_MODEL = "deepseek-v4-pro";

function loadDeepSeekConfig(): { apiKey: string; baseUrl: string; model: string } {
  try {
    if (fs.existsSync(API_CONFIGS_PATH)) {
      const configs: Array<{ name: string; format: string; baseUrl: string; apiKey: string; model: string }> =
        JSON.parse(fs.readFileSync(API_CONFIGS_PATH, "utf-8"));
      const pro = configs.find((c) => c.model?.includes("pro")) || configs[0];
      if (pro?.apiKey) {
        // Convert anthropic-format base URL to OpenAI-compatible chat completions URL
        const baseUrl = pro.baseUrl.replace(/\/anthropic$/, "/v1/chat/completions");
        return { apiKey: pro.apiKey, baseUrl, model: pro.model || DEEPSEEK_DEFAULT_MODEL };
      }
    }
  } catch {}
  return { apiKey: "", baseUrl: DEEPSEEK_DEFAULT_URL, model: DEEPSEEK_DEFAULT_MODEL };
}

const COMPRESS_SCHEMA = {
  type: "object",
  properties: {
    _meta: {
      type: "object",
      properties: {
        version: { type: "integer" },
        compressed_at: { type: "string" },
        original_turns: { type: "integer" },
      },
    },
    context: {
      type: "object",
      properties: {
        goal: { type: "string" },
        domain: { type: "string" },
        constraints: { type: "array", items: { type: "string" } },
      },
    },
    progress: {
      type: "object",
      properties: {
        done: { type: "array", items: { type: "string" } },
        current: { type: "string" },
        blocked_by: { type: "string" },
        next: { type: "array", items: { type: "string" } },
      },
    },
    decisions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          decision: { type: "string" },
          reason: { type: "string" },
          alternatives_rejected: { type: "array", items: { type: "string" } },
        },
      },
    },
    artifacts: {
      type: "object",
      properties: {
        files: { type: "object" },
        code_blocks: { type: "object" },
      },
    },
    uncertain: { type: "array", items: { type: "string" } },
  },
};

function buildTranscript(oldMessages: { line: string; obj: any }[]): string {
  const lines: string[] = [];
  for (const { obj } of oldMessages) {
    if (!obj) continue;
    if (obj.type === "user" && obj.message?.content) {
      const content = typeof obj.message.content === "string"
        ? obj.message.content
        : Array.isArray(obj.message.content)
          ? obj.message.content
              .filter((b: any) => b.type === "text" && b.text)
              .map((b: any) => b.text)
              .join("\n")
          : "";
      if (content.trim()) {
        lines.push(`用户: ${content.slice(0, 800)}`);
      }
    } else if (obj.type === "assistant" && obj.message?.content) {
      const blocks = Array.isArray(obj.message.content)
        ? obj.message.content
        : [{ type: "text", text: obj.message.content }];
      const texts: string[] = [];
      const tools: string[] = [];
      for (const b of blocks) {
        if (b.type === "text" && b.text) texts.push(b.text);
        if (b.type === "tool_use") tools.push(b.name);
      }
      if (texts.length > 0) {
        lines.push(`助手: ${texts.join(" ").slice(0, 500)}`);
      }
      if (tools.length > 0) {
        lines.push(`[调用工具: ${tools.join(", ")}]`);
      }
    }
  }
  // Truncate to avoid excessive tokens (max ~40K chars)
  const joined = lines.join("\n");
  if (joined.length <= 40000) return joined;
  return joined.slice(0, 20000) + "\n... (中间省略) ...\n" + joined.slice(-20000);
}

async function callDeepSeekForSummary(transcript: string): Promise<string> {
  const { apiKey, baseUrl, model } = loadDeepSeekConfig();
  if (!apiKey) throw new Error("DeepSeek API key not configured in ~/.claude-api-configs.json");

  const prompt = `请将以下对话历史压缩为 JSON 格式，严格遵循下方 schema。

规则：
- 只保留有内容的字段，空的直接删除
- 代码统一放在 artifacts.code_blocks 里，用 ref:block_N 引用
- uncertain 只记录真正模糊/未确认的信息
- 重要：直接输出 JSON 对象作为你的回复，不要用 markdown 代码块包裹，不要任何前缀或后缀说明文字
- 回复必须以 { 开头，以 } 结尾

Schema:
${JSON.stringify(COMPRESS_SCHEMA, null, 2)}

对话历史：
${transcript}`;

  const res = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 4096,
      temperature: 0.1,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DeepSeek API error ${res.status}: ${err.slice(0, 200)}`);
  }

  const data: any = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("DeepSeek returned empty response");
  return content;
}

function extractJsonFromResponse(response: string): string {
  // Strip markdown code blocks if present
  const codeBlock = response.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (codeBlock) return codeBlock[1].trim();
  // Try to find JSON object
  const jsonMatch = response.match(/(\{[\s\S]*\})/);
  if (jsonMatch) return jsonMatch[1].trim();
  return response.trim();
}

function formatSummaryFromJson(jsonStr: string): string {
  let data: any;
  try {
    data = JSON.parse(jsonStr);
  } catch {
    // If JSON parse fails, return the raw string as summary
    return "=== AI 对话压缩 ===\n" + jsonStr.slice(0, 3000);
  }

  const lines: string[] = [];
  lines.push("=== AI 对话压缩摘要 ===");

  const ctx = data.context;
  if (ctx) {
    if (ctx.goal) lines.push(`\n🎯 目标: ${ctx.goal}`);
    if (ctx.domain) lines.push(`📂 领域: ${ctx.domain}`);
    if (ctx.constraints?.length) {
      lines.push("📏 约束:");
      ctx.constraints.forEach((c: string) => lines.push(`   - ${c}`));
    }
  }

  const prog = data.progress;
  if (prog) {
    if (prog.done?.length) {
      lines.push("\n✅ 已完成:");
      prog.done.forEach((d: string) => lines.push(`   - ${d}`));
    }
    if (prog.current) lines.push(`\n🔄 当前: ${prog.current}`);
    if (prog.blocked_by) lines.push(`⚠️ 阻塞: ${prog.blocked_by}`);
    if (prog.next?.length) {
      lines.push("📋 下一步:");
      prog.next.forEach((n: string) => lines.push(`   - ${n}`));
    }
  }

  if (data.decisions?.length) {
    lines.push("\n🔧 关键决策:");
    data.decisions.forEach((d: any) => {
      lines.push(`   - ${d.decision} (原因: ${d.reason})`);
      if (d.alternatives_rejected?.length) {
        lines.push(`     备选方案: ${d.alternatives_rejected.join(", ")}`);
      }
    });
  }

  const art = data.artifacts;
  if (art) {
    if (art.files && Object.keys(art.files).length > 0) {
      lines.push("\n📁 涉及文件:");
      for (const [name, ref] of Object.entries(art.files)) {
        const code = art.code_blocks?.[String(ref).replace("ref:", "")];
        if (code) {
          lines.push(`   ${name}:\n\`\`\`\n${String(code).slice(0, 2000)}\n\`\`\``);
        } else {
          lines.push(`   ${name}`);
        }
      }
    }
  }

  if (data.uncertain?.length) {
    lines.push("\n❓ 待确认:");
    data.uncertain.forEach((u: string) => lines.push(`   - ${u}`));
  }

  lines.push("\n---");
  lines.push("以下是保留的最近对话消息:");

  return lines.join("\n");
}

function stripThinkingFromLine(line: string): string {
  try {
    const obj = JSON.parse(line);
    const msg = obj.message;
    if (msg && Array.isArray(msg.content) && obj.type === "assistant") {
      const filtered = msg.content.filter((b: any) =>
        b.type === "text" || b.type === "tool_use" || b.type === "tool_result"
      );
      if (filtered.length < msg.content.length) {
        if (filtered.length === 0) {
          filtered.push({ type: "text", text: "[Thinking removed]" });
        }
        obj.message = { ...msg, content: filtered };
        return JSON.stringify(obj);
      }
    }
  } catch {}
  return line;
}

/**
 * Swap model references in a JSONL line between API (deepseek-v4-pro) and
 * subscription (claude-sonnet-4-6), AND strip thinking blocks from assistant
 * messages. This prevents "Invalid signature in thinking block" errors after
 * provider switches — thinking signatures are cryptographically bound to the
 * model that generated them.
 */
function swapModelInLine(line: string, toProvider: "api" | "subscription"): string {
  const fromModel = toProvider === "api" ? "claude-sonnet-4-6" : "deepseek-v4-pro";
  const toModel = toProvider === "api" ? "deepseek-v4-pro" : "claude-sonnet-4-6";

  // First strip thinking blocks
  let stripped = stripThinkingFromLine(line);
  if (!stripped.trim()) return stripped;

  try {
    const obj = JSON.parse(stripped);

    // Swap top-level model
    if (obj.model === fromModel) obj.model = toModel;

    // Swap message.model (the SDK reads this on resume)
    if (obj.message && typeof obj.message === "object") {
      if (obj.message.model === fromModel) {
        obj.message.model = toModel;
      }
    }

    // Also swap any nested stringified model references inside content text
    // (Some SDK versions store model in content metadata)
    if (Array.isArray(obj.message?.content)) {
      for (const block of obj.message.content) {
        if (block && typeof block === "object" && block.model === fromModel) {
          block.model = toModel;
        }
      }
    }

    return JSON.stringify(obj);
  } catch {
    return stripped;
  }
}

/**
 * Strip thinking blocks and swap models for an entire JSONL session file.
 * Returns number of lines changed.
 */
function processSessionForProvider(filePath: string, toProvider: "api" | "subscription"): number {
  const sid = path.basename(filePath, ".jsonl");
  const raw = fs.readFileSync(filePath, "utf-8");
  const lines = raw.trim().split("\n");
  let changed = 0;
  let thinkingStripped = 0;
  let modelSwapped = 0;

  const processed = lines.map((line, idx) => {
    const hadThinking = line.includes('"type":"thinking"');
    const result = swapModelInLine(line, toProvider);
    if (result !== line) {
      changed++;
      if (hadThinking && !result.includes('"type":"thinking"')) thinkingStripped++;
      if (result.includes(`"model":"${toProvider === "api" ? "deepseek-v4-pro" : "claude-sonnet-4-6"}"`)) modelSwapped++;
    }
    return result;
  });

  console.log(`[processSessionForProvider] sid=${sid} to=${toProvider} lines=${lines.length} changed=${changed} thinkingStripped=${thinkingStripped} modelSwapped=${modelSwapped}`);

  if (changed > 0) {
    const backupPath = `${filePath}.backup-pre-switch-${Date.now()}`;
    fs.copyFileSync(filePath, backupPath);
    fs.writeFileSync(filePath, processed.join("\n"));
    console.log(`[processSessionForProvider] sid=${sid} backup=${backupPath} written=${processed.length} lines`);
  }

  return changed;
}

export async function aiCompressSession(id: string, keepLast = 100, stripThinking = false): Promise<CompressResult | null> {
  const filePath = path.join(SESSIONS_DIR, `${id}.jsonl`);
  if (!fs.existsSync(filePath)) return null;

  const raw = fs.readFileSync(filePath, "utf-8");
  const lines = raw.trim().split("\n");

  // Auto-detect if thinking blocks need stripping (regardless of flag)
  const hasThinkingBlocks = lines.some((l) => l.includes('"type":"thinking"'));
  const shouldStrip = stripThinking || hasThinkingBlocks;

  // If session only needs thinking stripped (small or user requested), do just that
  if (shouldStrip && (lines.length <= 20 || (stripThinking && lines.length <= keepLast))) {
    const stripped = lines.map((l) => stripThinkingFromLine(l)).filter((l) => l.trim());
    const linesChanged = stripped.some((s, i) => s !== lines[i]) || stripped.length !== lines.length;
    if (!linesChanged && !stripThinking) return null; // Nothing to do
    const backupPath = `${filePath}.backup-${Date.now()}`;
    fs.copyFileSync(filePath, backupPath);
    fs.writeFileSync(filePath, stripped.join("\n"));
    updateSessionMeta(id, { lastCompressedLineCount: stripped.length });
    return {
      originalSize: lines.length,
      compressedSize: stripped.length,
      removedCount: lines.length - stripped.length,
      keptCount: stripped.length,
      summaryLength: 0,
      backupPath,
    };
  }

  // For larger sessions, check if compression is needed
  const effectiveKeep = Math.min(keepLast, Math.max(10, Math.floor(lines.length * 0.6)));
  if (lines.length <= effectiveKeep) return null;

  const originalSize = lines.length;

  // Parse all messages
  const parsed: { line: string; obj: any }[] = [];
  for (const line of lines) {
    try {
      parsed.push({ line, obj: JSON.parse(line) });
    } catch {
      parsed.push({ line, obj: null });
    }
  }

  // Count user/assistant messages for cutoff
  const userAssistantIndices: number[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const t = parsed[i].obj?.type;
    if (t === "user" || t === "assistant") {
      userAssistantIndices.push(i);
    }
  }

  if (userAssistantIndices.length <= effectiveKeep && !shouldStrip) return null;
  // If thinking blocks need stripping but session is too small for summary, just strip and return
  if (userAssistantIndices.length <= effectiveKeep && shouldStrip) {
    const stripped = lines.map((l) => stripThinkingFromLine(l)).filter((l) => l.trim());
    fs.writeFileSync(filePath, stripped.join("\n"));
    updateSessionMeta(id, { lastCompressedLineCount: stripped.length });
    return {
      originalSize: lines.length,
      compressedSize: stripped.length,
      removedCount: lines.length - stripped.length,
      keptCount: stripped.length,
      summaryLength: 0,
      backupPath: "",
    };
  }
  const cutoffIndex = userAssistantIndices[userAssistantIndices.length - effectiveKeep];

  // Extract old messages and build transcript
  const oldMessages = parsed.slice(0, cutoffIndex);
  const transcript = buildTranscript(oldMessages);

  // Call DeepSeek to summarize
  console.log(`[ai-compress] Summarizing ${oldMessages.length} old messages for session ${id}...`);
  const claudeResponse = await callDeepSeekForSummary(transcript);
  const jsonStr = extractJsonFromResponse(claudeResponse);
  const summaryText = formatSummaryFromJson(jsonStr);
  console.log(`[ai-compress] Summary: ${summaryText.length} chars`);

  // --- File reconstruction (same logic as compressSession) ---

  const backupPath = `${filePath}.backup-${Date.now()}`;
  fs.copyFileSync(filePath, backupPath);

  // Collect UUIDs of kept messages
  const keptUuids = new Set<string>();
  for (let i = cutoffIndex; i < parsed.length; i++) {
    if (parsed[i].obj?.uuid) keptUuids.add(parsed[i].obj.uuid);
  }

  // Get template fields from a real message
  let template: any = {
    cwd: HOME_DIR,
    entrypoint: "claude",
    gitBranch: "",
    isSidechain: false,
    parentUuid: null,
    permissionMode: "default",
    sessionId: id,
    userType: "external",
    version: "1.0",
  };
  for (let i = 0; i < parsed.length; i++) {
    const obj = parsed[i].obj;
    if (obj?.type === "user" && obj?.message?.content && typeof obj.message.content === "string" && !obj.uuid?.startsWith("compress-")) {
      template = {
        cwd: obj.cwd || HOME_DIR,
        entrypoint: obj.entrypoint || "claude",
        gitBranch: obj.gitBranch || "",
        isSidechain: false,
        parentUuid: null,
        permissionMode: obj.permissionMode || "default",
        sessionId: id,
        userType: obj.userType || "external",
        version: obj.version || "1.0",
      };
      break;
    }
  }

  // Find first real user message
  let firstUserMsg: string | null = null;
  let firstUserIdx = -1;
  for (let i = 0; i < parsed.length; i++) {
    const obj = parsed[i].obj;
    if (obj?.type === "user" && obj?.message?.content && typeof obj.message.content === "string" && !obj.uuid?.startsWith("compress-")) {
      firstUserMsg = parsed[i].line;
      firstUserIdx = i;
      break;
    }
  }

  // Build output
  const keptLines: string[] = [];
  if (firstUserMsg && firstUserIdx < cutoffIndex) {
    keptLines.push(firstUserMsg);
    if (parsed[firstUserIdx].obj?.uuid) keptUuids.add(parsed[firstUserIdx].obj.uuid);
  }

  const summaryUuid = `compress-${Date.now()}`;
  keptUuids.add(summaryUuid);
  const summaryLine = JSON.stringify({
    ...template,
    parentUuid: null,
    isSidechain: false,
    promptId: summaryUuid,
    type: "system",
    message: {
      role: "system",
      content: summaryText,
    },
    uuid: summaryUuid,
    timestamp: new Date().toISOString(),
    sessionId: id,
  });
  keptLines.push(summaryLine);

  // Add kept messages, repairing orphaned parentUuids
  for (let i = cutoffIndex; i < parsed.length; i++) {
    if (i === firstUserIdx) continue;
    const obj = parsed[i].obj;
    let line = parsed[i].line;
    if (obj && obj.parentUuid && !keptUuids.has(obj.parentUuid) && !String(obj.parentUuid).startsWith("compress-")) {
      try {
        const fixed = JSON.parse(line);
        fixed.parentUuid = summaryUuid;
        line = JSON.stringify(fixed);
      } catch {}
    }
    if (shouldStrip) {
      line = stripThinkingFromLine(line);
    }
    keptLines.push(line);
  }

  fs.writeFileSync(filePath, keptLines.join("\n") + "\n");

  const keptLineCount = keptLines.length;
  updateSessionMeta(id, { lastCompressedLineCount: keptLineCount });
  return {
    originalSize,
    compressedSize: keptLineCount,
    removedCount: originalSize - keptLineCount + 1,
    keptCount: keptLineCount - 1,
    summaryLength: summaryText.length,
    backupPath,
  };
}

export function deleteSession(id: string): boolean {
  const jsonlPath = path.join(SESSIONS_DIR, `${id}.jsonl`);
  const dirPath = path.join(SESSIONS_DIR, id);
  let deleted = false;

  if (fs.existsSync(jsonlPath)) {
    fs.unlinkSync(jsonlPath);
    deleted = true;
  }

  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }

  const meta = loadMetadata();
  delete meta.sessions[id];
  saveMetadata(meta);

  return deleted;
}

export function detectProvider(id: string): { provider: string; models: string[]; dominantProvider: string; preferredProvider?: string } {
  const meta = loadMetadata();
  const sessionMeta = meta.sessions[id];

  // If session has a stored preference, use it
  if (sessionMeta?.preferredProvider) {
    return {
      provider: sessionMeta.preferredProvider,
      models: [],
      dominantProvider: sessionMeta.preferredProvider,
      preferredProvider: sessionMeta.preferredProvider,
    };
  }

  const filePath = path.join(SESSIONS_DIR, `${id}.jsonl`);
  if (!fs.existsSync(filePath)) return { provider: "unknown", models: [], dominantProvider: "unknown" };

  const raw = fs.readFileSync(filePath, "utf-8");
  const models = new Set<string>();
  let apiCount = 0;
  let subCount = 0;

  for (const line of raw.trim().split("\n")) {
    try {
      const d = JSON.parse(line);
      if (d.model) {
        models.add(d.model);
        if (d.model.startsWith("claude-")) subCount++;
        else if (d.model.startsWith("deepseek-")) apiCount++;
      }
      if (d.message?.model) {
        models.add(d.message.model);
        if (d.message.model.startsWith("claude-")) subCount++;
        else if (d.message.model.startsWith("deepseek-")) apiCount++;
      }
    } catch {}
  }

  let provider: string;
  let dominantProvider: string;
  if (apiCount > 0 && subCount > 0) {
    provider = "mixed";
    dominantProvider = apiCount >= subCount ? "api" : "subscription";
  } else if (apiCount > 0) {
    provider = "api";
    dominantProvider = "api";
  } else if (subCount > 0) {
    provider = "subscription";
    dominantProvider = "subscription";
  } else {
    provider = "unknown";
    dominantProvider = "unknown";
  }

  return { provider, models: [...models], dominantProvider };
}

/**
 * Apply a session's preferred provider to the global settings files.
 * This ensures the next Claude process spawned for this session uses the right config.
 * Returns a snapshot of the previous state for rollback.
 */
export function applySessionProviderToSettings(id: string): { applied: boolean; snapshot?: { settings: any; credentials: any; claudeJson: any } } {
  const meta = loadMetadata();
  const sessionMeta = meta.sessions[id];
  if (!sessionMeta?.preferredProvider) return { applied: false };

  // Snapshot current state for rollback
  const snapshot = {
    settings: readJson(SETTINGS_PATH),
    credentials: fs.existsSync(CREDENTIALS_PATH) ? readJson(CREDENTIALS_PATH) : null,
    claudeJson: readJson(CLAUDE_JSON_PATH),
  };

  if (sessionMeta.preferredProvider === "api") {
    // Merge session config with users store (for API key fallback)
    const usersStore = readJson(USERS_PATH);
    const apiKey = sessionMeta.sessionApiConfig?.apiKey || usersStore?.apiConfig?.apiKey || "";
    const baseUrl = sessionMeta.sessionApiConfig?.baseUrl || usersStore?.apiConfig?.baseUrl || "https://api.deepseek.com/anthropic";
    const model = sessionMeta.sessionApiConfig?.model || usersStore?.apiConfig?.model || "deepseek-v4-pro";

    if (!apiKey) return { applied: false }; // No API key available

    // Apply API config to settings.json
    const settings = readJson(SETTINGS_PATH);
    if (!settings.env) settings.env = {};
    delete settings.env.ANTHROPIC_BASE_URL;
    delete settings.env.ANTHROPIC_AUTH_TOKEN;
    delete settings.env.ANTHROPIC_MODEL;
    delete settings.env.API_TIMEOUT_MS;
    settings.env.ANTHROPIC_BASE_URL = baseUrl;
    settings.env.ANTHROPIC_AUTH_TOKEN = apiKey;
    settings.env.ANTHROPIC_MODEL = model;
    settings.env.API_TIMEOUT_MS = "3000000";
    writeJson(SETTINGS_PATH, settings);

    // Clear OAuth credentials
    try { fs.unlinkSync(CREDENTIALS_PATH); } catch {}

    // Clear claude.json oauth account if needed
    try {
      const cj = readJson(CLAUDE_JSON_PATH);
      if (cj.oauthAccount) {
        delete cj.oauthAccount;
        writeJson(CLAUDE_JSON_PATH, cj);
      }
    } catch {}

    return { applied: true, snapshot };
  }

  if (sessionMeta.preferredProvider === "subscription" && sessionMeta.sessionProfile) {
    // Restore profile to active location
    const profileDir = path.join(PROFILES_DIR, sessionMeta.sessionProfile);
    const profileClaude = path.join(profileDir, "claude.json");
    const profileCreds = path.join(profileDir, "credentials.json");

    if (fs.existsSync(profileClaude)) {
      // Clear API env from settings
      const settings = readJson(SETTINGS_PATH);
      if (settings.env) {
        delete settings.env.ANTHROPIC_BASE_URL;
        delete settings.env.ANTHROPIC_AUTH_TOKEN;
        delete settings.env.ANTHROPIC_MODEL;
        delete settings.env.API_TIMEOUT_MS;
        if (Object.keys(settings.env).length === 0) delete settings.env;
        writeJson(SETTINGS_PATH, settings);
      }

      // Restore profile files
      fs.copyFileSync(profileClaude, CLAUDE_JSON_PATH);
      if (fs.existsSync(profileCreds)) {
        fs.copyFileSync(profileCreds, CREDENTIALS_PATH);
      }
      return { applied: true, snapshot };
    }
  }

  return { applied: false };
}

/**
 * Restore a previous settings state (after session launch).
 */
export function restoreSettingsSnapshot(snapshot: { settings: any; credentials: any; claudeJson: any }): void {
  writeJson(SETTINGS_PATH, snapshot.settings);
  if (snapshot.credentials) {
    writeJson(CREDENTIALS_PATH, snapshot.credentials);
    try { fs.chmodSync(CREDENTIALS_PATH, 0o600); } catch {}
  } else {
    try { fs.unlinkSync(CREDENTIALS_PATH); } catch {}
  }
  writeJson(CLAUDE_JSON_PATH, snapshot.claudeJson);
}

/**
 * Returns true if any active session (other than the triggering one) has
 * an unanswered user message — meaning the SDK is currently processing.
 * Global mode switch would disrupt these sessions mid-stream.
 */
function otherSessionsInProgress(triggeringId: string): string[] {
  const activeIds = getActiveSessionIds();
  const processing: string[] = [];
  for (const sid of activeIds) {
    if (sid === triggeringId) continue;
    try {
      const fp = path.join(SESSIONS_DIR, `${sid}.jsonl`);
      if (!fs.existsSync(fp)) continue;
      const raw = fs.readFileSync(fp, "utf-8").trim();
      if (!raw) continue;
      const lastLine = raw.split("\n").pop() || "";
      const obj = JSON.parse(lastLine);
      // Last message is from user and hasn't been answered yet
      if (obj?.type === "user") {
        processing.push(sid);
      }
    } catch {}
  }
  return processing;
}

/**
 * Get all sessions currently "in progress" (last message is an unanswered user message).
 * Returns full metadata for the dialog UI.
 */
export function getProcessingSessions(triggeringSessionId?: string): Array<{
  id: string;
  customName?: string;
  title: string;
  currentMode: string;
  messageCount: number;
}> {
  const activeIds = getActiveSessionIds();
  const results: Array<{
    id: string;
    customName?: string;
    title: string;
    currentMode: string;
    messageCount: number;
  }> = [];

  for (const sid of activeIds) {
    if (sid === triggeringSessionId) continue;
    try {
      const fp = path.join(SESSIONS_DIR, `${sid}.jsonl`);
      if (!fs.existsSync(fp)) continue;
      const raw = fs.readFileSync(fp, "utf-8").trim();
      if (!raw) continue;
      const lines = raw.split("\n");
      const lastLine = lines[lines.length - 1] || "";
      const obj = JSON.parse(lastLine);
      if (obj?.type !== "user") continue;

      // Get session metadata
      const meta = loadMetadata();
      const sessionMeta = meta.sessions[sid];
      const firstMessage = extractFirstMessage(lines);

      results.push({
        id: sid,
        customName: sessionMeta?.customName,
        title: firstMessage.slice(0, 80) || "Untitled",
        currentMode: sessionMeta?.preferredProvider || "unknown",
        messageCount: lines.length,
      });
    } catch {}
  }

  return results;
}

function extractFirstMessage(lines: string[]): string {
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (obj?.message?.role === "user" && obj?.message?.content) {
        const content = obj.message.content;
        if (typeof content === "string") return content.slice(0, 120);
        if (Array.isArray(content)) {
          const textBlock = content.find((b: any) => b.type === "text");
          if (textBlock?.text) return textBlock.text.slice(0, 120);
        }
      }
    } catch {}
  }
  return "";
}

/**
 * Force-unstick a session by injecting a synthetic assistant acknowledgment.
 * This makes the "last message is user" check pass, unblocking global switches.
 */
export function forceUnstickSession(sessionId: string): boolean {
  const filePath = path.join(SESSIONS_DIR, `${sessionId}.jsonl`);
  if (!fs.existsSync(filePath)) return false;

  const marker = {
    type: "system",
    timestamp: new Date().toISOString(),
    cwd: HOME_DIR,
    sessionId,
    message: {
      role: "assistant",
      content: "[Session forcibly marked as resolved by admin to allow mode switch.]",
    },
    forceUnstuck: true,
    isSynthetic: true,
  };

  fs.appendFileSync(filePath, JSON.stringify(marker) + "\n");
  return true;
}

/**
 * Switch the global provider mode. Updates ~/.claude/settings.json and
 * credentials, then compresses all active sessions so their thinking blocks
 * are compatible with the new mode.
 *
 * Returns null on success, or a list of in-progress session IDs if blocked.
 */
export function switchGlobalMode(toMode: "api" | "subscription"): string[] | null {
  console.log(`[switch-global] START toMode=${toMode}`);

  // Block if any session is processing (no triggering session to exclude)
  const allActive = getActiveSessionIds();
  console.log(`[switch-global] activeSessionIds=${JSON.stringify(allActive)}`);

  const processing: string[] = [];
  for (const sid of allActive) {
    try {
      const fp = path.join(SESSIONS_DIR, `${sid}.jsonl`);
      if (!fs.existsSync(fp)) continue;
      const raw = fs.readFileSync(fp, "utf-8").trim();
      if (!raw) continue;
      const obj = JSON.parse(raw.split("\n").pop() || "");
      if (obj?.type === "user") processing.push(sid);
    } catch {}
  }
  if (processing.length > 0) {
    console.log(`[switch-global] BLOCKED: ${processing.length} session(s) waiting for response: ${JSON.stringify(processing)}`);
    return processing;
  }

  const usersStore = readJson(USERS_PATH);
  const settings = JSON.parse(JSON.stringify(readJson(SETTINGS_PATH) || {}));
  if (!settings.env) settings.env = {};

  if (toMode === "api") {
    const apiKey = usersStore?.apiConfig?.apiKey || "";
    const baseUrl = usersStore?.apiConfig?.baseUrl || "https://api.deepseek.com/anthropic";
    const model = usersStore?.apiConfig?.model || "deepseek-v4-pro";
    settings.env.ANTHROPIC_BASE_URL = baseUrl;
    settings.env.ANTHROPIC_AUTH_TOKEN = apiKey;
    settings.env.ANTHROPIC_MODEL = model;
    settings.env.API_TIMEOUT_MS = "3000000";
    writeJson(SETTINGS_PATH, settings);
    try { fs.unlinkSync(CREDENTIALS_PATH); } catch {}
    try { fs.unlinkSync(CLAUDE_JSON_PATH); } catch {}
  } else {
    delete settings.env.ANTHROPIC_BASE_URL;
    delete settings.env.ANTHROPIC_AUTH_TOKEN;
    delete settings.env.API_TIMEOUT_MS;
    settings.env.ANTHROPIC_MODEL = "claude-sonnet-4-6";
    writeJson(SETTINGS_PATH, settings);

    // Restore OAuth credentials from active profile (with auto-fallback)
    let profile = usersStore?.activeProfile;
    if (!profile) {
      try {
        const entries = fs.readdirSync(PROFILES_DIR).filter((e: string) =>
          fs.statSync(path.join(PROFILES_DIR, e)).isDirectory()
        ).sort();
        if (entries.length > 0) profile = entries[0];
      } catch {}
    }
    if (profile) {
      const profileCreds = path.join(PROFILES_DIR, profile, "credentials.json");
      if (fs.existsSync(profileCreds)) {
        try { fs.unlinkSync(CREDENTIALS_PATH); } catch {}
        try { fs.symlinkSync(profileCreds, CREDENTIALS_PATH); } catch {}
      }
      const profileClaude = path.join(PROFILES_DIR, profile, "claude.json");
      if (fs.existsSync(profileClaude)) {
        fs.copyFileSync(profileClaude, CLAUDE_JSON_PATH);
      }
      usersStore.activeProfile = profile;
    }
  }

  // Update users store
  usersStore.activeMode = toMode;
  writeJson(USERS_PATH, usersStore);

  console.log(`[switch-global] Mode → ${toMode}`);

  // Synchronously strip thinking blocks and swap model references in all active
  // sessions so they are safe to resume with the new provider. Must finish BEFORE
  // restartAllSessions fires; otherwise freshly-resumed sessions will send
  // thinking blocks from the old model to the new provider → signature mismatch.
  {
    const targets = getActiveSessionIds();
    console.log(`[switch-global] processing ${targets.length} active sessions before restart`);
    let stripped = 0;
    for (const sid of targets) {
      try {
        const fp = path.join(SESSIONS_DIR, `${sid}.jsonl`);
        if (fs.existsSync(fp)) {
          const changed = processSessionForProvider(fp, toMode);
          if (changed > 0) stripped++;
        }
      } catch (e) {
        console.log(`[switch-global] ERROR processing sid=${sid}: ${(e as Error).message}`);
      }
    }
    console.log(`[switch-global] Synced ${stripped}/${targets.length} session(s) to ${toMode}`);
  }

  // Compress active sessions in background (summarize old messages)
  setTimeout(() => {
    const targets = getActiveSessionIds();
    if (targets.length === 0) return;
    const MAX_RETRIES = 3;
    let completed = 0;
    let failed = 0;

    // Skip unchanged
    const meta = loadMetadata();
    const toCompress = targets.filter((sid) => {
      const sm = meta.sessions[sid];
      if (!sm?.lastCompressedLineCount) return true;
      try {
        const fp = path.join(SESSIONS_DIR, `${sid}.jsonl`);
        const n = fs.readFileSync(fp, "utf-8").trim().split("\n").length;
        return n !== sm.lastCompressedLineCount;
      } catch { return true; }
    });

    if (toCompress.length === 0) {
      console.log(`[switch-global] All sessions unchanged — nothing to compress.`);
      return;
    }
    console.log(`[switch-global] Compressing ${toCompress.length} session(s)...`);

    function next(i: number): void {
      if (i >= toCompress.length) {
        console.log(`[switch-global] Done. ${completed} ok, ${failed} failed.`);
        return;
      }
      const sid = toCompress[i];
      let retries = 0;
      async function attempt(): Promise<void> {
        try {
          const r = await aiCompressSession(sid, 40, true);
          if (r) {
            completed++;
            console.log(`[switch-global] ${sid.slice(0, 8)}: ${r.originalSize} → ${r.compressedSize}`);
          }
          next(i + 1);
        } catch (err) {
          if (++retries < MAX_RETRIES) {
            setTimeout(attempt, 2000 * retries);
          } else {
            failed++;
            console.error(`[switch-global] ${sid.slice(0, 8)}: all retries failed`);
            next(i + 1);
          }
        }
      }
      attempt();
    }
    next(0);
  }, 500);

  return null;
}

export function switchSessionProvider(id: string, toMode: "api" | "subscription"): boolean {
  console.log(`[switch-session] START id=${id} toMode=${toMode}`);

  const filePath = path.join(SESSIONS_DIR, `${id}.jsonl`);
  if (!fs.existsSync(filePath)) {
    console.log(`[switch-session] FAIL: session file not found`);
    return false;
  }

  // Get current API config from users store
  const usersStore = readJson(USERS_PATH);
  const apiConfig = usersStore.apiConfig || { apiKey: "", baseUrl: "https://api.deepseek.com/anthropic", model: "deepseek-v4-pro" };
  const activeProfile = usersStore.activeProfile;

  // Get profile name for subscription mode
  let profileName: string | undefined;
  if (toMode === "subscription") {
    if (activeProfile) {
      profileName = activeProfile;
    } else {
      const profilesDir = PROFILES_DIR;
      if (fs.existsSync(profilesDir)) {
        const entries = fs.readdirSync(profilesDir).filter(e => {
          const full = path.join(profilesDir, e);
          return fs.statSync(full).isDirectory();
        }).sort();
        if (entries.length > 0) profileName = entries[0];
      }
    }
    if (!profileName) return false;
  }

  // Store preference and config in session metadata
  const metaUpdates: any = { preferredProvider: toMode };
  if (toMode === "api") {
    metaUpdates.sessionApiConfig = { ...apiConfig };
    metaUpdates.sessionProfile = null;
  } else {
    metaUpdates.sessionProfile = profileName;
    metaUpdates.sessionApiConfig = null;
  }
  updateSessionMeta(id, metaUpdates);

  // Strip thinking blocks and swap model references in JSONL so the SDK
  // uses the correct model on resume. Must strip thinking blocks FIRST because
  // thinking signatures are cryptographically bound to the generating model —
  // sending Anthropic thinking blocks to DeepSeek (or vice versa) triggers
  // "Invalid signature in thinking block" errors.
  processSessionForProvider(filePath, toMode);

  // Inject marker
  const marker = {
    type: "system",
    timestamp: new Date().toISOString(),
    cwd: HOME_DIR,
    sessionId: id,
    message: {
      role: "system",
      content: `[Provider set to ${toMode} mode at ${new Date().toISOString()}. Next resume will use ${toMode === "api" ? "DeepSeek API" : `Claude Subscription (${profileName})`}.]`,
    },
    providerSwitch: true,
    toProvider: toMode,
  };
  fs.appendFileSync(filePath, JSON.stringify(marker) + "\n");

  // Fire-and-forget: compress other active sessions so their thinking blocks
  // are compatible with the new provider mode.
  compressActiveSessionsBackground(id, toMode);

  return true;
}

/**
 * Find session IDs that have a running Claude SDK or Happy daemon process.
 */
function getActiveSessionIds(): string[] {
  try {
    const output = execSync(
      "ps -eo args --no-headers 2>/dev/null | grep -E -- '--resume [a-f0-9-]{30,}' | grep -v grep || true",
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
    );
    const ids = new Set<string>();
    for (const line of output.trim().split("\n")) {
      const m = line.match(/--resume\s+([a-f0-9-]{30,})/);
      if (m) ids.add(m[1]);
    }
    return [...ids];
  } catch {
    return [];
  }
}

/**
 * Compress active sessions in the background after a provider switch.
 * Strips mode-specific thinking blocks and summarizes old messages so the
 * conversation history is compatible with the new provider's model.
 *
 * Runs sequentially (not truly parallel) because aiCompressSession uses
 * execSync internally. Retries each session up to 3 times on failure.
 */
function compressActiveSessionsBackground(
  triggeringSessionId: string,
  toMode: "api" | "subscription"
): void {
  const activeIds = getActiveSessionIds();

  // Don't compress the triggering session — that one was just switched by
  // switchSessionProvider (metadata + JSONL already updated).
  let targets = activeIds.filter((id) => id !== triggeringSessionId);

  if (targets.length === 0) return;

  // Skip sessions that haven't grown since last compression
  const meta = loadMetadata();
  const skipped: string[] = [];
  targets = targets.filter((id) => {
    const sessionMeta = meta.sessions[id];
    const lastCount = sessionMeta?.lastCompressedLineCount;
    if (!lastCount) return true; // Never compressed, proceed
    try {
      const filePath = path.join(SESSIONS_DIR, `${id}.jsonl`);
      const currentLines = fs.readFileSync(filePath, "utf-8").trim().split("\n").length;
      if (currentLines === lastCount) {
        skipped.push(id);
        return false;
      }
    } catch {}
    return true;
  });

  if (skipped.length > 0) {
    console.log(
      `[switch] Skipping ${skipped.length} unchanged session(s): ${skipped.map((id) => id.slice(0, 8)).join(", ")}`
    );
  }

  if (targets.length === 0) {
    console.log(`[switch] All active sessions are unchanged since last compression — nothing to do.`);
    return;
  }

  console.log(
    `[switch] Provider → ${toMode}. Compressing ${targets.length} active session(s): ${targets.map((id) => id.slice(0, 8)).join(", ")}`
  );

  // Run in background so the HTTP response isn't blocked
  setTimeout(() => {
    const MAX_RETRIES = 3;
    let completed = 0;
    let failed = 0;

    function processNext(index: number): void {
      if (index >= targets.length) {
        console.log(
          `[switch] Compression done. ${completed} succeeded, ${failed} failed.`
        );
        return;
      }

      const id = targets[index];
      let lastError: any = null;

      async function attempt(retry: number): Promise<void> {
        try {
          const result = await aiCompressSession(id, 40, true);
          if (result) {
            completed++;
            console.log(
              `[switch] Compressed ${id.slice(0, 8)}: ${result.originalSize} → ${result.compressedSize} messages`
            );
          } else {
            console.log(`[switch] ${id.slice(0, 8)}: no compression needed`);
          }
          // Move to next session
          processNext(index + 1);
        } catch (err) {
          lastError = err;
          if (retry < MAX_RETRIES) {
            console.error(
              `[switch] Retry ${retry + 1}/${MAX_RETRIES} for ${id.slice(0, 8)}: ${err}`
            );
            setTimeout(() => attempt(retry + 1), 2000 * (retry + 1));
          } else {
            failed++;
            console.error(
              `[switch] All retries failed for ${id.slice(0, 8)}: ${lastError}`
            );
            processNext(index + 1);
          }
        }
      }

      attempt(0);
    }

    processNext(0);
  }, 500);
}

const REAL_CLAUDE_DIR = CLAUDE_DIR;

/**
 * Create an isolated temporary HOME directory for a session launch.
 * ~/.claude/ contents are symlinked from the real home, except provider-specific
 * files (settings.json, .credentials.json) which are generated per-session.
 * This eliminates all global-file race conditions when launching concurrent sessions.
 */
/**
 * Apply session's provider settings to the global ~/.claude/settings.json
 * and set up credentials. This is called before resume so the SDK picks up
 * the correct provider mode from the global settings file.
 *
 * Trade-off: all running sessions share the same global settings, so
 * per-session mode isolation is not possible. This matches claude-switcher's
 * behavior and keeps things simple.
 */
export function applySessionProviderGlobally(sessionId: string): void {
  const meta = loadMetadata();
  const sessionMeta = meta.sessions[sessionId];
  const usersStore = readJson(USERS_PATH);
  const settings = JSON.parse(JSON.stringify(readJson(SETTINGS_PATH) || {}));
  if (!settings.env) settings.env = {};

  if (sessionMeta?.preferredProvider === "api") {
    const apiKey = sessionMeta.sessionApiConfig?.apiKey || usersStore?.apiConfig?.apiKey || "";
    const baseUrl = sessionMeta.sessionApiConfig?.baseUrl || usersStore?.apiConfig?.baseUrl || "https://api.deepseek.com/anthropic";
    const model = sessionMeta.sessionApiConfig?.model || usersStore?.apiConfig?.model || "deepseek-v4-pro";
    settings.env.ANTHROPIC_BASE_URL = baseUrl;
    settings.env.ANTHROPIC_AUTH_TOKEN = apiKey;
    settings.env.ANTHROPIC_MODEL = model;
    settings.env.API_TIMEOUT_MS = "3000000";
    writeJson(SETTINGS_PATH, settings);
    try { fs.unlinkSync(CREDENTIALS_PATH); } catch {}
    try { fs.unlinkSync(CLAUDE_JSON_PATH); } catch {}

  } else if (sessionMeta?.preferredProvider === "subscription" && sessionMeta.sessionProfile) {
    delete settings.env.ANTHROPIC_BASE_URL;
    delete settings.env.ANTHROPIC_AUTH_TOKEN;
    delete settings.env.API_TIMEOUT_MS;
    settings.env.ANTHROPIC_MODEL = "claude-sonnet-4-6";
    writeJson(SETTINGS_PATH, settings);

    const profileCreds = path.join(PROFILES_DIR, sessionMeta.sessionProfile, "credentials.json");
    if (fs.existsSync(profileCreds)) {
      try { fs.unlinkSync(CREDENTIALS_PATH); } catch {}
      try { fs.symlinkSync(profileCreds, CREDENTIALS_PATH); } catch {}
    }
    const profileClaude = path.join(PROFILES_DIR, sessionMeta.sessionProfile, "claude.json");
    if (fs.existsSync(profileClaude)) {
      fs.copyFileSync(profileClaude, CLAUDE_JSON_PATH);
    }

  } else {
    // No explicit session preference — auto-detect provider from session's JSONL.
    const detected = detectProvider(sessionId);
    const sessionProvider = detected.provider === "unknown" ? null : detected.dominantProvider;

    if (sessionProvider === "api") {
      const apiKey = usersStore?.apiConfig?.apiKey || "";
      const baseUrl = usersStore?.apiConfig?.baseUrl || "https://api.deepseek.com/anthropic";
      const model = usersStore?.apiConfig?.model || "deepseek-v4-pro";
      settings.env.ANTHROPIC_BASE_URL = baseUrl;
      settings.env.ANTHROPIC_AUTH_TOKEN = apiKey;
      settings.env.ANTHROPIC_MODEL = model;
      settings.env.API_TIMEOUT_MS = "3000000";
      writeJson(SETTINGS_PATH, settings);
      try { fs.unlinkSync(CREDENTIALS_PATH); } catch {}
      try { fs.unlinkSync(CLAUDE_JSON_PATH); } catch {}

    } else {
      delete settings.env.ANTHROPIC_BASE_URL;
      delete settings.env.ANTHROPIC_AUTH_TOKEN;
      delete settings.env.API_TIMEOUT_MS;
      settings.env.ANTHROPIC_MODEL = "claude-sonnet-4-6";
      writeJson(SETTINGS_PATH, settings);

      if (fs.existsSync(CREDENTIALS_PATH)) {
        // Already has credentials symlink — keep it
      } else {
        // Try to find OAuth credentials from active profile
        const activeProfile = usersStore?.activeProfile;
        if (activeProfile) {
          const profileCreds = path.join(PROFILES_DIR, activeProfile, "credentials.json");
          if (fs.existsSync(profileCreds)) {
            try { fs.symlinkSync(profileCreds, CREDENTIALS_PATH); } catch {}
          }
        }
      }
    }
  }
}

/**
 * @deprecated Use applySessionProviderGlobally instead.
 * Per-session HOME isolation is no longer used because --resume loads
 * platform state that overrides per-session settings anyway.
 */
export function createSessionHome(sessionId: string): string {
  const tempHome = `/tmp/claude-sess-${sessionId}`;
  // Clean up stale temp homes but don't create new ones
  try { fs.rmSync(tempHome, { recursive: true, force: true }); } catch {}
  return HOME_DIR;
}
