import { Router, Request, Response } from "express";
import { execSync } from "child_process";
import { getNode } from "../services/nodes";
import { execCommand } from "../services/ssh";

const router = Router({ mergeParams: true });

export interface MonitorSnapshot {
  hostname: string;
  uptime: string;
  loadAvg: { "1min": number; "5min": number; "10min": number };
  cpu: { model: string; cores: number; usagePercent: number };
  memory: { total: string; used: string; free: string; usagePercent: number };
  disk: Array<{ filesystem: string; size: string; used: string; available: string; mountpoint: string; usagePercent: number }>;
  processes: { total: number; top5: Array<{ pid: string; cpu: string; mem: string; command: string }> };
  network: { hostname: string; interfaces: Array<{ name: string; ip: string }> };
  error?: string;
}

// Monitor cache: 10-minute ring buffer per node
const monitorCache = new Map<string, Array<{ timestamp: number; snapshot: MonitorSnapshot }>>();
const refreshing = new Set<string>();   // nodes currently being refreshed
const CACHE_TTL_MS = 10 * 60 * 1000;   // 10 min ring buffer
const CACHE_STALE_MS = 30 * 1000;       // return cached if < 30s old (smooth switching)
const REFRESH_AFTER_MS = 15 * 1000;     // trigger background refresh if > 15s old

// Parse linux memory + cpu + disk commands
function parseMonitorData(stdoutParts: Record<string, string>): MonitorSnapshot {
  const snapshot: MonitorSnapshot = {
    hostname: "",
    uptime: "",
    loadAvg: { "1min": 0, "5min": 0, "10min": 0 },
    cpu: { model: "", cores: 0, usagePercent: 0 },
    memory: { total: "0", used: "0", free: "0", usagePercent: 0 },
    disk: [],
    processes: { total: 0, top5: [] },
    network: { hostname: "", interfaces: [] },
  };

  try {
    // hostname
    const hostname = stdoutParts.hostname?.trim() || "";
    snapshot.hostname = hostname;
    snapshot.network.hostname = hostname;

    // uptime
    const up = stdoutParts.uptime?.trim() || "";
    if (up) {
      const m = up.match(/up\s+(.+?),\s+user\s*=\s*(\d+)/);
      if (m) {
        const dur = m[1].trim();
        const users = m[2];
        snapshot.uptime = `${dur} (${users} user${users !== "1" ? "s" : ""})`;
      } else {
        snapshot.uptime = up;
      }
    }

    // load average
    const loadRaw = stdoutParts.loadavg?.trim() || "";
    if (loadRaw) {
      const parts = loadRaw.split(/\s+/);
      if (parts.length >= 3) {
        snapshot.loadAvg["1min"] = parseFloat(parts[0]) || 0;
        snapshot.loadAvg["5min"] = parseFloat(parts[1]) || 0;
        snapshot.loadAvg["10min"] = parseFloat(parts[2]) || 0;
      }
    }

    // CPU info
    const cpuInfo = stdoutParts.cpuinfo?.trim() || "";
    if (cpuInfo) {
      const modelMatch = cpuInfo.match(/model name\s*:\s*(.+)/i);
      snapshot.cpu.model = modelMatch ? modelMatch[1].trim() : "";
      const cores = cpuInfo.match(/processor/g);
      snapshot.cpu.cores = cores ? cores.length : 0;
    }
    // CPU usage from top
    const cpuUsage = stdoutParts.cpuusage?.trim() || "";
    if (cpuUsage) {
      // top -bn2 output, parse %Cpu(s): 1.2 us, 2.3 sy, ...
      const idMatch = cpuUsage.match(/(\d+\.?\d*)\s*id/);
      if (idMatch) {
        snapshot.cpu.usagePercent = Math.round((100 - parseFloat(idMatch[1])) * 10) / 10;
      }
    }

    // memory
    const memRaw = stdoutParts.memory?.trim() || "";
    if (memRaw) {
      // free -m output, parse Mem: line
      const m = memRaw.match(/Mem:\s+(\d+)\s+(\d+)\s+(\d+)/);
      if (m) {
        const total = parseInt(m[1]);
        const used = parseInt(m[2]);
        const free = parseInt(m[3]);
        snapshot.memory = {
          total: total >= 1024 ? `${(total / 1024).toFixed(1)}G` : `${total}M`,
          used: used >= 1024 ? `${(used / 1024).toFixed(1)}G` : `${used}M`,
          free: free >= 1024 ? `${(free / 1024).toFixed(1)}G` : `${free}M`,
          usagePercent: total > 0 ? Math.round((used / total) * 1000) / 10 : 0,
        };
      }
    }

    // disk
    const diskRaw = stdoutParts.disk?.trim() || "";
    if (diskRaw) {
      const lines = diskRaw.split("\n").slice(1); // skip header
      for (const line of lines) {
        const cols = line.trim().split(/\s+/);
        if (cols.length >= 6) {
          snapshot.disk.push({
            filesystem: cols[0],
            size: cols[1],
            used: cols[2],
            available: cols[3],
            usagePercent: parseInt(cols[4]) || 0,
            mountpoint: cols[5],
          });
        }
      }
    }

    // processes
    const psRaw = stdoutParts.processes?.trim() || "";
    if (psRaw) {
      const lines = psRaw.split("\n");
      snapshot.processes.total = lines.length;
      for (const line of lines) {
        const cols = line.trim().split(/\s+/);
        if (cols.length >= 4) {
          snapshot.processes.top5.push({
            pid: cols[0],
            cpu: cols[1],
            mem: cols[2],
            command: cols.slice(3).join(" ").slice(0, 60),
          });
        }
      }
    }

    // network interfaces
    const ipOut = stdoutParts.ipaddr?.trim() || "";
    if (ipOut) {
      const lines = ipOut.split("\n");
      for (let i = 0; i < lines.length; i += 2) {
        if (i + 1 < lines.length) {
          const name = lines[i].trim().replace(/:$/, "");
          const ipm = lines[i + 1].trim().match(/inet\s+(\S+)/);
          snapshot.network.interfaces.push({
            name,
            ip: ipm ? ipm[1] : "N/A",
          });
        }
      }
    }
  } catch {
    // Return partial data on parse errors
  }

  return snapshot;
}

// All monitor commands combined into one SSH call (much faster than 9 connections)
const ALL_COMMANDS = [
  "echo '---HOSTNAME---'", "hostname",
  "echo '---UPTIME---'", "uptime -p; uptime | grep -Po 'user[= ]+\\d+'",
  "echo '---LOADAVG---'", "cat /proc/loadavg",
  "echo '---CPUINFO---'", "cat /proc/cpuinfo | grep 'model name\\|processor' | sort | uniq -c",
  "echo '---CPUUSAGE---'", "top -bn2 | grep '%Cpu' | tail -1",
  "echo '---MEMORY---'", "free -m 2>/dev/null || free",
  "echo '---DISK---'", "df -h --type=ext4 --type=xfs --type=btrfs 2>/dev/null | grep -v '^Filesystem'|| df -h | grep '^/'",
  "echo '---PROCESSES---'", "ps -eo pid,pcpu,pmem,comm --sort=-pcpu 2>/dev/null | head -6 | tail -5 || ps aux --sort=-%cpu | head -6 | tail -5 | awk '{print $2,$3,$4,$11}'",
  "echo '---IPADDR---'", "ip -4 addr show 2>/dev/null | grep -E '^[0-9]|inet ' || ifconfig 2>/dev/null | grep -E '^[a-z]|inet '",
].join("; ");

const CMD_KEYS = ["hostname","uptime","loadavg","cpuinfo","cpuusage","memory","disk","processes","ipaddr"];

async function fetchLocalhostAndCache(): Promise<MonitorSnapshot> {
  const LOCALHOST_ID = "_localhost";
  try {
    const stdout = execSync(ALL_COMMANDS, { encoding: "utf-8", timeout: 15000, stdio: ["pipe", "pipe", "pipe"] });
    const parts: Record<string, string> = {};
    let currentKey = "";
    for (const line of stdout.split("\n")) {
      const m = line.match(/^---(\w+)---$/);
      if (m) {
        currentKey = CMD_KEYS.find(k => k.toLowerCase() === m[1].toLowerCase()) || "";
      } else if (currentKey) {
        parts[currentKey] = (parts[currentKey] || "") + line + "\n";
      }
    }
    const snapshot = parseMonitorData(parts);

    let entries = monitorCache.get(LOCALHOST_ID) || [];
    entries.push({ timestamp: Date.now(), snapshot });
    const cutoff = Date.now() - CACHE_TTL_MS;
    entries = entries.filter(e => e.timestamp > cutoff);
    if (entries.length > 60) entries = entries.slice(-60);
    monitorCache.set(LOCALHOST_ID, entries);

    return snapshot;
  } catch {
    const errSnapshot: MonitorSnapshot = {
      hostname: "", uptime: "",
      loadAvg: { "1min": 0, "5min": 0, "10min": 0 },
      cpu: { model: "", cores: 0, usagePercent: 0 },
      memory: { total: "0", used: "0", free: "0", usagePercent: 0 },
      disk: [], processes: { total: 0, top5: [] },
      network: { hostname: "", interfaces: [] },
      error: "Local monitoring failed",
    };
    return errSnapshot;
  }
}

async function fetchAndCache(node: any): Promise<MonitorSnapshot> {
  try {
    const { stdout } = await execCommand(node, ALL_COMMANDS, 15000);
    // Split combined output by delimiters
    const parts: Record<string, string> = {};
    let currentKey = "";
    for (const line of stdout.split("\n")) {
      const m = line.match(/^---(\w+)---$/);
      if (m) {
        currentKey = CMD_KEYS.find(k => k.toLowerCase() === m[1].toLowerCase()) || "";
      } else if (currentKey) {
        parts[currentKey] = (parts[currentKey] || "") + line + "\n";
      }
    }

    const snapshot = parseMonitorData(parts);

    // Store in ring buffer
    let entries = monitorCache.get(node.id) || [];
    entries.push({ timestamp: Date.now(), snapshot });
    const cutoff = Date.now() - CACHE_TTL_MS;
    entries = entries.filter(e => e.timestamp > cutoff);
    if (entries.length > 60) entries = entries.slice(-60);
    monitorCache.set(node.id, entries);

    return snapshot;
  } catch {
    // Return error snapshot
    const errSnapshot: MonitorSnapshot = {
      hostname: "", uptime: "",
      loadAvg: { "1min": 0, "5min": 0, "10min": 0 },
      cpu: { model: "", cores: 0, usagePercent: 0 },
      memory: { total: "0", used: "0", free: "0", usagePercent: 0 },
      disk: [], processes: { total: 0, top5: [] },
      network: { hostname: "", interfaces: [] },
      error: "SSH connection failed",
    };
    // Don't cache error snapshots
    return errSnapshot;
  }
}

function getNodeIdAndCacheKey(nodeId: string) {
  if (nodeId === "_localhost") return { nodeId: "_localhost", cacheKey: "_localhost", isLocal: true as const };
  const node = getNode(nodeId);
  if (!node) return { nodeId, cacheKey: "", isLocal: false as const, notFound: true as const };
  return { nodeId: node.id, cacheKey: node.id, isLocal: false as const, node };
}

router.get("/", async (req: Request, res: Response) => {
  const info = getNodeIdAndCacheKey(req.params.nodeId);
  if ("notFound" in info && info.notFound) {
    res.status(404).json({ error: "Node not found" });
    return;
  }

  const cacheKey = info.cacheKey;
  const cached = monitorCache.get(cacheKey);
  const latestCached = cached && cached.length > 0 ? cached[cached.length - 1] : null;
  const age = latestCached ? Date.now() - latestCached.timestamp : Infinity;

  // Fresh cache → return immediately
  if (latestCached && age < CACHE_STALE_MS) {
    if (age > REFRESH_AFTER_MS && !refreshing.has(cacheKey)) {
      refreshing.add(cacheKey);
      (info.isLocal ? fetchLocalhostAndCache() : fetchAndCache(info.node!)).finally(() => refreshing.delete(cacheKey));
    }
    return res.json(latestCached.snapshot);
  }

  // Stale cache exists → return it while refreshing in background
  if (latestCached && !refreshing.has(cacheKey)) {
    refreshing.add(cacheKey);
    (info.isLocal ? fetchLocalhostAndCache() : fetchAndCache(info.node!)).finally(() => refreshing.delete(cacheKey));
    return res.json(latestCached.snapshot);
  }

  // No cache → must wait for fresh data
  const snapshot = info.isLocal ? await fetchLocalhostAndCache() : await fetchAndCache(info.node!);
  res.json(snapshot);
});

// History endpoint: returns last 10 minutes of monitor snapshots
router.get("/history", (req: Request, res: Response) => {
  const info = getNodeIdAndCacheKey(req.params.nodeId);
  if ("notFound" in info && info.notFound) {
    res.status(404).json({ error: "Node not found" });
    return;
  }
  const entries = monitorCache.get(info.cacheKey) || [];
  const cutoff = Date.now() - CACHE_TTL_MS;
  const recent = entries.filter(e => e.timestamp > cutoff);
  res.json({
    nodeId: info.nodeId,
    history: recent.map(e => ({ timestamp: e.timestamp, ...e.snapshot })),
  });
});

export default router;
