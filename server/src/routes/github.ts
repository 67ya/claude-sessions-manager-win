import { Router, Request, Response } from "express";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { CLAUDE_DIR, SESSIONS_DIR, METADATA_PATH } from "../config";

const router = Router();

// GitHub credentials from environment (with fallbacks for development)
const GITHUB_USER = process.env.GITHUB_USER || "67ya";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";
const GITHUB_REPO = "67ya/claude-sessions-backup";
const GIT_DIR = path.join(CLAUDE_DIR, "github-sync-repo");
const REMOTE_URL = `https://${GITHUB_USER}:${GITHUB_TOKEN}@github.com/${GITHUB_REPO}.git`;

function ensureGitRepo() {
  fs.mkdirSync(GIT_DIR, { recursive: true });
  if (!fs.existsSync(`${GIT_DIR}/.git`)) {
    execSync("git init", { cwd: GIT_DIR });
    execSync('git config user.name "Claude Sessions Manager"', { cwd: GIT_DIR });
    execSync('git config user.email "sessions@claude.local"', { cwd: GIT_DIR });
  }
  // Always set remote to our hardcoded repo
  try {
    execSync("git remote get-url origin", { cwd: GIT_DIR });
    execSync(`git remote set-url origin ${REMOTE_URL}`, { cwd: GIT_DIR });
  } catch {
    execSync(`git remote add origin ${REMOTE_URL}`, { cwd: GIT_DIR });
  }
}

// Get sync config (simplified — returns hardcoded info)
router.get("/config", (_req: Request, res: Response) => {
  const lastSyncFile = `${GIT_DIR}/.last-sync`;
  let lastSync: string | null = null;
  try {
    if (fs.existsSync(lastSyncFile)) {
      lastSync = fs.readFileSync(lastSyncFile, "utf-8").trim();
    }
  } catch {}

  res.json({
    repo: GITHUB_REPO,
    branch: "main",
    hasToken: true,
    lastSync,
  });
});

// Save sync config (no-op — repo is hardcoded, kept for compat)
router.post("/config", (_req: Request, res: Response) => {
  ensureGitRepo();
  res.json({ success: true });
});

// Sync sessions to GitHub — force-push to overwrite
router.post("/sync", (req: Request, res: Response) => {
  const { sessionIds } = req.body;

  ensureGitRepo();

  const SESSIONS_DIR = SESSIONS_DIR;

  // Reset git state to avoid merge conflicts on force push
  try {
    execSync("git rm -rf . 2>/dev/null || true", { cwd: GIT_DIR });
  } catch {}

  // Copy selected sessions
  for (const id of sessionIds) {
    const src = `${SESSIONS_DIR}/${id}.jsonl`;
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, `${GIT_DIR}/${id}.jsonl`);
    }
  }

  // Copy metadata
  const metaPath = METADATA_PATH;
  if (fs.existsSync(metaPath)) {
    fs.copyFileSync(metaPath, `${GIT_DIR}/sessions-metadata.json`);
  }

  try {
    execSync("git add -A", { cwd: GIT_DIR });
    execSync(
      `git commit -m "Sync ${sessionIds.length} sessions — ${new Date().toISOString()}"`,
      { cwd: GIT_DIR }
    );

    // Fetch and force push to ensure complete overwrite
    try {
      execSync("git fetch origin main 2>/dev/null", { cwd: GIT_DIR });
    } catch {
      // First push — no remote main yet
    }
    execSync("git push -f -u origin main", { cwd: GIT_DIR });

    // Record last sync time
    const now = new Date().toISOString();
    fs.writeFileSync(`${GIT_DIR}/.last-sync`, now);

    res.json({ success: true, lastSync: now });
  } catch (e: any) {
    res.json({
      success: false,
      error: e.stderr?.toString() || e.message || "Git push failed",
    });
  }
});

export default router;
