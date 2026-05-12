import * as fs from "fs";
import * as path from "path";
import type { ManagedNode, NodesStore } from "../types";

const NODES_PATH = "/home/ctyun/.claude/nodes.json";

function loadStore(): NodesStore {
  try {
    if (fs.existsSync(NODES_PATH)) {
      return JSON.parse(fs.readFileSync(NODES_PATH, "utf-8"));
    }
  } catch {}
  return { version: 1, nodes: {}, groups: [] };
}

function saveStore(store: NodesStore): void {
  fs.mkdirSync(path.dirname(NODES_PATH), { recursive: true });
  fs.writeFileSync(NODES_PATH, JSON.stringify(store, null, 2));
}

let idCounter = 0;
function generateId(): string {
  const ts = Date.now().toString(36);
  idCounter = (idCounter + 1) % 1000;
  return `node-${ts}-${idCounter.toString(36).padStart(3, "0")}`;
}

export function getAllNodes(): ManagedNode[] {
  return Object.values(loadStore().nodes);
}

export function getNode(id: string): ManagedNode | undefined {
  return loadStore().nodes[id];
}

export function addNode(data: Omit<ManagedNode, "id" | "status" | "lastSeen">): ManagedNode {
  const store = loadStore();
  const node: ManagedNode = {
    ...data,
    id: generateId(),
    status: "unknown",
  };
  store.nodes[node.id] = node;
  if (data.group && !store.groups.includes(data.group)) {
    store.groups.push(data.group);
  }
  saveStore(store);
  return node;
}

export function updateNode(
  id: string,
  data: Partial<Omit<ManagedNode, "id">>
): ManagedNode | undefined {
  const store = loadStore();
  const node = store.nodes[id];
  if (!node) return undefined;
  Object.assign(node, data);
  if (data.group && !store.groups.includes(data.group)) {
    store.groups.push(data.group);
  }
  saveStore(store);
  return node;
}

export function deleteNode(id: string): boolean {
  const store = loadStore();
  if (!store.nodes[id]) return false;
  delete store.nodes[id];
  saveStore(store);
  return true;
}

export function getGroups(): string[] {
  return loadStore().groups;
}
