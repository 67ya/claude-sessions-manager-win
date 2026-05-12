import { Router, Request, Response } from "express";
import {
  getAllSessions,
  getSessionDetail,
  updateSessionMeta,
  deleteSession,
  getCategories,
  getSessionMeta,
  compressSession,
  aiCompressSession,
  detectProvider,
  switchSessionProvider,
  switchGlobalMode,
  applySessionProviderToSettings,
  restoreSettingsSnapshot,
  getProcessingSessions,
  forceUnstickSession,
} from "../services/sessions";
import { getResumeCommand, resumeSession, restartAllSessions } from "../services/executor";
import { SETTINGS_PATH, USERS_PATH, CREDENTIALS_PATH } from "../config";

const router = Router();

// List all sessions
router.get("/", (req: Request, res: Response) => {
  const { search, category, archived, sort } = req.query;
  const sessions = getAllSessions(
    search as string | undefined,
    category as string | undefined,
    archived as string | undefined,
    sort as string | undefined
  );
  res.json({ sessions, categories: getCategories() });
});

// Get current global mode
router.get("/mode", (_req: Request, res: Response) => {
  try {
    const settings = JSON.parse(
      require("fs").readFileSync(SETTINGS_PATH, "utf-8")
    );
    const hasApiEnv = !!(settings.env?.ANTHROPIC_BASE_URL && settings.env?.ANTHROPIC_AUTH_TOKEN);
    const isApi = hasApiEnv && (!settings.env?.ANTHROPIC_MODEL || settings.env?.ANTHROPIC_MODEL?.startsWith("deepseek"));

    // For subscription mode, also check claude-users.json — API env vars
    // are cleared during subscription switch, so settings.json alone can't tell.
    let isSub = false;
    if (!hasApiEnv) {
      try {
        const users = JSON.parse(
          require("fs").readFileSync(USERS_PATH, "utf-8")
        );
        if (users.activeMode === "subscription") {
          const credsExist = require("fs").existsSync(CREDENTIALS_PATH);
          isSub = credsExist;
        }
      } catch {}
    }

    const mode = isApi ? "api" : isSub ? "subscription" : "unknown";
    res.json({ mode, model: settings.env?.ANTHROPIC_MODEL || null });
  } catch {
    res.json({ mode: "unknown", model: null });
  }
});

// Switch global mode
router.post("/mode/switch", (req: Request, res: Response) => {
  const { toMode } = req.body;
  console.log(`[route:mode/switch] toMode=${toMode}`);
  if (!toMode || !["api", "subscription"].includes(toMode)) {
    res.status(400).json({ error: "toMode must be 'api' or 'subscription'" });
    return;
  }
  const blocked = switchGlobalMode(toMode);
  if (blocked) {
    console.log(`[route:mode/switch] BLOCKED: ${JSON.stringify(blocked)}`);
    res.status(409).json({
      error: `Cannot switch: ${blocked.length} session(s) currently processing. Wait and retry.`,
      blockedSessions: blocked,
    });
    return;
  }
  console.log(`[route:mode/switch] ok, restarting sessions...`);
  res.json({ success: true, mode: toMode });
  // Fire-and-forget restart all running sessions so they pick up new settings.json
  const restarted = restartAllSessions();
  console.log(`[route:mode/switch] Restarted ${restarted} session(s) for new mode: ${toMode}`);
});

// List sessions currently processing (unanswered user message)
router.get("/processing", (_req: Request, res: Response) => {
  const sessions = getProcessingSessions();
  res.json({ sessions });
});

// Force-unstick a session (inject synthetic assistant marker)
router.post("/:id/force-unstick", (req: Request, res: Response) => {
  const { id } = req.params;
  const ok = forceUnstickSession(id);
  if (!ok) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  res.json({ success: true });
});

// Get single session detail
router.get("/:id", (req: Request, res: Response) => {
  const { id } = req.params;
  const limit = parseInt((req.query.limit as string) || "50");
  const detail = getSessionDetail(id, limit);
  if (!detail) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  res.json(detail);
});

// Update session metadata
router.patch("/:id", (req: Request, res: Response) => {
  const { id } = req.params;
  const meta = updateSessionMeta(id, req.body);
  res.json(meta);
});

// Resume session - open terminal with happy --resume
router.post("/:id/resume", (req: Request, res: Response) => {
  const { id } = req.params;
  const meta = getSessionMeta(id);
  resumeSession(id, meta?.customName).then((result) => {
    if (!result.success) {
      result.command = getResumeCommand(id);
    }
    res.json(result);
  }).catch((e: any) => {
    console.error("[resume] Error:", e.message);
    res.status(500).json({
      success: false,
      output: `Resume failed: ${e.message}`,
      command: getResumeCommand(id),
    });
  });
});

// Toggle archive
router.post("/:id/archive", (req: Request, res: Response) => {
  const { id } = req.params;
  const current = getSessionMeta(id);
  const meta = updateSessionMeta(id, { archived: !current?.archived });
  res.json(meta);
});

// Bulk actions on sessions
router.post("/bulk", (req: Request, res: Response) => {
  const { ids, action } = req.body as { ids: string[]; action: string };
  if (!Array.isArray(ids) || !action) {
    res.status(400).json({ error: "ids array and action required" });
    return;
  }
  for (const id of ids) {
    switch (action) {
      case "compress": compressSession(id); break;
      case "delete": deleteSession(id); break;
      case "archive": updateSessionMeta(id, { archived: true }); break;
      case "pin": updateSessionMeta(id, { pinned: true }); break;
    }
  }
  res.json({ success: true });
});

// Compress session - summarize old messages, keep last N (mechanical)
router.post("/:id/compress", (req: Request, res: Response) => {
  const { id } = req.params;
  const keepLast = parseInt((req.body as any)?.keepLast) || 100;
  const result = compressSession(id, keepLast);
  if (!result) {
    res.json({ skipped: true, message: "Session too small to compress or not found" });
    return;
  }
  res.json({ success: true, ...result });
});

// AI Compress session - use Claude to generate structured JSON summary
router.post("/:id/ai-compress", async (req: Request, res: Response) => {
  const { id } = req.params;
  const keepLast = parseInt((req.body as any)?.keepLast) || 100;
  const stripThinking = (req.body as any)?.stripThinking === true;
  try {
    const result = await aiCompressSession(id, keepLast, stripThinking);
    if (!result) {
      res.json({ skipped: true, message: "Session too small to compress or not found" });
      return;
    }
    res.json({ success: true, ...result });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "AI compress failed" });
  }
});

// Delete session
router.delete("/:id", (req: Request, res: Response) => {
  const { id } = req.params;
  const deleted = deleteSession(id);
  if (!deleted) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  res.json({ success: true });
});

// Detect session provider
router.get("/:id/provider", (req: Request, res: Response) => {
  const { id } = req.params;
  const result = detectProvider(id);
  res.json(result);
});

// Switch session provider (injects marker into JSONL)
router.post("/:id/switch-provider", (req: Request, res: Response) => {
  const { id } = req.params;
  const { toMode } = req.body;
  console.log(`[route:switch-provider] id=${id} toMode=${toMode}`);
  if (!toMode || !["api", "subscription"].includes(toMode)) {
    res.status(400).json({ error: "toMode must be 'api' or 'subscription'" });
    return;
  }
  const ok = switchSessionProvider(id, toMode);
  console.log(`[route:switch-provider] result=${ok}`);
  if (!ok) {
    res.status(404).json({ error: "Session not found or no profile available for subscription mode." });
    return;
  }
  res.json({ success: true, toMode });
});
export default router;
