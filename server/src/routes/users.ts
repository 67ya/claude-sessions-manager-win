import { Router, Request, Response } from "express";
import {
  listProfiles,
  getActiveState,
  getApiConfig,
  saveCurrentToProfile,
  restoreProfile,
  deleteProfile,
  updateProfileMeta,
  loginStart,
  loginCancel,
  loginSubmit,
  getLoginState,
  refreshProfileToken,
  switchMode,
  updateApiConfig,
} from "../services/users";

const router = Router();

// List all profiles + current mode
router.get("/", (_req: Request, res: Response) => {
  const state = getActiveState();
  res.json({
    profiles: listProfiles(),
    apiConfig: getApiConfig(),
    activeMode: state.mode,
    activeProfile: state.activeProfile,
    currentUser: state.currentUser,
  });
});

// Get active state
router.get("/active", (_req: Request, res: Response) => {
  res.json(getActiveState());
});

// Save current tokens to a profile (compatible with claude-switcher)
router.post("/profiles", (req: Request, res: Response) => {
  const { name } = req.body;
  if (!name || typeof name !== "string") {
    res.status(400).json({ error: "Profile name required" });
    return;
  }
  const result = saveCurrentToProfile(name);
  if (!result.ok) {
    res.status(400).json(result);
    return;
  }
  res.json({ success: true, message: `Saved as profile '${name}'` });
});

// Switch to a profile (restore its files to ~/.claude*)
router.post("/profiles/switch", (req: Request, res: Response) => {
  const { name } = req.body;
  if (!name) {
    res.status(400).json({ error: "Profile name required" });
    return;
  }
  const result = restoreProfile(name);
  if (!result.ok) {
    res.status(404).json(result);
    return;
  }
  res.json({ success: true, message: `Switched to '${name}'` });
});

// Delete a profile
router.delete("/profiles/:name", (req: Request, res: Response) => {
  const deleted = deleteProfile(req.params.name);
  if (!deleted) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }
  res.json({ success: true });
});

// Update profile metadata (tags/label)
router.patch("/profiles/:name", (req: Request, res: Response) => {
  const updated = updateProfileMeta(req.params.name, req.body);
  if (!updated) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }
  res.json({ success: true });
});

// OAuth login - start PKCE flow
router.post("/login/start", (req: Request, res: Response) => {
  const force = req.body?.force === true;
  const updateProfile = req.body?.update_profile || undefined;
  const result = loginStart(force, updateProfile);
  if (!result.ok) {
    res.status(409).json(result);
    return;
  }
  const state = getLoginState();
  res.json({ ok: true, url: state.url, message: state.message });
});

// OAuth login - cancel
router.post("/login/cancel", (_req: Request, res: Response) => {
  loginCancel();
  res.json({ ok: true });
});

// OAuth login - get state (for polling)
router.get("/login/state", (_req: Request, res: Response) => {
  res.json(getLoginState());
});

// OAuth login - submit authorization code
router.post("/login/submit", (req: Request, res: Response) => {
  const { code } = req.body;
  if (!code || typeof code !== "string") {
    res.status(400).json({ error: "Authorization code required" });
    return;
  }
  const result = loginSubmit(code);
  if (!result.ok) {
    res.status(400).json(result);
    return;
  }
  res.json({ ok: true });
});

// OAuth login - SSE stream (compatible with claude-switcher frontend)
router.get("/login/stream", (req: Request, res: Response) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });

  let lastState = "";
  let ticks = 0;
  const maxTicks = 180; // 3 minutes

  const timer = setInterval(() => {
    ticks++;
    const state = JSON.stringify(getLoginState());
    if (state !== lastState) {
      lastState = state;
      res.write(`data: ${state}\n\n`);
    }
    if (getLoginState().status === "done" || getLoginState().status === "error" || ticks >= maxTicks) {
      if (ticks >= maxTicks) {
        res.write(`data: ${JSON.stringify({ status: "timeout" })}\n\n`);
      }
      clearInterval(timer);
      res.end();
    }
  }, 1000);

  req.on("close", () => {
    clearInterval(timer);
  });
});

// Refresh token for a profile
router.post("/profiles/:name/refresh", async (req: Request, res: Response) => {
  try {
    const result = await refreshProfileToken(req.params.name);
    if (!result.ok) {
      res.status(400).json(result);
      return;
    }
    res.json({ ok: true, expiresAt: result.expiresAt });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Refresh failed" });
  }
});

// Switch mode
router.post("/switch", (req: Request, res: Response) => {
  const { mode, profileName } = req.body;
  if (!mode || !["api", "subscription"].includes(mode)) {
    res.status(400).json({ error: "mode must be 'api' or 'subscription'" });
    return;
  }
  const result = switchMode(mode, profileName || null);
  if (!result.ok) {
    res.status(400).json(result);
    return;
  }
  res.json({ success: true, mode, profileName: profileName || null });
});

// Update API config
router.patch("/api-config", (req: Request, res: Response) => {
  const config = updateApiConfig(req.body);
  res.json(config);
});

export default router;
