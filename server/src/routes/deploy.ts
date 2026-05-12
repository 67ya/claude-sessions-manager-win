import { Router, Request, Response } from "express";
import * as fs from "fs";
import * as path from "path";
import { createDeployJob, getJob, getAllJobs, getJobEmitter } from "../services/deploy";
import { CLAUDE_DIR } from "../config";
import {
  getAllPresets,
  addPreset,
  updatePreset,
  deletePreset,
  seedDefaultPresets,
} from "../services/presets";

const router = Router();

// --- Presets (must be before /:jobId) ---

// List all presets + seed defaults
router.get("/presets", (_req: Request, res: Response) => {
  seedDefaultPresets();
  res.json({ presets: getAllPresets() });
});

// Add preset (user or Claude can call this)
router.post("/presets", (req: Request, res: Response) => {
  const { name, repoUrl, branch, script, description } = req.body;
  if (!name) {
    res.status(400).json({ error: "name required" });
    return;
  }
  const preset = addPreset({ name, repoUrl: repoUrl || "", branch: branch || "main", script: script || "", description });
  res.json(preset);
});

// Update preset
router.patch("/presets/:id", (req: Request, res: Response) => {
  const preset = updatePreset(req.params.id, req.body);
  if (!preset) {
    res.status(404).json({ error: "Preset not found" });
    return;
  }
  res.json(preset);
});

// Delete preset
router.delete("/presets/:id", (req: Request, res: Response) => {
  const deleted = deletePreset(req.params.id);
  if (!deleted) {
    res.status(404).json({ error: "Preset not found" });
    return;
  }
  res.json({ success: true });
});

// --- Deploy jobs ---

// List all deploy jobs
router.get("/", (_req: Request, res: Response) => {
  res.json({ jobs: getAllJobs() });
});

// Get single job
router.get("/:jobId", (req: Request, res: Response) => {
  const job = getJob(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.json(job);
});

// Start a new deploy
router.post("/", (req: Request, res: Response) => {
  const { nodeId, repoUrl, branch, script } = req.body;
  if (!nodeId) {
    res.status(400).json({ error: "nodeId required" });
    return;
  }
  try {
    const job = createDeployJob({ nodeId, repoUrl: repoUrl || "", branch: branch || "main", script: script || "" });
    res.json(job);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// --- Historical logs (must be before /:jobId) ---

router.get("/logs", (req: Request, res: Response) => {
  const days = parseInt(req.query.days as string) || 30;
  try {
    const dir = path.join(CLAUDE_DIR, "deploy-logs");
    const files: Array<{ jobId: string; createdAt: string; nodeName: string; status: string; repoUrl: string }> = [];
    if (fs.existsSync(dir)) {
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      for (const file of fs.readdirSync(dir)) {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).mtimeMs >= cutoff) {
          try {
            const job = JSON.parse(fs.readFileSync(filePath, "utf-8"));
            files.push({
              jobId: job.id,
              createdAt: job.createdAt,
              nodeName: job.nodeName,
              status: job.status,
              repoUrl: job.repoUrl,
            });
          } catch {}
        }
      }
    }
    files.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json({ logs: files });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/logs/:jobId", (req: Request, res: Response) => {
  try {
    const filePath = path.join(path.join(CLAUDE_DIR, "deploy-logs"), `${req.params.jobId}.json`);
    if (fs.existsSync(filePath)) {
      return res.json(JSON.parse(fs.readFileSync(filePath, "utf-8")));
    }
    const memJob = getJob(req.params.jobId);
    if (memJob) return res.json(memJob);
    res.status(404).json({ error: "Log not found" });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// SSE stream for job logs
router.get("/:jobId/logs", (req: Request, res: Response) => {
  const jobId = req.params.jobId;
  const job = getJob(jobId);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  // Send existing logs
  for (const line of job.logs) {
    res.write(`data: ${JSON.stringify({ line })}\n\n`);
  }

  // If job already done, send done event and close
  if (job.status === "success" || job.status === "failed") {
    res.write(`data: ${JSON.stringify({ done: true, status: job.status })}\n\n`);
    res.end();
    return;
  }

  // Listen for new logs
  const emitter = getJobEmitter(jobId);
  if (!emitter) {
    res.end();
    return;
  }

  const onLog = (text: string) => {
    const lines = text.split("\n").filter(Boolean);
    for (const line of lines) {
      res.write(`data: ${JSON.stringify({ line })}\n\n`);
    }
  };

  const onDone = (status: string) => {
    res.write(`data: ${JSON.stringify({ done: true, status })}\n\n`);
    res.end();
    cleanup();
  };

  const onClose = () => {
    cleanup();
  };

  function cleanup() {
    emitter.off("log", onLog);
    emitter.off("done", onDone);
    req.off("close", onClose);
  }

  emitter.on("log", onLog);
  emitter.on("done", onDone);
  req.on("close", onClose);
});

export default router;
