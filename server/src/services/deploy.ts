import { EventEmitter } from "events";
import * as fs from "fs";
import * as path from "path";
import { connectNode } from "./ssh";
import { getNode } from "./nodes";

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

const jobs = new Map<string, DeployJob>();
const jobEvents = new Map<string, EventEmitter>();

function newJobId(): string {
  return `deploy-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function createDeployJob(params: {
  nodeId: string;
  repoUrl: string;
  branch: string;
  script: string;
}): DeployJob {
  const node = getNode(params.nodeId);
  if (!node) throw new Error("Node not found");

  const job: DeployJob = {
    id: newJobId(),
    nodeId: params.nodeId,
    nodeName: node.name,
    host: node.host,
    repoUrl: params.repoUrl,
    branch: params.branch || "main",
    script: params.script || "",
    status: "pending",
    logs: [],
    createdAt: new Date().toISOString(),
  };

  jobs.set(job.id, job);
  jobEvents.set(job.id, new EventEmitter());

  // Start deployment asynchronously
  runDeploy(job).catch((err) => {
    appendLog(job.id, `\n[ERROR] Deploy failed: ${err.message}`);
    finishJob(job.id, "failed");
  });

  return job;
}

async function runDeploy(job: DeployJob) {
  job.status = "running";

  const hasRepo = job.repoUrl && job.repoUrl.trim() !== "";
  const branch = job.branch;

  // Build clone URLs: Gitee (primary, works in China) + GitHub mirror (fallback)
  const GITEE_TOKEN = process.env.GITEE_TOKEN || "";
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";
  let giteeUrl = "";
  let githubUrl = "";

  if (hasRepo && job.repoUrl.includes("github.com/")) {
    const repoPath = job.repoUrl.replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "");
    const repoName = repoPath.split("/").pop() || repoPath;
    giteeUrl = `https://shan9999:${GITEE_TOKEN}@gitee.com/shan9999/${repoName}.git`;
    githubUrl = `https://67ya:${GITHUB_TOKEN}@github.com/${repoPath}.git`;
  } else if (hasRepo && job.repoUrl.includes("gitee.com/")) {
    giteeUrl = job.repoUrl.replace("https://gitee.com/", `https://shan9999:${GITEE_TOKEN}@gitee.com/`);
  } else if (hasRepo) {
    giteeUrl = job.repoUrl;
  }

  const repoName = hasRepo ? job.repoUrl.split("/").pop()?.replace(".git", "") || "app" : "script";
  const workDir = `/tmp/deploy-${repoName}`;

  // Build the deploy shell script
  const deployScript: string[] = [];
  deployScript.push(`set -e`);

  if (hasRepo) {
    // Git clone/pull steps
    deployScript.push(
      `echo "[1/4] Preparing workspace..."`,
      `mkdir -p ${workDir}`,
      ``,
      `echo "[2/4] Checking repository..."`,
      `if [ -d "${workDir}/.git" ]; then`,
      `  echo "  Repository exists, pulling..."`,
      `  cd ${workDir}`,
    );

    if (giteeUrl) {
      deployScript.push(
        `  git remote set-url origin ${giteeUrl} 2>&1`,
        `  echo "  Trying Gitee..."`,
        `  if git fetch origin 2>&1; then`,
        `    git checkout ${branch} 2>&1`,
        `    git pull origin ${branch} 2>&1`,
      );
      if (githubUrl) {
        deployScript.push(
          `  else`,
          `    echo "  Gitee failed, trying GitHub mirror..."`,
          `    git remote set-url origin ${githubUrl} 2>&1`,
          `    git fetch origin 2>&1`,
          `    git checkout ${branch} 2>&1`,
          `    git pull origin ${branch} 2>&1`,
          `  fi`,
        );
      } else {
        deployScript.push(`  fi`);
      }
    }

    deployScript.push(`else`);
    if (giteeUrl && githubUrl) {
      deployScript.push(
        `  echo "  Cloning from Gitee..."`,
        `  if git clone -b ${branch} ${giteeUrl} ${workDir} 2>&1; then`,
        `    echo "  ✓ Cloned from Gitee"`,
        `  else`,
        `    echo "  Gitee clone failed, trying GitHub mirror..."`,
        `    git clone -b ${branch} ${githubUrl} ${workDir} 2>&1`,
        `  fi`,
      );
    } else {
      const url = giteeUrl || job.repoUrl;
      deployScript.push(`  git clone -b ${branch} ${url} ${workDir} 2>&1`);
    }
    deployScript.push(`fi`, ``);

    // Configure dual remotes for future sync
    deployScript.push(
      `cd ${workDir}`,
      githubUrl ? `git remote add github ${githubUrl} 2>/dev/null || git remote set-url github ${githubUrl} 2>/dev/null || true` : ``,
      giteeUrl ? `git remote add gitee ${giteeUrl} 2>/dev/null || git remote set-url gitee ${giteeUrl} 2>/dev/null || true` : ``,
      ``,
    );
  } else {
    deployScript.push(`echo "[1/2] Script-only deploy (no repository)"`, ``);
  }

  if (job.script.trim()) {
    const step = hasRepo ? 3 : 1;
    const total = hasRepo ? 4 : 2;
    deployScript.push(
      `echo ""`,
      `echo "[${step}/${total}] Running deploy script..."`,
    );
    if (hasRepo) deployScript.push(`cd ${workDir}`);
    deployScript.push(job.script);

    // Dual push after successful deploy
    if (hasRepo) {
      deployScript.push(
        ``,
        `echo ""`,
        `echo "[4/4] Syncing to dual remotes..."`,
        `git push github ${branch} 2>&1 || echo "(GitHub push skipped)"`,
        `git push gitee ${branch} 2>&1 || echo "(Gitee push skipped)"`,
      );
    }
    deployScript.push(`echo "Deploy complete ✓"`);
  } else {
    if (hasRepo) {
      deployScript.push(
        `echo ""`,
        `echo "[3/4] Syncing to dual remotes..."`,
        `git push github ${branch} 2>&1 || echo "(GitHub push skipped)"`,
        `git push gitee ${branch} 2>&1 || echo "(Gitee push skipped)"`,
        `echo "Deploy complete ✓"`,
      );
    } else {
      deployScript.push(`echo "Deploy complete ✓ (no custom script)"`);
    }
  }

  const cmd = deployScript.filter(s => s !== "").join("\n");

  try {
    const conn = await connectNode(getNode(job.nodeId)!);
    conn.exec(cmd, (err, stream) => {
      if (err) {
        conn.end();
        appendLog(job.id, `SSH exec error: ${err.message}`);
        finishJob(job.id, "failed");
        return;
      }

      stream.on("data", (data: Buffer) => {
        appendLog(job.id, data.toString());
      });

      stream.stderr.on("data", (data: Buffer) => {
        appendLog(job.id, data.toString());
      });

      stream.on("close", (code: number) => {
        conn.end();
        const status = code === 0 ? "success" : "failed";
        appendLog(job.id, `\n--- Exit code: ${code} (${status}) ---`);
        finishJob(job.id, status);
      });

      stream.on("error", (err: Error) => {
        conn.end();
        appendLog(job.id, `\nStream error: ${err.message}`);
        finishJob(job.id, "failed");
      });
    });
  } catch (err: any) {
    appendLog(job.id, `\nConnection error: ${err.message}`);
    finishJob(job.id, "failed");
  }
}

function appendLog(jobId: string, text: string) {
  const job = jobs.get(jobId);
  if (job) {
    // Split by newlines for cleaner SSE events
    const lines = text.split("\n");
    for (const line of lines) {
      if (line) job.logs.push(line);
    }
  }
  jobEvents.get(jobId)?.emit("log", text);
}

const DEPLOY_LOG_DIR = "/home/ctyun/.claude/deploy-logs";

function persistJob(job: DeployJob) {
  try {
    fs.mkdirSync(DEPLOY_LOG_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(DEPLOY_LOG_DIR, `${job.id}.json`),
      JSON.stringify(job, null, 2)
    );
  } catch {}
}

function purgeOldLogs() {
  try {
    if (!fs.existsSync(DEPLOY_LOG_DIR)) return;
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    for (const file of fs.readdirSync(DEPLOY_LOG_DIR)) {
      const fp = path.join(DEPLOY_LOG_DIR, file);
      if (fs.statSync(fp).mtimeMs < cutoff) fs.unlinkSync(fp);
    }
  } catch {}
}
setInterval(purgeOldLogs, 3600000);
purgeOldLogs();

function finishJob(jobId: string, status: "success" | "failed") {
  const job = jobs.get(jobId);
  if (job) {
    job.status = status;
    job.finishedAt = new Date().toISOString();
    persistJob(job);
  }
  jobEvents.get(jobId)?.emit("done", status);
}

export function getJob(jobId: string): DeployJob | undefined {
  return jobs.get(jobId);
}

export function getAllJobs(): DeployJob[] {
  return Array.from(jobs.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function getJobEmitter(jobId: string): EventEmitter | undefined {
  return jobEvents.get(jobId);
}

// Clean up old jobs (keep last 50)
setInterval(() => {
  const all = getAllJobs();
  if (all.length > 50) {
    const toRemove = all.slice(50);
    for (const j of toRemove) {
      jobs.delete(j.id);
      jobEvents.delete(j.id);
    }
  }
}, 60000);
