import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawn, exec, execSync } from "child_process";
import { getSessionMeta } from "./sessions";
import { HOME_DIR, IS_WINDOWS } from "../config";

// Clean up stale temp homes from any previous server runs
try {
  const tmpDir = os.tmpdir();
  for (const entry of fs.readdirSync(tmpDir)) {
    if (entry.startsWith("claude-sess-")) {
      try { fs.rmSync(path.join(tmpDir, entry), { recursive: true, force: true }); } catch {}
    }
  }
} catch {}

export function getResumeCommand(sessionId: string): string {
  return `happy --resume ${sessionId}`;
}

function findHappyBin(): string {
  if (process.env.HAPPY_BIN) return process.env.HAPPY_BIN;
  // Try to resolve from npm global modules
  try {
    const which = IS_WINDOWS ? "where" : "which";
    const loc = execSync(`${which} happy`, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim().split("\n")[0].trim();
    if (loc) {
      // On Windows, "happy" may be a POSIX shell script — prefer happy.cmd
      if (IS_WINDOWS && !loc.endsWith(".mjs") && !loc.endsWith(".exe")) {
        const cmd = loc + ".cmd";
        if (fs.existsSync(cmd)) return cmd;
      }
      return loc;
    }
  } catch {}
  // Linux fallback: nvm-managed happy
  if (!IS_WINDOWS) {
    const nvmHappy = path.join(HOME_DIR, ".nvm/versions/node/v20.20.2/lib/node_modules/happy/dist/index.mjs");
    if (fs.existsSync(nvmHappy)) return nvmHappy;
  }
  return "happy";
}

function getLocalPorts(): Set<string> {
  const ports = new Set<string>();
  try {
    const stdout = execSync(
      IS_WINDOWS ? `netstat -ano -p TCP` : `ss -tlnp 2>/dev/null`,
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
    );
    if (IS_WINDOWS) {
      for (const line of stdout.split("\n")) {
        if (!line.includes("127.0.0.1") || !line.includes("LISTENING")) continue;
        const m = line.trim().split(/\s+/)[1]?.match(/:(\d+)$/);
        if (m) ports.add(m[1]);
      }
    } else {
      for (const line of stdout.split("\n")) {
        const m = line.match(/127\.0\.0\.1:(\d+)/);
        if (m) ports.add(m[1]);
      }
    }
  } catch {}
  return ports;
}

async function changeTitleViaMcp(customName: string, baselinePorts: Set<string>): Promise<void> {
  const maxRetries = 120;
  const delayMs = 1000;
  const triedPorts = new Set<string>();

  for (let i = 0; i < maxRetries; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, delayMs));

    try {
      const currentPorts = getLocalPorts();
      for (const port of currentPorts) {
        // Skip ports that existed before spawn, and ports already tried
        if (baselinePorts.has(port) || triedPorts.has(port)) continue;
        triedPorts.add(port);

        try {
          const ac = new AbortController();
          setTimeout(() => ac.abort(), 2000);
          const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              method: "tools/call",
              params: { name: "change_title", arguments: { title: customName } },
              id: 1,
            }),
            signal: ac.signal,
          });
          const text = await res.text();
          if (text.includes("Successfully changed")) {
            console.log(`[executor] Title set to "${customName}" via port ${port}`);
            return;
          }
        } catch {}
      }
    } catch {}
  }
  console.log(`[executor] Failed to set title after ${maxRetries} retries`);
}

export function resumeSession(sessionId: string, customName?: string): Promise<{ success: boolean; output: string; command?: string }> {
  return new Promise((resolve) => {
    const jsonlPath = path.join(
      HOME_DIR, ".claude", "projects",
      // Try to resolve sessions dir dynamically
      ...(() => {
        try {
          const { SESSIONS_DIR } = require("../config");
          return [path.relative(path.join(HOME_DIR, ".claude", "projects"), SESSIONS_DIR)];
        } catch { return []; }
      })(),
      `${sessionId}.jsonl`
    );
    let firstUserText = "";
    try {
      if (fs.existsSync(jsonlPath)) {
        const raw = fs.readFileSync(jsonlPath, "utf-8").trim();
        const lines = raw.split("\n");
        const lineCount = lines.length;
        const thinkingCount = (raw.match(/"type":"thinking"/g) || []).length;
        const lastLine = JSON.parse(lines.pop() || "{}");
        console.log(`[resumeSession] sid=${sessionId.slice(0, 8)} jsonlLines=${lineCount} thinkingBlocks=${thinkingCount} lastType=${lastLine.type || "?"}`);
        // Extract first user message as title fallback when no customName is set
        for (const line of lines) {
          try {
            const d = JSON.parse(line);
            if (d.type === "user" && d.message?.content) {
              if (typeof d.message.content === "string") {
                firstUserText = d.message.content.slice(0, 80).replace(/\n/g, " ").trim();
              } else if (Array.isArray(d.message.content)) {
                const textBlock = d.message.content.find((b: any) => b.type === "text");
                if (textBlock?.text) firstUserText = textBlock.text.slice(0, 80).replace(/\n/g, " ").trim();
              }
            }
            if (!firstUserText && d.type === "queue-operation" && d.operation === "enqueue" && typeof d.content === "string") {
              firstUserText = d.content.slice(0, 80).replace(/\n/g, " ").trim();
            }
            if (firstUserText) break;
          } catch {}
        }
      }
    } catch (e) {
      console.log(`[resumeSession] sid=${sessionId.slice(0, 8)} could not read jsonl: ${(e as Error).message}`);
    }

    const happyBin = findHappyBin();

    let spawnCmd: string;
    let args: string[];

    const displayName = customName || firstUserText || "Session";
    const baseArgs = ["claude", "--name", displayName, "--happy-starting-mode", "remote", "--started-by", "daemon", "--resume", sessionId];

    if (happyBin.endsWith(".mjs")) {
      spawnCmd = process.execPath;
      args = ["--no-warnings", "--no-deprecation", happyBin, ...baseArgs];
    } else {
      spawnCmd = happyBin;
      args = baseArgs;
    }

    // Snapshot ports before spawn so we only try NEW ports for MCP
    const baselinePorts = getLocalPorts();

    console.log(`[resumeSession] displayName="${displayName}" customName=${customName || "(none)"} cmd=${spawnCmd} args=${args.join(" ")}`);

    let proc;
    if (happyBin.endsWith(".mjs")) {
      proc = spawn(spawnCmd, args, {
        cwd: HOME_DIR,
        detached: true,
        stdio: "ignore",
        env: process.env as Record<string, string>,
      });
    } else if (IS_WINDOWS) {
      // .cmd needs shell:true on Windows; pass full command string to avoid DEP0190
      proc = spawn(`"${spawnCmd}" ${args.map((a: string) => `"${a}"`).join(" ")}`, [], {
        cwd: HOME_DIR,
        detached: true,
        stdio: "ignore",
        env: process.env as Record<string, string>,
        shell: true,
      });
    } else {
      proc = spawn(spawnCmd, args, {
        cwd: HOME_DIR,
        detached: true,
        stdio: "ignore",
        env: process.env as Record<string, string>,
      });
    }

    const childPid = proc.pid;
    proc.unref();

    let settled = false;
    const settle = (result: { success: boolean; output: string; command?: string }) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    proc.on("error", (err) => {
      settle({ success: false, output: err.message, command: getResumeCommand(sessionId) });
    });

    // MCP call ensures the title sticks (--name flag may be ignored during --resume)
    changeTitleViaMcp(displayName, baselinePorts);

    setTimeout(() => {
      if (settled) return;
      try {
        proc.kill(0);
        settle({ success: true, output: "Session launching! Check Happy Code in ~10s." });
      } catch {
        settle({
          success: false,
          output: "Session process exited during startup. Try resuming from terminal.",
          command: getResumeCommand(sessionId),
        });
      }
    }, 3000);
  });
}

/**
 * Kill all running Claude SDK processes for the given session ID,
 * then restart via resumeSession. Used after a global mode switch.
 */
export function restartAllSessions(): number {
  console.log("[restartAllSessions] START");
  let count = 0;
  try {
    let cmdlineOutput: string;
    if (IS_WINDOWS) {
      cmdlineOutput = execSync(
        'powershell -NoProfile -Command "Get-CimInstance Win32_Process | Select-Object ProcessId,CommandLine | ConvertTo-Json -Depth 2 2>$null"',
        { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], timeout: 15000 }
      );
    } else {
      cmdlineOutput = execSync(
        "ps -eo args --no-headers 2>/dev/null | grep -E -- '--resume [a-f0-9-]{30,}' | grep -v grep || true",
        { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
      );
    }

    const ids = new Set<string>();
    if (IS_WINDOWS) {
      // JSON array of {ProcessId, CommandLine}
      try {
        const procs: Array<{ ProcessId: number; CommandLine: string | null }> = JSON.parse(cmdlineOutput);
        for (const p of (Array.isArray(procs) ? procs : [procs])) {
          const m = (p.CommandLine || "").match(/--resume\s+([a-f0-9-]{30,})/);
          if (m) ids.add(m[1]);
        }
      } catch {}
    } else {
      for (const line of cmdlineOutput.trim().split("\n")) {
        const m = line.match(/--resume\s+([a-f0-9-]{30,})/)?.[1];
        if (m) ids.add(m);
      }
    }

    const idList = [...ids];
    console.log(`[restartAllSessions] found ${idList.length} running: ${JSON.stringify(idList.map((id) => id.slice(0, 8)))}`);

    for (const sessionId of idList) {
      try {
        if (IS_WINDOWS) {
          execSync(
            `powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match '--resume ${sessionId}' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`,
            { stdio: "pipe", timeout: 10000 }
          );
        } else {
          execSync(
            `ps -eo pid,args --no-headers 2>/dev/null | grep -E -- '--resume ${sessionId}' | grep -v grep | awk '{print $1}' | xargs -r kill 2>/dev/null || true`,
            { stdio: "pipe" }
          );
          execSync(
            `ps -eo ppid=,args= --no-headers 2>/dev/null | grep "anthropic-ai/claude.*--resume ${sessionId}" | grep -v grep | awk '{print $1}' | xargs -r kill 2>/dev/null || true`,
            { stdio: "pipe" }
          );
        }
        const customName = getSessionMeta(sessionId)?.customName;
        resumeSession(sessionId, customName);
        count++;
        console.log(`[restartAllSessions] restarted sid=${sessionId.slice(0, 8)}`);
      } catch (e) {
        console.log(`[executor] Failed to restart session ${sessionId.slice(0, 8)}: ${(e as Error).message}`);
      }
    }
  } catch {}
  console.log(`[restartAllSessions] DONE restarted=${count}`);
  return count;
}
