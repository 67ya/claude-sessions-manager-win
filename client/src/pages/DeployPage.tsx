import { useState, useEffect, useRef, useCallback } from "react";
import { fetchNodes, startDeploy, fetchDeployJobs, getDeployLogsUrl, fetchDeployPresets, addDeployPreset, deleteDeployPreset } from "../api";
import type { DeployJob, DeployPreset } from "../types";

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "bg-gray-700 text-gray-300",
    running: "bg-blue-900/50 text-blue-300",
    success: "bg-green-900/50 text-green-300",
    failed: "bg-red-900/50 text-red-300",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[status] || colors.pending}`}>
      {status}
    </span>
  );
}

export default function DeployPage() {
  const [nodes, setNodes] = useState<Array<{ id: string; name: string; host: string; tags: string[] }>>([]);
  const [presets, setPresets] = useState<DeployPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [selectedNode, setSelectedNode] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [script, setScript] = useState("");
  const [jobs, setJobs] = useState<DeployJob[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddPreset, setShowAddPreset] = useState(false);
  const [presetName, setPresetName] = useState("");
  const logEndRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    fetchNodes().then((r) => setNodes(r.nodes));
    loadJobs();
    loadPresets();
  }, []);

  const loadJobs = async () => {
    try { const res = await fetchDeployJobs(); setJobs(res.jobs); } catch {}
  };

  const loadPresets = async () => {
    try { const res = await fetchDeployPresets(); setPresets(res.presets); } catch {}
  };

  // Apply preset to form
  const handlePresetSelect = (presetId: string) => {
    setSelectedPresetId(presetId);
    if (!presetId) return;
    const p = presets.find((x) => x.id === presetId);
    if (p) {
      setRepoUrl(p.repoUrl);
      setBranch(p.branch || "main");
      setScript(p.script || "");
    }
  };

  // Save current form as preset
  const handleSavePreset = async () => {
    const name = presetName.trim();
    if (!name) { setError("Preset name required"); return; }
    try {
      await addDeployPreset({ name, repoUrl, branch, script });
      setPresetName("");
      setShowAddPreset(false);
      await loadPresets();
    } catch (e: any) {
      setError(e.message || "Save preset failed");
    }
  };

  const handleDeletePreset = async (id: string) => {
    if (!confirm("Delete this preset?")) return;
    try {
      await deleteDeployPreset(id);
      if (selectedPresetId === id) setSelectedPresetId("");
      await loadPresets();
    } catch {}
  };

  // Close SSE on unmount
  useEffect(() => { return () => { esRef.current?.close(); }; }, []);

  // Auto-scroll log
  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [jobs]);

  const handleDeploy = async () => {
    if (!selectedNode || !repoUrl) return;
    setDeploying(true);
    setError(null);
    try {
      const job = await startDeploy({ nodeId: selectedNode, repoUrl, branch: branch || "main", script });
      setActiveJobId(job.id);
      setJobs((prev) => [job, ...prev]);

      const es = new EventSource(getDeployLogsUrl(job.id));
      esRef.current = es;
      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.done) { es.close(); esRef.current = null; loadJobs(); setDeploying(false); }
          if (data.line) {
            setJobs((prev) => prev.map((j) =>
              j.id === job.id ? { ...j, logs: [...j.logs, data.line], status: data.done ? (data.status as DeployJob["status"]) : "running" } : j
            ));
          }
        } catch {}
      };
      es.onerror = () => { es.close(); esRef.current = null; setDeploying(false); loadJobs(); };
    } catch (e: any) {
      setError(e.message || "Deploy failed");
      setDeploying(false);
    }
  };

  const viewJobLogs = useCallback((job: DeployJob) => {
    setActiveJobId(job.id);
    esRef.current?.close();
    if (job.status === "running" || job.status === "pending") {
      const es = new EventSource(getDeployLogsUrl(job.id));
      esRef.current = es;
      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.done) { es.close(); esRef.current = null; loadJobs(); }
          if (data.line) {
            setJobs((prev) => prev.map((j) =>
              j.id === job.id ? { ...j, logs: [...j.logs, data.line], status: data.done ? (data.status as DeployJob["status"]) : "running" } : j
            ));
          }
        } catch {}
      };
      es.onerror = () => { es.close(); esRef.current = null; loadJobs(); };
    }
  }, []);

  const activeJob = jobs.find((j) => j.id === activeJobId);

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-3rem)]">
      {/* Left panel */}
      <div className="lg:w-96 shrink-0 border-r border-gray-800 overflow-y-auto p-3 md:p-4 space-y-4">
        <h2 className="text-lg font-semibold">Deploy</h2>

        {/* Preset selector */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-gray-500">Preset</label>
            <button
              onClick={() => setShowAddPreset(!showAddPreset)}
              className="text-xs text-purple-400 hover:text-purple-300"
            >
              {showAddPreset ? "Cancel" : "+ Save current as preset"}
            </button>
          </div>
          <select
            value={selectedPresetId}
            onChange={(e) => handlePresetSelect(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
          >
            <option value="">Custom (manual input)</option>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.description ? `— ${p.description.slice(0, 40)}` : ""}
              </option>
            ))}
          </select>
          {/* Inline preset management */}
          {presets.length > 0 && (
            <div className="mt-1.5 space-y-0.5 max-h-32 overflow-y-auto">
              {presets.map((p) => (
                <div key={p.id} className="flex items-center gap-1 text-xs">
                  <span
                    className={`flex-1 truncate cursor-pointer px-1.5 py-0.5 rounded hover:bg-gray-800 ${selectedPresetId === p.id ? "text-purple-300" : "text-gray-500"}`}
                    onClick={() => handlePresetSelect(p.id)}
                  >
                    {p.name}
                    <span className="text-gray-600 ml-1 truncate">{p.repoUrl ? p.repoUrl.split("/").pop()?.replace(".git","") : "(no url)"}</span>
                  </span>
                  <button
                    onClick={() => handleDeletePreset(p.id)}
                    className="text-gray-600 hover:text-red-400 px-1 shrink-0"
                    title="Delete preset"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Save as preset form */}
        {showAddPreset && (
          <div className="bg-gray-800/50 rounded-lg p-3 space-y-2">
            <input
              type="text"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="Preset name (e.g. emailSDK)"
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-purple-500"
              autoFocus
            />
            <button
              onClick={handleSavePreset}
              className="w-full py-1.5 text-xs rounded bg-purple-600 hover:bg-purple-500"
            >
              Save Preset
            </button>
          </div>
        )}

        {/* Node selector */}
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Target Node</label>
          <select
            value={selectedNode}
            onChange={(e) => setSelectedNode(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
          >
            <option value="">Select node...</option>
            {nodes.map((n) => (
              <option key={n.id} value={n.id}>{n.name} ({n.host})</option>
            ))}
          </select>
          {selectedNode && (() => {
            const node = nodes.find(n => n.id === selectedNode);
            if (node?.tags?.length) {
              return (
                <div className="flex gap-1 mt-1.5">
                  {node.tags.map(tag => (
                    <span key={tag} className={`px-1.5 py-0.5 rounded text-xs ${
                      tag === "海外" ? "bg-blue-900/40 text-blue-300" : "bg-green-900/40 text-green-300"
                    }`}>
                      {tag}
                    </span>
                  ))}
                </div>
              );
            }
            return null;
          })()}
        </div>

        {/* Repo URL */}
        <div>
          <label className="text-xs text-gray-500 mb-1 block">
            Repository URL
            {!repoUrl && <span className="text-purple-400 ml-1">(script-only mode)</span>}
          </label>
          <input
            type="text"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="https://gitee.com/user/repo.git (国内优先) 或 GitHub URL"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500 placeholder-gray-600"
          />
          {repoUrl && repoUrl.includes("github.com") && (
            <p className="text-xs text-amber-400/70 mt-1">
              GitHub URL 将被自动转换为 Gitee 地址，确保国内服务器可访问
            </p>
          )}
        </div>

        {/* Branch */}
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Branch</label>
          <input
            type="text"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
          />
        </div>

        {/* Deploy script */}
        <div>
          <label className="text-xs text-gray-500 mb-1 block">
            Deploy Script <span className="text-gray-600">(optional)</span>
          </label>
          <textarea
            value={script}
            onChange={(e) => setScript(e.target.value)}
            rows={4}
            placeholder="npm install&#10;npm run build&#10;pm2 restart app"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500 placeholder-gray-600 font-mono resize-y"
          />
        </div>

        {/* Deploy button */}
        <button
          onClick={handleDeploy}
          disabled={deploying || !selectedNode}
          className="w-full py-2.5 text-sm rounded-lg bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 transition-colors font-medium"
        >
          {deploying ? "⏳ Deploying..." : "🚀 Start Deploy"}
        </button>

        {error && (
          <div className="px-3 py-2 bg-red-900/30 text-red-300 text-xs rounded-lg flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="hover:text-white">✕</button>
          </div>
        )}

        {/* Job history */}
        <div>
          <h3 className="text-sm font-medium text-gray-400 mb-2">History</h3>
          {jobs.length === 0 ? (
            <p className="text-xs text-gray-600">No deployments yet</p>
          ) : (
            <div className="space-y-1.5">
              {jobs.map((job) => (
                <button
                  key={job.id}
                  onClick={() => viewJobLogs(job)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                    activeJobId === job.id
                      ? "bg-purple-900/30 border border-purple-800/50"
                      : "bg-gray-800/50 hover:bg-gray-800 border border-transparent"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-gray-300 truncate flex-1">
                      {job.nodeName}: {job.repoUrl.split("/").pop()?.replace(".git", "")}
                    </span>
                    <StatusBadge status={job.status} />
                  </div>
                  <div className="text-gray-600 mt-0.5">
                    {new Date(job.createdAt).toLocaleString("zh-CN")}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right panel: Log output */}
      <div className="flex-1 flex flex-col min-h-0">
        {!activeJob ? (
          <div className="flex-1 flex items-center justify-center text-gray-600">
            <div className="text-center">
              <span className="text-4xl">🚀</span>
              <p className="mt-4">Select a deployment or start a new one</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800 shrink-0">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-300 font-medium">{activeJob.nodeName}</span>
                <span className="text-gray-600">:</span>
                <code className="text-xs text-purple-400">{activeJob.branch}</code>
                <StatusBadge status={activeJob.status} />
              </div>
              <button
                onClick={() => { esRef.current?.close(); esRef.current = null; setActiveJobId(null); }}
                className="text-gray-500 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto bg-gray-950 p-3 md:p-4 font-mono text-xs leading-relaxed">
              {activeJob.logs.length === 0 && activeJob.status === "pending" && (
                <span className="text-gray-600">Waiting to start...</span>
              )}
              {activeJob.logs.map((line, i) => (
                <div
                  key={i}
                  className={`${
                    line.startsWith("[ERROR]") || line.includes("error") ? "text-red-400"
                      : line.startsWith("[") ? "text-cyan-400"
                      : "text-gray-400"
                  }`}
                >
                  {line}
                </div>
              ))}
              {activeJob.status === "running" && (
                <span className="inline-block w-2 h-4 bg-purple-400 animate-pulse ml-1 align-middle" />
              )}
              <div ref={logEndRef} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
