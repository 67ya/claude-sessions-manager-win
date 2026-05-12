import * as fs from "fs";
import * as path from "path";

export interface DeployPreset {
  id: string;
  name: string;
  repoUrl: string;
  branch: string;
  script: string;
  description?: string;
}

interface PresetsStore {
  version: 1;
  presets: DeployPreset[];
}

const PRESETS_PATH = "/home/ctyun/.claude/deploy-presets.json";

function load(): PresetsStore {
  try {
    if (fs.existsSync(PRESETS_PATH)) {
      return JSON.parse(fs.readFileSync(PRESETS_PATH, "utf-8"));
    }
  } catch {}
  return { version: 1, presets: [] };
}

function save(store: PresetsStore): void {
  fs.mkdirSync(path.dirname(PRESETS_PATH), { recursive: true });
  fs.writeFileSync(PRESETS_PATH, JSON.stringify(store, null, 2));
}

let idCounter = 0;
function generateId(): string {
  idCounter = (idCounter + 1) % 10000;
  return `preset-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

export function getAllPresets(): DeployPreset[] {
  return load().presets;
}

export function getPreset(id: string): DeployPreset | undefined {
  return load().presets.find((p) => p.id === id);
}

export function addPreset(data: Omit<DeployPreset, "id">): DeployPreset {
  const store = load();
  const preset: DeployPreset = { ...data, id: generateId() };
  store.presets.push(preset);
  save(store);
  return preset;
}

export function updatePreset(id: string, data: Partial<Omit<DeployPreset, "id">>): DeployPreset | undefined {
  const store = load();
  const preset = store.presets.find((p) => p.id === id);
  if (!preset) return undefined;
  Object.assign(preset, data);
  save(store);
  return preset;
}

export function deletePreset(id: string): boolean {
  const store = load();
  const idx = store.presets.findIndex((p) => p.id === id);
  if (idx === -1) return false;
  store.presets.splice(idx, 1);
  save(store);
  return true;
}

// Seed initial presets for the user's projects
export function seedDefaultPresets(): void {
  const store = load();
  const existingUrls = new Set(store.presets.map((p) => p.repoUrl));
  const existingNames = new Set(store.presets.map((p) => p.name));

  const defaults: Omit<DeployPreset, "id">[] = [
    {
      name: "emailSDK",
      repoUrl: "https://github.com/67ya/email-assistant.git",
      branch: "main",
      script: "",
      description: "邮件助手 SDK，包含 email_sdk 模块",
    },
    {
      name: "连环画生成",
      repoUrl: "https://github.com/67ya/comic-memorizer.git",
      branch: "main",
      script: `pip3 install -r requirements.txt 2>/dev/null || true
pkill python3 2>/dev/null || true
nohup python3 server.py > /tmp/comic-memorizer.log 2>&1 &
sleep 1
echo "服务已在后台启动 ✓"`,
      description: "连环画/漫画记忆器，Python Flask 项目",
    },
    {
      name: "Claude Code",
      repoUrl: "",
      branch: "main",
      script: `npm install -g @anthropic-ai/claude-code 2>&1
echo "Claude Code installed/updated ✓"
claude --version 2>&1 || echo "(version check skipped)"`,
      description: "Claude Code CLI — npm 全局安装，无 GitHub 仓库",
    },
    {
      name: "Happy",
      repoUrl: "https://github.com/slopus/happy.git",
      branch: "main",
      script: `npm install -g happy 2>&1 || (git clone https://github.com/slopus/happy.git /tmp/happy-build && cd /tmp/happy-build && npm install && npm run build && npm link && echo "Happy built from source ✓")`,
      description: "Happy CLI — npm 全局安装或源码构建",
    },
  ];

  let changed = false;
  for (const d of defaults) {
    const exists = d.repoUrl
      ? existingUrls.has(d.repoUrl)
      : existingNames.has(d.name);
    if (!exists) {
      store.presets.push({ ...d, id: generateId() });
      changed = true;
    }
  }

  if (changed) save(store);
}
