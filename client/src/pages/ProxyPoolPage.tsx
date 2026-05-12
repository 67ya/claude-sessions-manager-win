import { useState, useEffect, useCallback } from "react";
import { fetchNodes, fetchProxyPool, fetchProxyPoolConfig, updateProxyPoolConfig } from "../api";
import type { ProxyPoolStatus } from "../types";

const LOCALHOST_ID = "_localhost";
const LOCALHOST_ENTRY = { id: LOCALHOST_ID, name: "This Machine", host: "localhost" };

function StatCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">{title}</h3>
      {children}
    </div>
  );
}

function ConfigBar({
  nodeId, config, onSaved,
}: {
  nodeId: string;
  config: { max_ip_count: number | string; max_concurrent_per_ip: number; wait_timeout_sec: number } | null;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  const handleEdit = () => {
    setValue(String(config?.max_ip_count ?? ""));
    setEditing(true);
  };

  const handleSave = async () => {
    const num = value.toLowerCase() === "unlimited" ? 0 : parseInt(value);
    if (isNaN(num) || num < 0) return;
    setSaving(true);
    try {
      await updateProxyPoolConfig(nodeId, { max_ip_count: num });
      setEditing(false);
      onSaved();
    } catch {
      // keep editing on failure
    }
    setSaving(false);
  };

  const displayCount = config?.max_ip_count === 0 || config?.max_ip_count === "unlimited"
    ? "Unlimited"
    : String(config?.max_ip_count ?? "?");

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-2.5 flex items-center gap-3 text-sm flex-wrap">
      <span className="text-gray-500 text-xs">Config</span>
      <span className="text-gray-600">|</span>
      <span className="text-gray-400 text-xs">Max IPs:</span>
      {editing ? (
        <>
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-xs w-24 text-gray-200 focus:outline-none focus:border-purple-500"
            placeholder="0 = unlimited"
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false); }}
          />
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-xs px-2 py-0.5 rounded bg-purple-600 text-white hover:bg-purple-500 disabled:opacity-50"
          >
            {saving ? "..." : "Save"}
          </button>
          <button
            onClick={() => setEditing(false)}
            className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-300 hover:bg-gray-600"
          >
            Cancel
          </button>
        </>
      ) : (
        <>
          <span className="text-purple-400 font-mono text-xs">{displayCount}</span>
          <button
            onClick={handleEdit}
            className="text-xs px-1.5 py-0.5 rounded text-gray-500 hover:text-gray-300 hover:bg-gray-800"
          >
            edit
          </button>
        </>
      )}
      {config && (
        <>
          <span className="text-gray-600">|</span>
          <span className="text-gray-500 text-xs">
            {config.max_concurrent_per_ip} slots/IP, timeout {config.wait_timeout_sec}s
          </span>
        </>
      )}
    </div>
  );
}

function ProxyPoolView({ data, error, config }: { data: ProxyPoolStatus | null; error: string | null; config: { max_ip_count: number | string } | null }) {
  if (error) {
    return (
      <div className="bg-gray-900 border border-red-900/60 rounded-xl p-6 text-center">
        <span className="text-4xl">🔌</span>
        <p className="mt-3 text-red-400 text-sm">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  if (data.notFound || data.error) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center">
        <span className="text-4xl">📭</span>
        <p className="mt-3 text-gray-500">No proxy pool on this node</p>
        {data.error && <p className="text-xs text-gray-600 mt-1">{data.error}</p>}
      </div>
    );
  }

  const remainingColor = (sec: number) =>
    sec < 60 ? "text-red-400" : sec < 120 ? "text-amber-400" : "text-green-400";

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 flex items-center gap-4 text-sm flex-wrap">
        <span className="text-green-400 font-medium">
          🟢 {data.total_active}
          <span className="text-gray-500">
            {config?.max_ip_count && config.max_ip_count !== "unlimited" && config.max_ip_count !== 0
              ? ` / ${config.max_ip_count}`
              : ""}{" "}
            active IP{data.total_active !== 1 ? "s" : ""}
          </span>
        </span>
        <span className="text-gray-600">|</span>
        <span className="text-purple-400">{data.total_concurrent} concurrent</span>
        <span className="text-gray-600">|</span>
        <span className={data.queue_length > 0 ? "text-amber-400" : "text-gray-400"}>
          Queue: {data.queue_length}
        </span>
        <span className="text-gray-600">|</span>
        <span className="text-xs text-gray-500">Updated: {data.timestamp}</span>
      </div>

      {/* Active slots */}
      <StatCard title={`Active Slots (${data.active_slots.length})`}>
        {data.active_slots.length === 0 ? (
          <div className="text-gray-600 text-xs py-2">No active slots</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-gray-800">
                  <th className="text-left py-1.5 px-2 font-medium">IP:Port</th>
                  <th className="text-right py-1.5 px-2 font-medium">Concurrent</th>
                  <th className="text-right py-1.5 px-2 font-medium">Requests</th>
                  <th className="text-right py-1.5 px-2 font-medium">Fails</th>
                  <th className="text-right py-1.5 px-2 font-medium">Remaining</th>
                  <th className="text-center py-1.5 px-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.active_slots.map((s) => (
                  <tr key={s.slot_id} className="border-b border-gray-800/30 hover:bg-gray-800/30">
                    <td className="py-1.5 px-2 font-mono text-gray-300">
                      {s.ip}:{s.port}
                    </td>
                    <td className="py-1.5 px-2 text-right">
                      <span className={s.concurrent_count >= s.max_concurrent ? "text-amber-400" : "text-gray-400"}>
                        {s.concurrent_count}/{s.max_concurrent}
                      </span>
                    </td>
                    <td className="py-1.5 px-2 text-right text-gray-400">{s.total_requests}</td>
                    <td className="py-1.5 px-2 text-right">
                      <span className={s.fail_count >= 2 ? "text-red-400" : s.fail_count > 0 ? "text-amber-400" : "text-gray-400"}>
                        {s.fail_count}
                      </span>
                    </td>
                    <td className="py-1.5 px-2 text-right">
                      <span className={remainingColor(s.remaining_seconds)}>
                        {Math.floor(s.remaining_seconds / 60)}m {s.remaining_seconds % 60}s
                      </span>
                    </td>
                    <td className="py-1.5 px-2 text-center">
                      {s.is_expired ? (
                        <span className="text-red-400 text-xs">Expired</span>
                      ) : !s.alive ? (
                        <span className="text-red-400 text-xs">Dead</span>
                      ) : s.concurrent_count >= s.max_concurrent ? (
                        <span className="text-amber-400 text-xs">Full</span>
                      ) : (
                        <span className="text-green-400 text-xs">Ready</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </StatCard>

      {/* Usage quotas */}
      {data.usage.length > 0 && (
        <StatCard title="Usage Quotas">
          <div className="space-y-2">
            {data.usage.map((u, i) => {
              const pct = u.daily_limit > 0 ? (u.used / u.daily_limit) * 100 : 0;
              const barColor = pct > 90 ? "bg-red-500" : pct > 70 ? "bg-amber-500" : "bg-green-500";
              return (
                <div key={i}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-400">{u.name}</span>
                    <span className="text-gray-500">
                      {u.used}/{u.daily_limit} (exp: {u.expire_date})
                    </span>
                  </div>
                  <div className="w-full bg-gray-800 rounded-full h-1.5">
                    <div
                      className={`${barColor} h-1.5 rounded-full transition-all`}
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </StatCard>
      )}

      {/* Recent logs */}
      {data.logs.length > 0 && (
        <StatCard title="Recent Logs">
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {data.logs.slice(-10).reverse().map((l, i) => (
              <div key={i} className="text-xs text-gray-500 flex gap-2">
                <span className="text-gray-600 shrink-0">{l.time}</span>
                <span className="text-gray-400 truncate">{l.msg}</span>
              </div>
            ))}
          </div>
        </StatCard>
      )}

      {/* Dead slots */}
      {data.dead_slots.length > 0 && (
        <StatCard title={`Dead Slots (${data.dead_slots.length})`}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-gray-800">
                  <th className="text-left py-1.5 px-2 font-medium">IP:Port</th>
                  <th className="text-right py-1.5 px-2 font-medium">Requests</th>
                  <th className="text-right py-1.5 px-2 font-medium">Failures</th>
                </tr>
              </thead>
              <tbody>
                {data.dead_slots.map((s) => (
                  <tr key={s.slot_id} className="border-b border-gray-800/30">
                    <td className="py-1.5 px-2 font-mono text-red-400">{s.ip}:{s.port}</td>
                    <td className="py-1.5 px-2 text-right text-gray-500">{s.total_requests}</td>
                    <td className="py-1.5 px-2 text-right text-red-400">{s.fail_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </StatCard>
      )}
    </div>
  );
}

export default function ProxyPoolPage() {
  const [nodes, setNodes] = useState<Array<{ id: string; name: string; host: string }>>([]);
  const [selectedNode, setSelectedNode] = useState<string>("");
  const [data, setData] = useState<ProxyPoolStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [config, setConfig] = useState<{ max_ip_count: number | string; max_concurrent_per_ip: number; wait_timeout_sec: number } | null>(null);

  useEffect(() => {
    fetchNodes().then((r) => {
      setNodes(r.nodes);
      // Auto-select localhost on first load
      setSelectedNode((prev) => prev || LOCALHOST_ID);
    });
  }, []);

  const loadConfig = useCallback(async (nodeId: string) => {
    try {
      const cfg = await fetchProxyPoolConfig(nodeId);
      setConfig(cfg);
    } catch {
      setConfig(null);
    }
  }, []);

  const loadProxyPool = useCallback(async (nodeId: string) => {
    setError(null);
    try {
      const res = await fetchProxyPool(nodeId);
      setData(res);
    } catch (e: any) {
      setError(e.message || "Failed to load proxy pool data");
    }
  }, []);

  useEffect(() => {
    if (!selectedNode || !autoRefresh) return;
    loadProxyPool(selectedNode);
    loadConfig(selectedNode);
    const interval = setInterval(() => {
      loadProxyPool(selectedNode);
      loadConfig(selectedNode);
    }, 3000);
    return () => clearInterval(interval);
  }, [selectedNode, autoRefresh, loadProxyPool, loadConfig]);

  const handleNodeChange = (nodeId: string) => {
    setSelectedNode(nodeId);
    setData(null);
    setError(null);
    setConfig(null);
    if (nodeId) {
      loadProxyPool(nodeId);
      loadConfig(nodeId);
    }
  };

  // Merge localhost + managed nodes for the selector
  const allNodes = [LOCALHOST_ENTRY, ...nodes];

  return (
    <div className="p-3 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4 md:mb-6 gap-2 flex-wrap">
        <h2 className="text-lg font-semibold">Proxy Pool</h2>
        <div className="flex items-center gap-2 md:gap-3 flex-wrap">
          <select
            value={selectedNode}
            onChange={(e) => handleNodeChange(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-purple-500 max-w-[200px]"
          >
            <option value="">Select a node...</option>
            {allNodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name} ({n.host})
              </option>
            ))}
          </select>
          {selectedNode && (
            <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded"
              />
              Auto-refresh (3s)
            </label>
          )}
        </div>
      </div>

      {!selectedNode && (
        <div className="text-center py-20 text-gray-500">
          <span className="text-4xl">🔄</span>
          <p className="mt-4">Select a node to view proxy pool status</p>
        </div>
      )}

      {error && (
        <div className="mb-4 px-4 py-2 bg-red-900/30 text-red-300 text-sm rounded-lg flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="hover:text-white">✕</button>
        </div>
      )}

      {selectedNode && !data?.notFound && (
        <div className="mb-4">
          <ConfigBar
            nodeId={selectedNode}
            config={config}
            onSaved={() => loadConfig(selectedNode)}
          />
        </div>
      )}

      {selectedNode && !data && !error && (
        <div className="flex justify-center py-12">
          <div className="animate-spin w-6 h-6 border-2 border-purple-400 border-t-transparent rounded-full" />
        </div>
      )}

      <ProxyPoolView data={data} error={error} config={config} />
    </div>
  );
}
