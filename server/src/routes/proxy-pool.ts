import { Router, Request, Response } from "express";
import * as os from "os";
import { getNode } from "../services/nodes";
import { execCommand } from "../services/ssh";
import type { ProxyPoolStatus } from "../types";

const router = Router({ mergeParams: true });

const CACHE_TTL_MS = 15 * 1000;
const CACHE_STALE_MS = 5 * 1000;
const REFRESH_AFTER_MS = 3 * 1000;

const poolCache = new Map<string, { ts: number; data: ProxyPoolStatus }>();
const refreshing = new Set<string>();

const LOCALHOST_ID = "_localhost";

function isLocalhostNode(nodeId: string): boolean {
  if (nodeId === LOCALHOST_ID) return true;
  const node = getNode(nodeId);
  return node ? node.host === "127.0.0.1" || node.host === "localhost" || node.host === "::1" || node.host === os.hostname() : false;
}

async function fetchFromLocalhost(): Promise<ProxyPoolStatus> {
  const res = await fetch("http://127.0.0.1:8888/status", { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json() as ProxyPoolStatus;
  json.error = undefined;
  json.notFound = false;
  return json;
}

async function fetchViaSSH(node: ReturnType<typeof getNode>): Promise<ProxyPoolStatus> {
  if (!node) throw new Error("Node not found");
  const { stdout } = await execCommand(node, "curl -s --max-time 5 http://localhost:8888/status 2>/dev/null || echo 'NOT_FOUND'", 10000);
  if (stdout.includes("NOT_FOUND") || !stdout.trim()) {
    return {
      active_slots: [], dead_slots: [], total_active: 0, total_concurrent: 0,
      queue_length: 0, logs: [], usage: [], timestamp: new Date().toISOString(),
      error: "Proxy pool service not reachable", notFound: true,
    };
  }
  const json = JSON.parse(stdout.trim()) as ProxyPoolStatus;
  json.notFound = false;
  return json;
}

async function fetchProxyPool(nodeId: string): Promise<ProxyPoolStatus> {
  if (isLocalhostNode(nodeId)) {
    return fetchFromLocalhost();
  }
  const node = getNode(nodeId);
  if (!node) throw new Error("Node not found");
  return fetchViaSSH(node);
}

async function getCachedOrFetch(nodeId: string): Promise<ProxyPoolStatus> {
  const cached = poolCache.get(nodeId);
  const age = cached ? Date.now() - cached.ts : Infinity;

  if (cached && age < CACHE_STALE_MS) {
    if (age > REFRESH_AFTER_MS && !refreshing.has(nodeId)) {
      refreshing.add(nodeId);
      fetchProxyPool(nodeId).then(d => {
        poolCache.set(nodeId, { ts: Date.now(), data: d });
      }).finally(() => refreshing.delete(nodeId));
    }
    return cached.data;
  }

  if (cached && !refreshing.has(nodeId)) {
    refreshing.add(nodeId);
    fetchProxyPool(nodeId).then(d => {
      poolCache.set(nodeId, { ts: Date.now(), data: d });
    }).finally(() => refreshing.delete(nodeId));
    return cached.data;
  }

  const data = await fetchProxyPool(nodeId);
  try { poolCache.set(nodeId, { ts: Date.now(), data }); } catch {}
  return data;
}

function execOnNode(nodeId: string, command: string, timeout = 10000): Promise<string> {
  if (isLocalhostNode(nodeId)) {
    // For localhost, the service runs on 127.0.0.1:8888
    return fetch(`http://127.0.0.1:8888${command}`, { signal: AbortSignal.timeout(5000) }).then(r => r.text());
  }
  const node = getNode(nodeId);
  if (!node) throw new Error("Node not found");
  return execCommand(node, `curl -s --max-time 5 http://localhost:8888${command} 2>/dev/null`, timeout).then(r => r.stdout);
}

router.get("/", async (req: Request, res: Response) => {
  try {
    const nodeId = req.params.nodeId;
    // Validate that non-localhost nodes exist
    if (nodeId !== LOCALHOST_ID && !getNode(nodeId)) {
      res.status(404).json({ error: "Node not found" });
      return;
    }
    const data = await getCachedOrFetch(nodeId);
    res.json(data);
  } catch (e: any) {
    res.json({
      active_slots: [], dead_slots: [], total_active: 0, total_concurrent: 0,
      queue_length: 0, logs: [], usage: [], timestamp: new Date().toISOString(),
      error: e.message || "Failed to fetch proxy pool status",
      notFound: true,
    } satisfies ProxyPoolStatus);
  }
});

router.get("/slots", async (req: Request, res: Response) => {
  try {
    const nodeId = req.params.nodeId;
    if (nodeId !== LOCALHOST_ID && !getNode(nodeId)) {
      res.status(404).json({ error: "Node not found" }); return;
    }
    const text = await execOnNode(nodeId, "/slots");
    res.json(JSON.parse(text.trim()));
  } catch {
    res.status(502).json({ error: "Proxy pool service unreachable" });
  }
});

router.get("/config", async (req: Request, res: Response) => {
  try {
    const nodeId = req.params.nodeId;
    if (nodeId !== LOCALHOST_ID && !getNode(nodeId)) {
      res.status(404).json({ error: "Node not found" }); return;
    }
    const text = await execOnNode(nodeId, "/config");
    res.json(JSON.parse(text.trim()));
  } catch {
    res.status(502).json({ error: "Proxy pool service unreachable" });
  }
});

router.post("/config", async (req: Request, res: Response) => {
  try {
    const nodeId = req.params.nodeId;
    if (nodeId !== LOCALHOST_ID && !getNode(nodeId)) {
      res.status(404).json({ error: "Node not found" }); return;
    }
    const body = JSON.stringify(req.body);
    if (isLocalhostNode(nodeId)) {
      const r = await fetch("http://127.0.0.1:8888/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(5000),
      });
      const text = await r.text();
      res.json(JSON.parse(text.trim()));
    } else {
      const node = getNode(nodeId)!;
      const escaped = body.replace(/'/g, "'\\''");
      const { stdout } = await execCommand(
        node,
        `curl -s --max-time 5 -X POST http://localhost:8888/config -H 'Content-Type: application/json' -d '${escaped}'`,
        10000
      );
      res.json(JSON.parse(stdout.trim()));
    }
  } catch {
    res.status(502).json({ error: "Proxy pool service unreachable" });
  }
});

export default router;
