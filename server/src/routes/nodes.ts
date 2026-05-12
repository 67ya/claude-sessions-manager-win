import { Router, Request, Response } from "express";
import {
  getAllNodes,
  getNode,
  addNode,
  updateNode,
  deleteNode,
  getGroups,
} from "../services/nodes";
import { testConnection } from "../services/ssh";

const router = Router();

// List all nodes
router.get("/", (_req: Request, res: Response) => {
  const safe = getAllNodes().map(({ password, privateKey, ...n }) => ({
    ...n,
    hasPassword: !!password,
    hasKey: !!privateKey,
  }));
  res.json({ nodes: safe, groups: getGroups() });
});

// Get single node
router.get("/:id", (req: Request, res: Response) => {
  const node = getNode(req.params.id);
  if (!node) {
    res.status(404).json({ error: "Node not found" });
    return;
  }
  // Never return password/key
  const { password, privateKey, ...safe } = node;
  res.json({ ...safe, hasPassword: !!password, hasKey: !!privateKey });
});

// Add node
router.post("/", (req: Request, res: Response) => {
  const { name, host, port, username, authMethod, password, privateKey, group, tags } = req.body;
  if (!name || !host || !username) {
    res.status(400).json({ error: "name, host, username required" });
    return;
  }
  const node = addNode({
    name,
    host,
    port: port || 22,
    username,
    authMethod: authMethod || "password",
    password: authMethod === "key" ? undefined : password,
    privateKey: authMethod === "key" ? privateKey : undefined,
    group: group || "",
    tags: tags || [],
  });
  const { password: _, privateKey: __, ...safe } = node;
  res.json(safe);
});

// Update node
router.patch("/:id", (req: Request, res: Response) => {
  const node = updateNode(req.params.id, req.body);
  if (!node) {
    res.status(404).json({ error: "Node not found" });
    return;
  }
  const { password, privateKey, ...safe } = node;
  res.json({ ...safe, hasPassword: !!password, hasKey: !!privateKey });
});

// Delete node
router.delete("/:id", (req: Request, res: Response) => {
  const deleted = deleteNode(req.params.id);
  if (!deleted) {
    res.status(404).json({ error: "Node not found" });
    return;
  }
  res.json({ success: true });
});

// Test SSH connection
router.post("/:id/test", async (req: Request, res: Response) => {
  const node = getNode(req.params.id);
  if (!node) {
    res.status(404).json({ error: "Node not found" });
    return;
  }
  const result = await testConnection(node);
  // Update node status
  updateNode(req.params.id, {
    status: result.ok ? "online" : "offline",
    lastSeen: new Date().toISOString(),
  });
  res.json(result);
});

export default router;
